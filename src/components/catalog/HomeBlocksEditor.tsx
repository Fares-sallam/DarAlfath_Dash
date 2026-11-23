import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Copy, Eye, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ads/CategoryBarSection';
import { useCatalogCounts, useCatalogNodes } from '@/hooks/useCatalog';
import { pageStripRow, useApplyHomeLayout, useDeleteHomeRow, useHomeLayoutRows, useSaveHomeRows } from '@/hooks/useHomeShelves';
import { useCountries } from '@/hooks/useSettings';
import { ancestorsOf, homeShelfIssue, homeShelfNodes, NODE_TYPE_LABELS, type CatalogNode } from '@/lib/catalogTree';
import { reorderRelative, stepInList } from '@/lib/dragSort';
import { blockFromDraft, blocksWithDraft, draftFromBlock, newDraft, type BlockDraft } from '@/lib/homeBlockDraft';
import {
  BLOCK_META, BOOK_RELATED_KEY, BOOK_SHELF_KIND, CUSTOM_META, FILTER_SHELF_KIND, FILTER_SOURCES, PAGE_STRIP_KIND, PROMO_KIND, blockDefaults, bookShelfIds,
  copyLayout, filterSourceOf, hasCustomLook, newBlockKey, pageStripOf, promoOf, resolveHomeBlocks, rowsFor, scheduleState, type HomeBlock, type HomeChannel,
} from '@/lib/homeBlocks';
import { SHELF_KIND, parseShelfLimit, shelfKeyFor } from '@/lib/homeShelves';
import HomeBlockForm from './HomeBlockForm';
import HomePreview from './HomePreview';
import { Grip, gripButtonClass, useDragRows } from './useDragRows';

const DEVICE_SHORT = { mobile: 'الموبايل بس', desktop: 'الكمبيوتر بس' } as const;
const dayOf = (iso: string) => new Date(iso).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' });

const BOOK_RELATED_DEFAULT = { title: 'كتب قد تعجبك', limit: 4 };

/**
 * A channel's home page (the website's or the app's), top to bottom, in one list: the standard blocks and the category
 * shelves in ONE order (drag to move), each shown or hidden, with its own title, the line under it and how many books it
 * holds. On the website, below it, the strip on a book's page. (The banner above, the offers bar and the category bar have
 * their own tabs.)
 */
export default function HomeBlocksEditor({ channel }: { channel: HomeChannel }) {
  const isApp = channel === 'app';
  const { data: rows = [], isLoading } = useHomeLayoutRows(channel);
  const { data: nodes = [] } = useCatalogNodes();
  const { data: counts } = useCatalogCounts();
  const save = useSaveHomeRows(channel);
  const remove = useDeleteHomeRow(channel);
  const apply = useApplyHomeLayout();
  const busy = save.isPending || remove.isPending || apply.isPending;
  const other: HomeChannel = isApp ? 'web' : 'app';
  const { data: otherRows = [] } = useHomeLayoutRows(other);
  const { data: countries = [] } = useCountries();
  const countryName = (code: string) => countries.find((c) => c.code.toUpperCase() === code)?.name ?? code;

  const blocks = useMemo(() => resolveHomeBlocks(rows, channel), [rows, channel]);
  const shelfCount = blocks.filter((b) => b.kind === SHELF_KIND).length;
  const now = new Date();

  /** null = nothing open, otherwise the form (a new block when its key is null) */
  const [draft, setDraft] = useState<BlockDraft | null>(null);
  const [problem, setProblem] = useState('');

  // the preview beside the list: the page as it would be with the open form saved (it remembers whether it was open)
  const [previewOpen, setPreviewOpen] = useState(() => {
    try { return window.localStorage.getItem('home-preview-open') === '1'; } catch { return false; }
  });
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'desktop'>('mobile');
  const togglePreview = () => {
    setPreviewOpen((open) => {
      try { window.localStorage.setItem('home-preview-open', open ? '0' : '1'); } catch { /* not remembered */ }
      return !open;
    });
  };

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const channelName = isApp ? 'التطبيق' : 'الموقع';
  const labelOf = (node: CatalogNode) => {
    const path = ancestorsOf(nodes, node.id).map((a) => a.name_ar);
    return `${NODE_TYPE_LABELS[node.type]}: ${[...path, node.name_ar].join(' ‹ ')}`;
  };
  const editingBlock = draft?.key ? blocks.find((b) => b.key === draft.key) ?? null : null;
  const taken = new Set(blocks.filter((b) => b.kind === SHELF_KIND).map((b) => b.nodeId));
  const channelNodes = homeShelfNodes(nodes, channel)
    .sort((a, b) => labelOf(a).localeCompare(labelOf(b), 'ar'));
  const currentNode = draft?.nodeId ? byId.get(draft.nodeId) : null;
  const selectableNodes = currentNode && !channelNodes.some((n) => n.id === currentNode.id)
    ? [...channelNodes, currentNode]
    : channelNodes;
  const choiceOf = (node: CatalogNode) => ({
    id: node.id,
    label: `${labelOf(node)}${homeShelfIssue(node.id, nodes, channel) ? ` (غير متاح في ${channelName})` : ''}`,
  });
  const missingChoice = draft?.nodeId && !currentNode ? { id: draft.nodeId, label: 'التصنيف محذوف - اختر تصنيفًا جديدًا' } : null;
  const shelfChoices = selectableNodes.filter((n) => !taken.has(n.id) || n.id === editingBlock?.nodeId).map(choiceOf);
  if (missingChoice) shelfChoices.push(missingChoice);
  const scopeChoices = selectableNodes.map(choiceOf);
  if (missingChoice) scopeChoices.push(missingChoice);
  const open = (block: HomeBlock) => { setDraft(draftFromBlock(block)); setProblem(''); };
  const openNew = (kind: 'category-shelf' | 'book-shelf' | 'filter-shelf' | 'promo') => { setDraft(newDraft(kind)); setProblem(''); };
  const close = () => { setDraft(null); setProblem(''); };

  const saveBlocks = (next: HomeBlock[]) => save.mutateAsync(rowsFor(next));
  const move = (keys: string[] | null) => {
    if (!keys || busy) return;
    void saveBlocks(keys.map((k) => blocks.find((b) => b.key === k)!));
  };
  const keys = blocks.map((b) => b.key);
  const dnd = useDragRows({ onDrop: (dragId, targetId, zone) => move(reorderRelative(keys, dragId, targetId, zone === 'after' ? 'after' : 'before')) });

  const submit = async () => {
    if (!draft || busy) return;
    const result = blockFromDraft(draft, editingBlock, channel, blocks.length);
    if ('problem' in result) { setProblem(result.problem); return; }
    try {
      if (draft.key === null) {
        const key = draft.kind === SHELF_KIND ? shelfKeyFor(draft.nodeId) : newBlockKey(crypto.randomUUID());
        await saveBlocks([...blocks, { ...result.block, key }]);
      } else {
        await saveBlocks(blocks.map((b) => (b.key === draft.key ? { ...result.block, key: b.key } : b)));
      }
      close();
    } catch {
      // the message is already shown
    }
  };

  /** Makes the OTHER channel's home page follow this one (one request: the old blocks that are not in it go, the rest is written). */
  const copyToOther = async () => {
    if (busy) return;
    const { rows: nextRows, remove: removed } = copyLayout(rows, otherRows, channel, other);
    const target = other === 'app' ? 'التطبيق' : 'الموقع';
    const unavailableShelves = resolveHomeBlocks(nextRows, other).filter((block) =>
      block.kind === SHELF_KIND && homeShelfIssue(block.nodeId, nodes, other, counts) !== null,
    );
    const lines = [
      `ترتيب ${target} هيبقى زي ترتيب ${isApp ? 'التطبيق' : 'الموقع'} بالظبط: نفس الأقسام والرفوف والعناوين والتواريخ.`,
      removed.length > 0 ? `${removed.length} عنصر من عناصر ${target} الحالية مش موجودين هنا هيتشالوا.` : null,
      unavailableShelves.length > 0 ? `${unavailableShelves.length} رف قد لا يظهر في ${target} لأن تصنيفه مخفي أو غير مفعل أو بلا كتب. راجع التنبيهات بعد النسخ.` : null,
      other === 'app' ? 'التطبيق الذي يحتوي على نظام تخطيط الرئيسية سيقرأ الترتيب الجديد عند تحديث بياناته.' : null,
      'متأكد؟',
    ].filter(Boolean);
    if (!window.confirm(lines.join('\n'))) return;
    try {
      await apply.mutateAsync({ channel: other, rows: nextRows, remove: removed });
      toast.success(`اتنسخ الترتيب لـ${target}`);
    } catch {
      // the message is already shown
    }
  };

  const customName = (b: HomeBlock) => {
    if (b.kind === BOOK_SHELF_KIND) return b.title || CUSTOM_META[BOOK_SHELF_KIND].label;
    if (b.kind === FILTER_SHELF_KIND) return b.title || FILTER_SOURCES[filterSourceOf(b.config)].title;
    return b.title || promoOf(b.config).buttonLabel || CUSTOM_META[PROMO_KIND].label;
  };
  const nameOf = (b: HomeBlock) => {
    if (b.std) return b.title ?? BLOCK_META[b.std].label;
    if (b.kind === SHELF_KIND) return b.title || byId.get(b.nodeId ?? '')?.name_ar || 'عنصر محذوف أو مخفي';
    return customName(b);
  };
  const hintOf = (b: HomeBlock) => {
    if (b.std) {
      const d = blockDefaults(b.std, channel);
      const bits = [BLOCK_META[b.std].hint];
      if (b.limit != null && d.editable.includes('limit')) bits.push(`${d.limitLabel ?? 'العدد'}: ${b.limit}`);
      return bits.join(' · ');
    }
    if (b.kind === BOOK_SHELF_KIND) {
      const n = bookShelfIds(b.config).length;
      return [CUSTOM_META[BOOK_SHELF_KIND].label, `${n} كتاب مختار`, b.limit != null ? `أول ${b.limit}` : null].filter(Boolean).join(' · ');
    }
    if (b.kind === FILTER_SHELF_KIND) {
      const scope = b.nodeId ? byId.get(b.nodeId)?.name_ar ?? 'تصنيف محذوف (راجع نطاق الرف)' : 'المتجر كله';
      return [FILTER_SOURCES[filterSourceOf(b.config)].label, scope, b.limit != null ? `أول ${b.limit}` : null].filter(Boolean).join(' · ');
    }
    if (b.kind === PROMO_KIND) {
      const promo = promoOf(b.config);
      return [CUSTOM_META[PROMO_KIND].label, promo.imageUrl ? 'بصورة' : null, promo.linkUrl ? 'بزر' : null].filter(Boolean).join(' · ');
    }
    const node = byId.get(b.nodeId ?? '');
    const total = b.nodeId ? counts?.get(b.nodeId)?.total : undefined;
    return [
      node ? labelOf(node) : `التصنيف محذوف، فالرف مش هيظهر في ${channelName}`,
      total != null ? `${total} كتاب` : null,
      b.limit != null ? `أول ${b.limit}` : null,
    ].filter(Boolean).join(' · ');
  };
  /** the dates, countries and devices a block is limited to, as short chips */
  const chipsOf = (b: HomeBlock): { text: string; tone: 'info' | 'warn' | 'bad'; id: string }[] => {
    const out: { text: string; tone: 'info' | 'warn' | 'bad'; id: string }[] = [];
    if (b.kind === SHELF_KIND || (b.kind === FILTER_SHELF_KIND && b.nodeId)) {
      const issue = homeShelfIssue(b.nodeId, nodes, channel, counts);
      const issueText = issue === 'missing' ? 'التصنيف محذوف' : issue === 'inactive' ? 'التصنيف غير مفعل'
        : issue === 'hidden' ? `التصنيف مخفي عن ${channelName}` : issue === 'empty' ? 'لا توجد كتب في التصنيف' : null;
      if (issueText) out.push({ id: 'shelf-health', tone: issue === 'empty' ? 'warn' : 'bad', text: issueText });
    }
    const state = scheduleState(b.window, now);
    if (state === 'upcoming') out.push({ id: 'upcoming', tone: 'warn', text: `يبدأ ${dayOf(b.window.startsAt!)}` });
    else if (state === 'ended') out.push({ id: 'ended', tone: 'bad', text: `انتهى ${dayOf(b.window.endsAt!)}` });
    else if (state === 'running' && b.window.endsAt) out.push({ id: 'running', tone: 'info', text: `لحد ${dayOf(b.window.endsAt)}` });
    if (b.window.countries) out.push({ id: 'countries', tone: 'info', text: b.window.countries.map(countryName).join('، ') });
    if (b.window.devices !== 'all') out.push({ id: 'devices', tone: 'info', text: DEVICE_SHORT[b.window.devices] });
    return out;
  };

  const draftView = useMemo(() => blocksWithDraft(blocks, draft, channel), [blocks, draft, channel]);
  const stripRows = useMemo(() => rows.filter((r) => r.kind === PAGE_STRIP_KIND), [rows]);

  // the strip on a book's page
  const related = pageStripOf(rows, BOOK_RELATED_KEY) ?? { visible: true, title: null, limit: null };
  const [relTitle, setRelTitle] = useState<string | null>(null);
  const [relLimit, setRelLimit] = useState<string | null>(null);
  const saveRelated = (patch: Partial<typeof related>) =>
    !busy && save.mutate([pageStripRow(BOOK_RELATED_KEY, { ...related, ...patch })]);
  const submitRelated = () => {
    const parsed = parseShelfLimit(relLimit ?? (related.limit != null ? String(related.limit) : ''));
    if (parsed === 'invalid' || (parsed != null && parsed > 12)) { setProblem('عدد الكتب في «كتب قد تعجبك» من 1 لـ12.'); return; }
    setProblem('');
    saveRelated({ title: (relTitle ?? related.title ?? '').trim() || null, limit: parsed });
    setRelTitle(null);
    setRelLimit(null);
  };

  return (
    <div
      className={previewOpen ? `xl:grid xl:gap-6 xl:items-start ${previewDevice === 'desktop' && !isApp ? 'xl:grid-cols-[minmax(0,1fr)_640px]' : 'xl:grid-cols-[minmax(0,1fr)_440px]'}` : ''}
    >
    <div className="space-y-6 min-w-0" data-testid="home-blocks">
      <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 flex flex-col md:flex-row md:items-center gap-3 justify-between border-b border-gray-50">
          <div>
            <h2 className="text-lg font-bold text-gray-800">{isApp ? 'ترتيب الصفحة الرئيسية في التطبيق' : 'ترتيب الصفحة الرئيسية في الموقع'}</h2>
            <p className="text-sm text-gray-500 mt-1">
              كل أقسام الصفحة ورفوف التصنيفات في قايمة واحدة: اسحب أي واحد لمكانه، أقفله أو افتحه، وغيّر عنوانه وعدد كتبه. البانر في الأعلى ثابت
              (صوره من «صور الصفحة الرئيسية»). {shelfCount > 0 && 'لما فيه رفوف مختارة، «صفوف التصنيفات» التلقائية بتسكت وتاخد الرفوف مكانها.'}
            </p>
            {isApp && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2 mt-2" data-testid="app-note">
                الترتيب والرفوف والعناوين والأعداد تظهر في التطبيق بعد تحديث بيانات الرئيسية، بشرط أن تكون النسخة المثبتة تدعم تخطيط الرئيسية.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            {!isApp && <Link to="/appearance" className="text-sm font-semibold text-blue-600 hover:underline whitespace-nowrap">«مظهر المتجر»</Link>}
            <button
              type="button"
              onClick={togglePreview}
              aria-pressed={previewOpen}
              className={`flex items-center gap-1.5 whitespace-nowrap ${previewOpen ? 'btn-primary' : 'btn-secondary'}`}
              data-testid="preview-toggle"
            >
              <Eye size={14} /> معاينة
            </button>
            <button
              type="button"
              onClick={() => void copyToOther()}
              disabled={busy || isLoading}
              className="btn-secondary flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
              data-testid="copy-layout"
            >
              {apply.isPending ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />} {isApp ? 'انسخ الترتيب للموقع' : 'انسخ الترتيب للتطبيق'}
            </button>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-gray-50 flex flex-wrap items-center gap-2" data-testid="add-bar">
          <span className="text-sm font-semibold text-gray-600">إضافة:</span>
          <button type="button" onClick={() => openNew('category-shelf')} className="btn-primary flex items-center gap-1.5 whitespace-nowrap" data-testid="shelf-add"><Plus size={15} /> رف تصنيف</button>
          <button type="button" onClick={() => openNew('book-shelf')} className="btn-secondary flex items-center gap-1.5 whitespace-nowrap" data-testid="add-book-shelf"><Plus size={15} /> {CUSTOM_META[BOOK_SHELF_KIND].label}</button>
          <button type="button" onClick={() => openNew('filter-shelf')} className="btn-secondary flex items-center gap-1.5 whitespace-nowrap" data-testid="add-filter-shelf"><Plus size={15} /> {CUSTOM_META[FILTER_SHELF_KIND].label}</button>
          <button type="button" onClick={() => openNew('promo')} className="btn-secondary flex items-center gap-1.5 whitespace-nowrap" data-testid="add-promo"><Plus size={15} /> {CUSTOM_META[PROMO_KIND].label}</button>
        </div>

        {draft && (
          <HomeBlockForm
            channel={channel}
            draft={draft}
            onChange={(next) => { setDraft(next); setProblem(''); }}
            nodes={draft.kind === SHELF_KIND ? shelfChoices : scopeChoices}
            problem={problem}
            saving={busy}
            onSubmit={() => void submit()}
            onCancel={close}
          />
        )}

        {isLoading ? (
          <div className="py-10 flex justify-center text-gray-400"><Loader2 className="animate-spin" /></div>
        ) : (
          <ol className="divide-y divide-gray-50">
            {blocks.map((block, i) => {
              const name = nameOf(block);
              const replaced = block.std === 'categories' && shelfCount > 0;
              const ended = scheduleState(block.window, now) === 'ended';
              const dim = !block.visible || replaced || ended;
              const chips = chipsOf(block);
              const kindBadge = block.std ? null : block.kind === SHELF_KIND ? 'رف تصنيف' : CUSTOM_META[block.kind as 'book-shelf'].label;
              return (
                <li
                  key={block.key}
                  className={`flex items-center gap-3 px-4 py-3 ${dnd.rowClass(block.key)}`}
                  data-testid={block.std ? `home-block-${block.std}` : block.kind === SHELF_KIND ? 'shelf-row' : 'block-row'}
                  data-kind={block.std ? 'standard' : block.kind === SHELF_KIND ? 'shelf' : block.kind}
                  data-key={block.key}
                  {...dnd.rowProps(block.key)}
                >
                  <button type="button" className={gripButtonClass} data-testid="drag-handle" {...dnd.handleProps(block.key, name, (dir) => move(stepInList(keys, block.key, dir)))}><Grip /></button>
                  <span className="w-6 text-xs text-gray-400 text-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${dim ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                      {name}
                      {kindBadge && <span className="mr-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 no-underline" data-testid="kind-badge">{kindBadge}</span>}
                      {hasCustomLook(block.config) && <span className="mr-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-700 no-underline" data-testid="look-badge">شكل مخصص</span>}
                      {replaced && <span className="mr-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700">بدلها الرفوف المختارة</span>}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{hintOf(block)}</p>
                    {chips.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-1.5" data-testid="window-chips">
                        {chips.map((chip) => (
                          <span
                            key={chip.id}
                            data-chip={chip.id}
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${chip.tone === 'bad' ? 'bg-red-100 text-red-700' : chip.tone === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}
                          >{chip.text}</span>
                        ))}
                      </p>
                    )}
                  </div>
                  <Switch checked={block.visible} disabled={busy} label={`إظهار ${name}`} onChange={(v) => void saveBlocks(blocks.map((b) => (b.key === block.key ? { ...b, visible: v } : b)))} />
                  <button type="button" onClick={() => open(block)} disabled={busy} className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-600 disabled:opacity-40" aria-label={`تعديل ${name}`}><Pencil size={14} /></button>
                  {block.std === null ? (
                    <button
                      type="button"
                      onClick={() => {
                        const detail = block.kind === SHELF_KIND ? ' (التصنيف نفسه وكتبه مش بيتأثروا)' : block.kind === BOOK_SHELF_KIND ? ' (الكتب نفسها مش بتتأثر)' : '';
                        if (window.confirm(`حذف «${name}» من الصفحة الرئيسية؟${detail}`)) remove.mutate(block.key);
                      }}
                      disabled={busy}
                      className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 disabled:opacity-40"
                      aria-label={`حذف رف ${name}`}
                    ><Trash2 size={14} /></button>
                  ) : <span className="w-[30px]" />}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {!isApp && (
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
            <Switch checked={related.visible} disabled={busy} label="إظهار كتب قد تعجبك" onChange={(v) => saveRelated({ visible: v })} />
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
          <button type="button" onClick={submitRelated} disabled={busy || (relTitle === null && relLimit === null)} className="btn-secondary disabled:opacity-40" data-testid="related-save">حفظ</button>
        </div>
      </section>
      )}
    </div>
    {previewOpen && (
      <div className="mt-6 xl:mt-0 xl:sticky xl:top-4">
        <HomePreview channel={channel} blocks={draftView.blocks} extraRows={stripRows} focus={draftView.focus} nameOf={nameOf} device={previewDevice} onDeviceChange={setPreviewDevice} />
      </div>
    )}
    </div>
  );
}
