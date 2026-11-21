import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ads/CategoryBarSection';
import { useCatalogCounts, useCatalogNodes } from '@/hooks/useCatalog';
import { pageStripRow, useDeleteHomeRow, useSaveHomeRows, useWebHomeLayout } from '@/hooks/useHomeShelves';
import { HOME_SECTION_META } from '@/lib/appearance';
import { ancestorsOf, NODE_TYPE_LABELS, type CatalogNode } from '@/lib/catalogTree';
import { reorderRelative, stepInList } from '@/lib/dragSort';
import {
  BLOCK_DEFAULTS, BOOK_RELATED_KEY, pageStripOf, resolveHomeBlocks, rowsFor, type HomeBlock,
} from '@/lib/homeBlocks';
import { parseShelfLimit, shelfKeyFor } from '@/lib/homeShelves';
import { Grip, gripButtonClass, useDragRows } from './useDragRows';

const BOOK_RELATED_DEFAULT = { title: 'كتب قد تعجبك', limit: 4 };

/**
 * The website's home page, top to bottom, in one list: the standard blocks and the category shelves in ONE order (drag to
 * move), each shown or hidden, with its own title, the line under it and how many books it holds. Below it, the strip on a
 * book's page. (The banner above, the offers bar and the category bar under the header have their own tabs.)
 */
export default function HomeBlocksEditor() {
  const { data: rows = [], isLoading } = useWebHomeLayout();
  const { data: nodes = [] } = useCatalogNodes();
  const { data: counts } = useCatalogCounts();
  const save = useSaveHomeRows();
  const remove = useDeleteHomeRow();

  const blocks = useMemo(() => resolveHomeBlocks(rows), [rows]);
  const shelfCount = blocks.filter((b) => b.std === null).length;

  /** null = nothing open, 'new' = adding a shelf, otherwise the key of the block being edited */
  const [editing, setEditing] = useState<string | null>(null);
  const [nodeId, setNodeId] = useState('');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [limit, setLimit] = useState('');
  const [problem, setProblem] = useState('');

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const labelOf = (node: CatalogNode) => {
    const path = ancestorsOf(nodes, node.id).map((a) => a.name_ar);
    return `${NODE_TYPE_LABELS[node.type]}: ${[...path, node.name_ar].join(' ‹ ')}`;
  };
  const taken = new Set(blocks.map((b) => b.nodeId));
  const choices = nodes
    .filter((n) => n.is_active && n.show_web && (!taken.has(n.id) || shelfKeyFor(n.id) === editing))
    .sort((a, b) => labelOf(a).localeCompare(labelOf(b), 'ar'));

  const editingBlock = blocks.find((b) => b.key === editing) ?? null;
  const fields = editingBlock?.std ? BLOCK_DEFAULTS[editingBlock.std].editable : ['title', 'subtitle', 'limit'];

  const open = (block: HomeBlock | null) => {
    setEditing(block ? block.key : 'new');
    setNodeId(block?.nodeId ?? '');
    setTitle(block?.title ?? '');
    setSubtitle(block?.subtitle ?? '');
    setLimit(block?.limit != null ? String(block.limit) : '');
    setProblem('');
  };
  const close = () => { setEditing(null); setProblem(''); };

  const saveBlocks = (next: HomeBlock[]) => save.mutateAsync(rowsFor(next));
  const move = (keys: string[] | null) => {
    if (!keys) return;
    void saveBlocks(keys.map((k) => blocks.find((b) => b.key === k)!));
  };
  const keys = blocks.map((b) => b.key);
  const dnd = useDragRows({ onDrop: (dragId, targetId, zone) => move(reorderRelative(keys, dragId, targetId, zone === 'after' ? 'after' : 'before')) });

  const submit = async () => {
    const parsed = parseShelfLimit(limit);
    if (editing === 'new' && !nodeId) { setProblem('اختار التصنيف أو السلسلة الأول.'); return; }
    if (parsed === 'invalid') { setProblem('العدد رقم من 1 لـ60، أو سيبه فاضي.'); return; }
    try {
      if (editing === 'new') {
        const shelf: HomeBlock = {
          key: shelfKeyFor(nodeId), std: null, nodeId, title: title.trim() || null, subtitle: subtitle.trim() || null,
          limit: parsed, visible: true, sortOrder: blocks.length, saved: false,
        };
        await saveBlocks([...blocks, shelf]);
      } else if (editingBlock) {
        await saveBlocks(blocks.map((b) => (b.key !== editingBlock.key ? b : {
          ...b,
          title: fields.includes('title') ? title.trim() || null : b.title,
          subtitle: fields.includes('subtitle') ? subtitle.trim() || null : b.subtitle,
          limit: fields.includes('limit') ? parsed : b.limit,
        })));
      }
      close();
    } catch {
      // the message is already shown
    }
  };

  const nameOf = (b: HomeBlock) => (b.std ? (b.title ?? HOME_SECTION_META[b.std].label) : b.title || byId.get(b.nodeId ?? '')?.name_ar || 'عنصر محذوف أو مخفي');
  const hintOf = (b: HomeBlock) => {
    if (b.std) {
      const d = BLOCK_DEFAULTS[b.std];
      const bits = [HOME_SECTION_META[b.std].hint];
      if (b.limit != null && d.editable.includes('limit')) bits.push(`${d.limitLabel ?? 'العدد'}: ${b.limit}`);
      return bits.join(' · ');
    }
    const node = byId.get(b.nodeId ?? '');
    const total = b.nodeId ? counts?.get(b.nodeId)?.total : undefined;
    return [
      node ? labelOf(node) : 'مش ظاهر للموقع (مخفي أو اتحذف)، فالرف مش هيظهر',
      total != null ? `${total} كتاب` : null,
      b.limit != null ? `أول ${b.limit}` : null,
    ].filter(Boolean).join(' · ');
  };

  // the strip on a book's page
  const related = pageStripOf(rows, BOOK_RELATED_KEY) ?? { visible: true, title: null, limit: null };
  const [relTitle, setRelTitle] = useState<string | null>(null);
  const [relLimit, setRelLimit] = useState<string | null>(null);
  const saveRelated = (patch: Partial<typeof related>) =>
    save.mutate([pageStripRow(BOOK_RELATED_KEY, { ...related, ...patch })]);
  const submitRelated = () => {
    const parsed = parseShelfLimit(relLimit ?? (related.limit != null ? String(related.limit) : ''));
    if (parsed === 'invalid' || (parsed != null && parsed > 12)) { setProblem('عدد الكتب في «كتب قد تعجبك» من 1 لـ12.'); return; }
    setProblem('');
    saveRelated({ title: (relTitle ?? related.title ?? '').trim() || null, limit: parsed });
    setRelTitle(null);
    setRelLimit(null);
  };

  return (
    <div className="space-y-6" data-testid="home-blocks">
      <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 flex flex-col md:flex-row md:items-center gap-3 justify-between border-b border-gray-50">
          <div>
            <h2 className="text-lg font-bold text-gray-800">ترتيب الصفحة الرئيسية في الموقع</h2>
            <p className="text-sm text-gray-500 mt-1">
              كل أقسام الصفحة ورفوف التصنيفات في قايمة واحدة: اسحب أي واحد لمكانه، أقفله أو افتحه، وغيّر عنوانه وعدد كتبه. البانر في الأعلى ثابت
              (صوره من «صور الصفحة الرئيسية»). {shelfCount > 0 && 'لما فيه رفوف مختارة، «صفوف التصنيفات» التلقائية بتسكت وتاخد الرفوف مكانها.'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link to="/appearance" className="text-sm font-semibold text-blue-600 hover:underline whitespace-nowrap">«مظهر المتجر»</Link>
            <button type="button" onClick={() => open(null)} className="btn-primary flex items-center gap-1.5 whitespace-nowrap" data-testid="shelf-add">
              <Plus size={15} /> إضافة رف تصنيف
            </button>
          </div>
        </div>

        {editing !== null && (
          <div className="p-5 bg-gray-50 border-b border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-3" data-testid="shelf-form">
            {editing === 'new' && (
              <label className="block md:col-span-3">
                <span className="block text-sm font-semibold text-gray-700 mb-1.5">التصنيف / السلسلة</span>
                <select value={nodeId} onChange={(e) => { setNodeId(e.target.value); setProblem(''); }} className="input-field" data-testid="shelf-node">
                  <option value="">— اختار —</option>
                  {choices.map((n) => <option key={n.id} value={n.id}>{labelOf(n)}</option>)}
                </select>
              </label>
            )}
            {fields.includes('title') && (
              <label className={`block ${fields.includes('subtitle') ? '' : 'md:col-span-2'}`}>
                <span className="block text-sm font-semibold text-gray-700 mb-1.5">العنوان (اختياري)</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-field" maxLength={80}
                  placeholder={editingBlock?.std ? BLOCK_DEFAULTS[editingBlock.std].title : byId.get(nodeId)?.name_ar ?? 'لو فاضي بنكتب اسم التصنيف'} data-testid="shelf-title" />
              </label>
            )}
            {fields.includes('subtitle') && (
              <label className="block">
                <span className="block text-sm font-semibold text-gray-700 mb-1.5">السطر تحت العنوان (اختياري)</span>
                <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className="input-field" maxLength={120}
                  placeholder={editingBlock?.std ? BLOCK_DEFAULTS[editingBlock.std].subtitle ?? '' : 'لو فاضي بنكتب سطر جاهز'} data-testid="shelf-subtitle" />
              </label>
            )}
            {fields.includes('limit') && (
              <label className="block">
                <span className="block text-sm font-semibold text-gray-700 mb-1.5">{editingBlock?.std ? BLOCK_DEFAULTS[editingBlock.std].limitLabel ?? 'العدد' : 'عدد الكتب'} (اختياري)</span>
                <input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="numeric" className="input-field"
                  placeholder={editingBlock?.std && BLOCK_DEFAULTS[editingBlock.std].limit != null ? String(BLOCK_DEFAULTS[editingBlock.std].limit) : 'الكل'} data-testid="shelf-limit" />
              </label>
            )}
            {problem && <p className="md:col-span-3 text-sm text-red-600" data-testid="shelf-problem">{problem}</p>}
            <div className="md:col-span-3 flex items-center gap-2">
              <button type="button" onClick={() => void submit()} disabled={save.isPending} className="btn-primary flex items-center gap-1.5 disabled:opacity-50" data-testid="shelf-save">
                {save.isPending && <Loader2 size={14} className="animate-spin" />} {editing === 'new' ? 'إضافة الرف' : 'حفظ'}
              </button>
              <button type="button" onClick={close} className="btn-secondary">إلغاء</button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="py-10 flex justify-center text-gray-400"><Loader2 className="animate-spin" /></div>
        ) : (
          <ol className="divide-y divide-gray-50">
            {blocks.map((block, i) => {
              const name = nameOf(block);
              const replaced = block.std === 'categories' && shelfCount > 0;
              const canEdit = block.std === null || BLOCK_DEFAULTS[block.std].editable.length > 0;
              return (
                <li
                  key={block.key}
                  className={`flex items-center gap-3 px-4 py-3 ${dnd.rowClass(block.key)}`}
                  data-testid={block.std ? `home-block-${block.std}` : 'shelf-row'}
                  data-kind={block.std ? 'standard' : 'shelf'}
                  {...dnd.rowProps(block.key)}
                >
                  <button type="button" className={gripButtonClass} data-testid="drag-handle" {...dnd.handleProps(block.key, name, (dir) => move(stepInList(keys, block.key, dir)))}><Grip /></button>
                  <span className="w-6 text-xs text-gray-400 text-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${block.visible && !replaced ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                      {name}
                      {block.std === null && <span className="mr-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 no-underline">رف تصنيف</span>}
                      {replaced && <span className="mr-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700">بدلها الرفوف المختارة</span>}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{hintOf(block)}</p>
                  </div>
                  <Switch checked={block.visible} label={`إظهار ${name}`} onChange={(v) => void saveBlocks(blocks.map((b) => (b.key === block.key ? { ...b, visible: v } : b)))} />
                  {canEdit ? (
                    <button type="button" onClick={() => open(block)} className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-600" aria-label={`تعديل ${name}`}><Pencil size={14} /></button>
                  ) : <span className="w-[30px]" />}
                  {block.std === null ? (
                    <button
                      type="button"
                      onClick={() => { if (window.confirm(`حذف رف «${name}» من الصفحة الرئيسية؟ (التصنيف نفسه وكتبه مش بيتأثروا)`)) remove.mutate(block.key); }}
                      className="p-1.5 rounded-lg hover:bg-red-100 text-red-500"
                      aria-label={`حذف رف ${name}`}
                    ><Trash2 size={14} /></button>
                  ) : <span className="w-[30px]" />}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="bg-white rounded-2xl shadow-sm p-5 space-y-3" data-testid="page-strips">
        <div>
          <h2 className="text-lg font-bold text-gray-800">أشرطة الصفحات التانية</h2>
          <p className="text-sm text-gray-500 mt-1">صفحة العنصر (سلسلة/قسم) أشرطتها من «الشجرة ← صفحة العرض»، وشريط الشحن المجاني من «إدارة الإعلانات والأشرطة». الباقي هنا:</p>
        </div>
        <div className="rounded-xl border border-gray-100 p-4 space-y-3" data-testid="page-strip-book-related">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">«كتب قد تعجبك» في صفحة الكتاب</p>
              <p className="text-xs text-gray-400">كتب من نفس تصنيف الكتاب اللي بيتفرج عليه الزائر.</p>
            </div>
            <Switch checked={related.visible} label="إظهار كتب قد تعجبك" onChange={(v) => saveRelated({ visible: v })} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <label className="block md:col-span-2">
              <span className="block text-xs font-semibold text-gray-600 mb-1">العنوان</span>
              <input value={relTitle ?? related.title ?? ''} onChange={(e) => setRelTitle(e.target.value)} className="input-field" maxLength={80} placeholder={BOOK_RELATED_DEFAULT.title} data-testid="related-title" />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">عدد الكتب (1–12)</span>
              <input value={relLimit ?? (related.limit != null ? String(related.limit) : '')} onChange={(e) => setRelLimit(e.target.value)} inputMode="numeric" className="input-field" placeholder={String(BOOK_RELATED_DEFAULT.limit)} data-testid="related-limit" />
            </label>
          </div>
          <button type="button" onClick={submitRelated} disabled={save.isPending || (relTitle === null && relLimit === null)} className="btn-secondary disabled:opacity-40" data-testid="related-save">حفظ</button>
        </div>
      </section>
    </div>
  );
}
