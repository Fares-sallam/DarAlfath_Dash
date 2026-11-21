import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ads/CategoryBarSection';
import { useCatalogCounts, useCatalogNodes } from '@/hooks/useCatalog';
import {
  useDeleteShelf, useHomeShelves, useReorderShelves, useSaveShelf, useSetShelfVisible,
} from '@/hooks/useHomeShelves';
import { ancestorsOf, NODE_TYPE_LABELS, type CatalogNode } from '@/lib/catalogTree';
import { reorderRelative, stepInList } from '@/lib/dragSort';
import { parseShelfLimit, shelfKeyFor, type HomeShelf } from '@/lib/homeShelves';
import { Grip, gripButtonClass, useDragRows } from './useDragRows';

/**
 * The category shelves of the website's home page: which categories (or series, or sections) get a shelf of books under
 * the home page's banner, in what order, with what title and how many books. They are drawn where the «صفوف التصنيفات»
 * block sits in «مظهر المتجر»; with no shelves here the website shows the first three categories, as it always did.
 */
export default function HomeShelvesSection() {
  const { data: shelves = [], isLoading } = useHomeShelves();
  const { data: nodes = [] } = useCatalogNodes();
  const { data: counts } = useCatalogCounts();
  const save = useSaveShelf();
  const setVisible = useSetShelfVisible();
  const remove = useDeleteShelf();
  const reorder = useReorderShelves();

  /** null = nothing open, 'new' = adding, otherwise the key of the shelf being edited */
  const [editing, setEditing] = useState<string | null>(null);
  const [nodeId, setNodeId] = useState('');
  const [title, setTitle] = useState('');
  const [limit, setLimit] = useState('');
  const [problem, setProblem] = useState('');

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const labelOf = (node: CatalogNode) => {
    const path = ancestorsOf(nodes, node.id).map((a) => a.name_ar);
    return `${NODE_TYPE_LABELS[node.type]}: ${[...path, node.name_ar].join(' ‹ ')}`;
  };
  const taken = new Set(shelves.map((s) => s.node_id));
  const choices = nodes
    .filter((n) => n.is_active && n.show_web && (!taken.has(n.id) || shelfKeyFor(n.id) === editing))
    .sort((a, b) => labelOf(a).localeCompare(labelOf(b), 'ar'));

  const open = (shelf: HomeShelf | null) => {
    setEditing(shelf ? shelf.section_key : 'new');
    setNodeId(shelf?.node_id ?? '');
    setTitle(shelf?.title_ar ?? '');
    setLimit(shelf?.item_limit != null ? String(shelf.item_limit) : '');
    setProblem('');
  };
  const close = () => { setEditing(null); setProblem(''); };

  const submit = async () => {
    const parsed = parseShelfLimit(limit);
    if (!nodeId) { setProblem('اختار التصنيف أو السلسلة الأول.'); return; }
    if (parsed === 'invalid') { setProblem('عدد الكتب رقم من 1 لـ60، أو سيبه فاضي لكل الكتب.'); return; }
    const existing = shelves.find((s) => s.section_key === editing);
    try {
      await save.mutateAsync({
        nodeId, title: title.trim() || null, limit: parsed,
        visible: existing?.visible ?? true,
        sortOrder: existing?.sort_order ?? (shelves.length === 0 ? 0 : Math.max(...shelves.map((s) => s.sort_order)) + 1),
      });
      close();
    } catch {
      // the message is already shown
    }
  };

  const keys = shelves.map((s) => s.section_key);
  const move = (ids: string[] | null) => { if (ids) reorder.mutate(ids); };
  const dnd = useDragRows({ onDrop: (dragId, targetId, zone) => move(reorderRelative(keys, dragId, targetId, zone === 'after' ? 'after' : 'before')) });

  return (
    <section className="bg-white rounded-2xl shadow-sm overflow-hidden" data-testid="home-shelves">
      <div className="p-5 flex flex-col md:flex-row md:items-center gap-3 justify-between border-b border-gray-50">
        <div>
          <h2 className="text-lg font-bold text-gray-800">رفوف التصنيفات في الصفحة الرئيسية (الموقع)</h2>
          <p className="text-sm text-gray-500 mt-1">
            اختار التصنيفات أو السلاسل اللي يبقى ليها رف كتب تحت البانر، ورتّبها بالسحب. بتظهر في مكان «صفوف التصنيفات» من «مظهر المتجر»
            (اللي منه بتحدد ترتيب باقي الأقسام وإخفاءها). لو مفيش رفوف هنا، الموقع بيعرض أول 3 تصنيفات زي ما كان.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link to="/appearance" className="text-sm font-semibold text-blue-600 hover:underline whitespace-nowrap">«مظهر المتجر»</Link>
          <button type="button" onClick={() => open(null)} className="btn-primary flex items-center gap-1.5 whitespace-nowrap" data-testid="shelf-add">
            <Plus size={15} /> إضافة رف
          </button>
        </div>
      </div>

      {editing !== null && (
        <div className="p-5 bg-gray-50 border-b border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-3" data-testid="shelf-form">
          <label className="block md:col-span-3">
            <span className="block text-sm font-semibold text-gray-700 mb-1.5">التصنيف / السلسلة</span>
            <select value={nodeId} onChange={(e) => { setNodeId(e.target.value); setProblem(''); }} disabled={editing !== 'new'} className="input-field" data-testid="shelf-node">
              <option value="">— اختار —</option>
              {choices.map((n) => <option key={n.id} value={n.id}>{labelOf(n)}</option>)}
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="block text-sm font-semibold text-gray-700 mb-1.5">عنوان الرف (اختياري)</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-field" maxLength={80} placeholder={byId.get(nodeId)?.name_ar ?? 'لو فاضي بنكتب اسم التصنيف'} data-testid="shelf-title" />
          </label>
          <label className="block">
            <span className="block text-sm font-semibold text-gray-700 mb-1.5">عدد الكتب (اختياري)</span>
            <input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="numeric" className="input-field" placeholder="كل الكتب" data-testid="shelf-limit" />
          </label>
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
      ) : shelves.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-gray-400" data-testid="shelves-empty">مفيش رفوف مختارة. الموقع بيعرض أول 3 تصنيفات تلقائيًا.</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {shelves.map((shelf, i) => {
            const node = shelf.node_id ? byId.get(shelf.node_id) : undefined;
            const name = shelf.title_ar?.trim() || node?.name_ar || 'عنصر محذوف أو مخفي';
            const total = shelf.node_id ? counts?.get(shelf.node_id)?.total : undefined;
            return (
              <li key={shelf.section_key} className={`flex items-center gap-3 px-4 py-3 ${dnd.rowClass(shelf.section_key)}`} data-testid="shelf-row" {...dnd.rowProps(shelf.section_key)}>
                <button type="button" className={gripButtonClass} data-testid="drag-handle" {...dnd.handleProps(shelf.section_key, name, (dir) => move(stepInList(keys, shelf.section_key, dir)))}><Grip /></button>
                <span className="w-6 text-xs text-gray-400 text-center">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${shelf.visible ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{name}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {node ? labelOf(node) : 'مش ظاهر للموقع (مخفي أو اتحذف)، فالرف مش هيظهر'}
                    {total != null && ` · ${total} كتاب`}
                    {shelf.item_limit != null && ` · أول ${shelf.item_limit}`}
                  </p>
                </div>
                <Switch checked={shelf.visible} label={`إظهار رف ${name}`} onChange={(v) => setVisible.mutate({ key: shelf.section_key, visible: v })} />
                <button type="button" onClick={() => open(shelf)} className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-600" aria-label={`تعديل رف ${name}`}><Pencil size={14} /></button>
                <button
                  type="button"
                  onClick={() => { if (window.confirm(`حذف رف «${name}» من الصفحة الرئيسية؟ (التصنيف نفسه وكتبه مش بيتأثروا)`)) remove.mutate(shelf.section_key); }}
                  className="p-1.5 rounded-lg hover:bg-red-100 text-red-500"
                  aria-label={`حذف رف ${name}`}
                ><Trash2 size={14} /></button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
