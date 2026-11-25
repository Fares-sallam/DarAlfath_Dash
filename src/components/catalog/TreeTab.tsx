import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronLeft, Eye, EyeOff, FolderTree, GitMerge, Layers, Library, Loader2, Pencil, Plus, Search, Tag } from 'lucide-react';
import { useCatalogCounts, useCatalogNodes, useReorderNodes, useUpdateNode } from '@/hooks/useCatalog';
import { useMenuItems } from '@/hooks/useMenuItems';
import { headerStatuses, headerStatusHint, headerStatusLabel, type HeaderStatus } from '@/lib/headerPlacement';
import { resolveMenu } from '@/lib/menuMap';
import {
  NODE_TYPE_LABELS, STATUS_LABELS, buildTree, childrenOf, descendantIds, formatBookCount, nodeFlags, nodeStatus,
  type CatalogNode, type Channel, type NodeType,
} from '@/lib/catalogTree';
import MergeDialog, { MergePickDialog } from './MergeDialog';
import MergeHistory from './MergeHistory';
import NodeEditor, { type EditorTarget } from './NodeEditor';
import { Grip, gripButtonClass, useDragRows } from './useDragRows';
import { stepInList, type DropZone } from '@/lib/dragSort';

const CHANNELS: { key: Channel; label: string }[] = [
  { key: 'web', label: 'الموقع' },
  { key: 'app', label: 'التطبيق' },
  { key: 'both', label: 'الاتنين' },
];

/** The tree's «النوع» filter: one kind of node at a time (with the nodes above it, so it is clear where it sits). */
type TypeFilter = 'all' | 'section' | 'series' | 'category';
const TYPE_FILTERS: { key: TypeFilter; label: string; types: NodeType[] }[] = [
  { key: 'all', label: 'الكل', types: [] },
  { key: 'section', label: 'الأقسام', types: ['section'] },
  { key: 'series', label: 'السلاسل', types: ['series'] },
  { key: 'category', label: 'التصنيفات والمجموعات', types: ['category', 'collection'] },
];

const TYPE_STYLE: Record<NodeType, { icon: typeof Tag; chip: string }> = {
  section: { icon: Library, chip: 'bg-violet-100 text-violet-700' },
  series: { icon: Layers, chip: 'bg-blue-100 text-blue-700' },
  category: { icon: Tag, chip: 'bg-emerald-100 text-emerald-700' },
  collection: { icon: FolderTree, chip: 'bg-amber-100 text-amber-700' },
};

const HEADER_BADGE_STYLE: Record<HeaderStatus['state'], string> = {
  in: 'bg-green-100 text-green-700',
  'row-hidden': 'bg-amber-100 text-amber-700',
  'node-hidden': 'bg-gray-200 text-gray-600',
  empty: 'bg-amber-100 text-amber-700',
  none: 'bg-gray-100 text-gray-500 border border-dashed border-gray-300',
};

const STATUS_STYLE = { visible: 'bg-green-100 text-green-700', hidden: 'bg-gray-200 text-gray-600', scheduled: 'bg-sky-100 text-sky-700', expired: 'bg-red-100 text-red-600' };

function defaultChildType(parent: CatalogNode | null): NodeType {
  if (!parent) return 'series';
  return parent.type === 'section' ? 'series' : 'category';
}

/** The whole catalog as one tree: open it, search it, reorder it, and open any node to edit. */
export default function TreeTab({ openNodeId, onOpened }: { openNodeId?: string | null; onOpened?: () => void }) {
  const { data: nodes = [], isLoading, isError } = useCatalogNodes();
  const { data: counts } = useCatalogCounts();
  const { data: menuItems } = useMenuItems();
  const reorder = useReorderNodes();
  const update = useUpdateNode();

  const [channel, setChannel] = useState<Channel>('both');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [merging, setMerging] = useState<CatalogNode | null>(null);
  const [pickingMerge, setPickingMerge] = useState(false);

  // a link from another tab («افتح العنصر») opens that node's editor once
  useEffect(() => {
    if (!openNodeId || nodes.length === 0) return;
    const target = nodes.find((n) => n.id === openNodeId);
    if (target) setEditor({ node: target });
    onOpened?.();
  }, [openNodeId, nodes, onOpened]);

  // where each node stands in the website's top menu (nothing is drawn until the menu rows have loaded)
  const menu = useMemo(() => (menuItems ? resolveMenu(menuItems, nodes, 'web') : null), [menuItems, nodes]);
  const statuses = useMemo(() => (menu ? headerStatuses(menu, nodes, counts) : null), [menu, nodes, counts]);

  const typeSet = useMemo(() => new Set(TYPE_FILTERS.find((t) => t.key === typeFilter)?.types ?? []), [typeFilter]);
  const filtering = !!query.trim() || typeFilter !== 'all';
  const rows = useMemo(() => buildTree(nodes, channel, expanded, query, typeSet), [nodes, channel, expanded, query, typeSet]);

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const expandAll = () => setExpanded(new Set(nodes.filter((n) => nodes.some((c) => c.parent_id === n.id)).map((n) => n.id)));
  const collapseAll = () => setExpanded(new Set());

  /** One step with the keyboard (the grip focused, then the up and down arrows). */
  const step = (node: CatalogNode, dir: -1 | 1) => {
    const ids = stepInList(childrenOf(nodes, node.parent_id, channel).map((n) => n.id), node.id, dir);
    if (ids) reorder.mutate({ ids, channel });
  };

  /** Dropped above or below a row = placed next to it (under its parent); dropped in its middle = placed inside it. */
  const dropNode = async (dragId: string, targetId: string, zone: DropZone) => {
    const dragged = nodes.find((n) => n.id === dragId);
    const target = nodes.find((n) => n.id === targetId);
    if (!dragged || !target) return;
    const newParent = zone === 'inside' ? target.id : target.parent_id;
    const siblings = childrenOf(nodes, newParent, channel).map((n) => n.id).filter((id) => id !== dragId);
    const index = zone === 'inside' ? siblings.length : siblings.indexOf(target.id) + (zone === 'after' ? 1 : 0);
    const order = [...siblings.slice(0, index), dragId, ...siblings.slice(index)];
    const sameParent = dragged.parent_id === newParent;
    if (sameParent && order.join() === childrenOf(nodes, newParent, channel).map((n) => n.id).join()) return;
    try {
      if (!sameParent) await update.mutateAsync({ id: dragId, patch: { parent_id: newParent } });
      await reorder.mutateAsync({ ids: order, channel });
      if (zone === 'inside') setExpanded((current) => new Set(current).add(target.id));
    } catch {
      // the failure is already shown as a message
    }
  };

  const dnd = useDragRows({
    allowInside: () => true,
    canDrop: (dragId, targetId) => dragId !== targetId && !descendantIds(nodes, dragId).has(targetId),
    onDrop: (dragId, targetId, zone) => void dropNode(dragId, targetId, zone),
  });

  const totals = useMemo(() => {
    const count = (t: NodeType) => nodes.filter((n) => n.type === t).length;
    return { sections: count('section'), series: count('series'), categories: count('category') + count('collection') };
  }, [nodes]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
        <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
          <span className="px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 font-semibold">{totals.sections} قسم</span>
          <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-semibold">{totals.series} سلسلة</span>
          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-semibold">{totals.categories} تصنيف ومجموعة</span>
        </div>
        <button type="button" onClick={() => setEditor({ node: null, createType: 'series', createParentId: null })} className="btn-primary flex items-center gap-2 self-start" data-testid="add-root">
          <Plus size={16} /> إضافة عنصر
        </button>
      </div>

      <div className="bg-white rounded-2xl p-3 shadow-sm flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث في الأقسام والسلاسل والتصنيفات..." className="input-field pr-10 text-sm py-2.5 h-auto" data-testid="tree-search" />
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1" role="group" aria-label="القناة">
          {CHANNELS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setChannel(c.key)}
              aria-pressed={channel === c.key}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold ${channel === c.key ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}
              data-testid={`channel-${c.key}`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 flex-wrap" role="group" aria-label="النوع" data-testid="type-filters">
          {TYPE_FILTERS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTypeFilter(t.key)}
              aria-pressed={typeFilter === t.key}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold ${typeFilter === t.key ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}
              data-testid={`type-${t.key}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button type="button" onClick={expandAll} className="text-blue-600 hover:underline">فتح الكل</button>
          <span className="text-gray-300">|</span>
          <button type="button" onClick={collapseAll} className="text-blue-600 hover:underline">طي الكل</button>
        </div>
      </div>
      <p className="text-xs text-gray-400 -mt-2" data-testid="tree-drag-hint">
        اسحب أي صف من المقبض: فوق أو تحت صف تاني عشان ترتّبه، أو في نص الصف عشان تحطه <b>جواه</b>. الترتيب بيتغيّر لـ{channel === 'both' ? 'الموقع والتطبيق معًا' : channel === 'web' ? 'الموقع' : 'التطبيق'}.
        {channel === 'both' ? ' (الترتيب المعروض هو ترتيب الموقع)' : ''}
      </p>

      <MergeHistory onPick={() => setPickingMerge(true)} />

      <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-50" data-testid="catalog-tree">
        {isLoading && <div className="flex items-center justify-center gap-2 py-12 text-gray-400"><Loader2 size={18} className="animate-spin" /> جارٍ التحميل...</div>}
        {isError && <p className="text-center text-red-500 py-10 text-sm">تعذّر تحميل الشجرة.</p>}
        {!isLoading && !isError && rows.length === 0 && (
          <p className="text-center text-gray-400 py-12 text-sm">{filtering ? 'مفيش نتايج للبحث.' : 'مفيش عناصر لسه. اضغط «إضافة عنصر».'}</p>
        )}
        {rows.map(({ node, depth, hasChildren }) => {
          const style = TYPE_STYLE[node.type];
          const Icon = style.icon;
          const status = nodeStatus(node);
          const flags = nodeFlags(node);
          const count = counts?.get(node.id);
          const open = filtering || expanded.has(node.id);
          const inHeader = statuses?.get(node.id);
          return (
            <div
              key={node.id}
              className={`flex items-center gap-2 px-3 py-2.5 hover:bg-blue-50/30 ${status !== 'visible' ? 'opacity-70' : ''} ${dnd.rowClass(node.id)}`}
              style={{ paddingRight: 12 + depth * 22 }}
              data-testid="tree-row"
              data-node-id={node.id}
              data-depth={depth}
              {...dnd.rowProps(node.id)}
            >
              <button type="button" className={gripButtonClass} data-testid="drag-handle" {...dnd.handleProps(node.id, node.name_ar, (dir) => step(node, dir))}><Grip /></button>
              {hasChildren ? (
                <button type="button" onClick={() => toggle(node.id)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500" aria-label={open ? 'طي' : 'فتح'} aria-expanded={open}>
                  {open ? <ChevronDown size={15} /> : <ChevronLeft size={15} />}
                </button>
              ) : <span className="w-[23px]" />}

              <span className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg ${style.chip}`}><Icon size={12} />{NODE_TYPE_LABELS[node.type]}</span>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800 truncate">{node.name_ar}</p>
                {node.name_en && <p className="text-[11px] text-gray-400 truncate" dir="ltr">{node.name_en}</p>}
                {inHeader && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md truncate max-w-[260px] ${HEADER_BADGE_STYLE[inHeader.state]}`}
                      title={headerStatusHint(inHeader)}
                      data-testid="header-badge"
                      data-state={inHeader.state}
                    >
                      {headerStatusLabel(inHeader)}
                    </span>
                    {inHeader.state === 'none' && (
                      <Link to={`/catalog?tab=map&add=${node.id}`} className="text-[10px] font-bold text-blue-600 hover:underline" data-testid="header-add">إضافة للهيدر</Link>
                    )}
                    {(inHeader.state === 'row-hidden' || inHeader.state === 'empty') && (
                      <Link to="/catalog?tab=map" className="text-[10px] font-bold text-blue-600 hover:underline" data-testid="header-open-map">افتح «خريطة العرض»</Link>
                    )}
                  </div>
                )}
              </div>

              <div className="hidden md:flex items-center gap-1.5 flex-wrap justify-end">
                {flags.map((f) => <span key={f} className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700">{f}</span>)}
                {status !== 'visible' && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${STATUS_STYLE[status]}`}>{STATUS_LABELS[status]}</span>}
                <span
                  className="text-xs text-gray-500 tabular-nums min-w-[96px] text-center"
                  title={count ? `مربوط بالعنصر نفسه: ${count.direct} كتاب. الإجمالي مع اللي تحته: ${count.total} كتاب.` : undefined}
                  data-testid="row-count"
                >
                  {formatBookCount(count)}
                </span>
                <span className="text-[11px] text-gray-400 tabular-nums" title="الترتيب (الموقع / التطبيق)">{node.sort_web}/{node.sort_app}</span>
              </div>

              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => update.mutate({ id: node.id, patch: { is_active: !node.is_active } })}
                  disabled={update.isPending}
                  title={node.is_active ? 'إخفاء' : 'إظهار'}
                  aria-label={node.is_active ? `إخفاء ${node.name_ar}` : `إظهار ${node.name_ar}`}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                >
                  {node.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button type="button" onClick={() => setEditor({ node: null, createType: defaultChildType(node), createParentId: node.id })} title="إضافة عنصر تحته" aria-label={`إضافة تحت ${node.name_ar}`} className="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-600"><Plus size={14} /></button>
                <button type="button" onClick={() => setEditor({ node })} title="تعديل" aria-label={`تعديل ${node.name_ar}`} className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-600" data-testid="edit-node"><Pencil size={14} /></button>
                <button type="button" onClick={() => setMerging(node)} title="دمج مع عنصر تاني" aria-label={`دمج ${node.name_ar}`} className="p-1.5 rounded-lg hover:bg-violet-100 text-violet-600" data-testid="merge-node"><GitMerge size={14} /></button>
              </div>
            </div>
          );
        })}
      </div>

      {pickingMerge && <MergePickDialog nodes={nodes} onPick={(node) => { setPickingMerge(false); setMerging(node); }} onClose={() => setPickingMerge(false)} />}
      {merging && <MergeDialog key={merging.id} item={merging} nodes={nodes} onClose={() => setMerging(null)} />}
      {editor && <NodeEditor key={editor.node?.id ?? `new-${editor.createParentId ?? 'root'}`} target={editor} nodes={nodes} onClose={() => setEditor(null)} />}
    </div>
  );
}
