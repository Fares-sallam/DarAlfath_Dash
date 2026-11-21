import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, EyeOff, Layers, Loader2, Pencil, Pin, Plus, Smartphone, Trash2, Ungroup, X } from 'lucide-react';
import { Switch } from '@/components/ads/CategoryBarSection';
import { useCatalogNodes } from '@/hooks/useCatalog';
import {
  useCreateMenuItem, useDeleteMenuItem, useGroupMenuItems, useHomeLayout, useMaterializeMenuChildren, useMenuItems,
  useMoveMenuItem, useReorderMenuItems, useUngroupMenuItem, useUpdateMenuItem,
} from '@/hooks/useMenuItems';
import {
  MAX_MENU_DEPTH, MENU_KIND_LABELS, flattenMenu, nextMenuSort, parentOptions, placementProblem, placementText, resolveMenu,
  type ResolvedMenuItem,
} from '@/lib/menuMap';
import { stepInList, type DropZone } from '@/lib/dragSort';
import MenuItemDialog, { type MenuDialogTarget } from './MenuItemDialog';
import { Grip, gripButtonClass, useDragRows } from './useDragRows';

/** The names of the home page's shelves (rows), in the order the page draws them. */
const SHELF_LABELS: Record<string, string> = {
  departments: 'كروت «أقسام المتجر» (السلاسل)',
  'best-sellers': 'الأكثر مبيعًا',
  'new-arrivals': 'وصل حديثًا',
  offers: 'العروض',
  categories: 'رفوف التصنيفات',
  'ebook-library': 'المكتبة الإلكترونية',
  'intro-videos': 'فيديوهات «من الدار»',
  features: 'مربعات أعلى الفوتر',
};

type Channel = 'web' | 'app';

interface Selection {
  /** the stored item every selected row sits inside (all selected rows share it) */
  parentId: string;
  keys: string[];
}

/** The whole display, top to bottom: the top menu (sections inside sections), the category bar, the home page's shelves. */
export default function DisplayMapTab() {
  const { data: items = [], isLoading } = useMenuItems();
  const { data: nodes = [] } = useCatalogNodes();
  const { data: layout = [] } = useHomeLayout();
  const create = useCreateMenuItem();
  const update = useUpdateMenuItem();
  const remove = useDeleteMenuItem();
  const reorder = useReorderMenuItems();
  const move = useMoveMenuItem();
  const materialize = useMaterializeMenuChildren();
  const group = useGroupMenuItems();
  const ungroup = useUngroupMenuItem();

  const [channel, setChannel] = useState<Channel>('web');
  const [dialog, setDialog] = useState<MenuDialogTarget | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);

  const menu = useMemo(() => resolveMenu(items, nodes, 'web'), [items, nodes]);
  const flat = useMemo(() => flattenMenu(menu), [menu]);
  const byItemId = useMemo(() => new Map(flat.filter((e) => e.item).map((e) => [e.item!.id, e])), [flat]);
  const busy = create.isPending || update.isPending || remove.isPending || reorder.isPending || move.isPending || materialize.isPending || group.isPending || ungroup.isPending;

  const bar = useMemo(
    () =>
      nodes
        .filter((n) => (n.type === 'category' || n.type === 'collection') && n.is_active && n.show_in_bar_app)
        .sort((a, b) => a.sort_app - b.sort_app || a.name_ar.localeCompare(b.name_ar, 'ar')),
    [nodes],
  );
  const shelves = layout.filter((l) => l.channel === channel).sort((a, b) => a.sort_order - b.sort_order);

  /** The stored items of a parent (or the main items) in the order they are drawn. */
  const orderOf = (parentId: string | null): string[] =>
    parentId === null
      ? menu.map((m) => m.item!.id)
      : (byItemId.get(parentId)?.children ?? []).filter((c) => c.item).map((c) => c.item!.id);

  /** One step with the keyboard (the grip focused, then the up and down arrows). */
  const step = (id: string, dir: -1 | 1) => {
    const item = items.find((i) => i.id === id);
    const ids = item ? stepInList(orderOf(item.parent_id), id, dir) : null;
    if (ids) reorder.mutate(ids);
  };

  /**
   * Dropped above or below an item = placed next to it, at its level (so a sub-item dropped beside a main item
   * becomes main); dropped in the middle of an item = placed inside it.
   */
  const dropItem = async (dragId: string, targetId: string, zone: DropZone) => {
    const dragged = items.find((i) => i.id === dragId);
    const target = items.find((i) => i.id === targetId);
    if (!dragged || !target) return;
    const newParent = zone === 'inside' ? target.id : target.parent_id;
    const siblings = orderOf(newParent).filter((id) => id !== dragId);
    const index = zone === 'inside' ? siblings.length : siblings.indexOf(target.id) + (zone === 'after' ? 1 : 0);
    const order = [...siblings.slice(0, index), dragId, ...siblings.slice(index)];
    const sameParent = dragged.parent_id === newParent;
    if (sameParent && order.join() === orderOf(newParent).join()) return;
    try {
      if (!sameParent) await move.mutateAsync({ id: dragId, parentId: newParent });
      await reorder.mutateAsync(order);
    } catch {
      // the failure is already shown as a message
    }
  };

  const dnd = useDragRows({
    allowInside: () => true,
    canDrop: (dragId, targetId, zone) => {
      const target = items.find((i) => i.id === targetId);
      if (!target || dragId === targetId) return false;
      return placementProblem(items, dragId, zone === 'inside' ? target.id : target.parent_id) === null;
    },
    onDrop: (dragId, targetId, zone) => void dropItem(dragId, targetId, zone),
  });

  const confirmDelete = (entry: ResolvedMenuItem) => {
    if (!entry.item) return;
    const inside = flat.filter((e) => e.item && e.parent && flattenMenu([entry]).includes(e) && e !== entry).length;
    const text = inside > 0 ? `حذف «${entry.label}» وكل اللي جواه (${inside})؟` : `حذف «${entry.label}» من القايمة؟`;
    if (window.confirm(text)) remove.mutate(entry.item.id);
  };

  /** A sub-item that is filled automatically can be hidden: that stores a hidden row for the same child. */
  const hideAuto = (entry: ResolvedMenuItem) => {
    // An automatic row below another automatic row has no stored parent: the hidden row goes under the nearest
    // stored item above (a manual row for a node anywhere under an item is what stands in for its automatic copy).
    let holder: ResolvedMenuItem | null = entry.parent;
    while (holder && !holder.item) holder = holder.parent;
    if (!holder?.item || !entry.nodeId) return;
    create.mutate({
      kind: 'node', node_id: entry.nodeId, parent_id: holder.item.id, visible: false,
      sort_order: nextMenuSort(items, 'web', holder.item.id),
    });
  };

  const rowKey = (entry: ResolvedMenuItem) => entry.item?.id ?? entry.key;
  const isSelected = (entry: ResolvedMenuItem) => !!selection?.keys.includes(rowKey(entry));
  const toggleSelect = (entry: ResolvedMenuItem) => {
    const parentId = entry.parent?.item?.id;
    if (!parentId) return;
    setSelection((current) => {
      const same = current && current.parentId === parentId ? current.keys : [];
      const key = rowKey(entry);
      const keys = same.includes(key) ? same.filter((k) => k !== key) : [...same, key];
      return keys.length === 0 ? null : { parentId, keys };
    });
  };

  const submitGroup = async () => {
    if (!selection || groupName === null) return;
    const picked = selection.keys
      .map((key) => flat.find((e) => rowKey(e) === key))
      .filter((e): e is ResolvedMenuItem => !!e);
    try {
      await group.mutateAsync({
        parentId: selection.parentId,
        label: groupName.trim(),
        itemIds: picked.filter((e) => e.item).map((e) => e.item!.id),
        nodeIds: picked.filter((e) => !e.item && e.nodeId).map((e) => e.nodeId!),
      });
      setSelection(null);
      setGroupName(null);
    } catch {
      // the failure is already shown as a message
    }
  };

  const iconBtn = 'p-1.5 rounded-lg disabled:opacity-30';

  const renderEntry = (entry: ResolvedMenuItem) => {
    const item = entry.item;
    const isMain = entry.level === 1;
    const autoCount = entry.children.filter((c) => c.auto).length;
    const canHold = !entry.auto && entry.level < MAX_MENU_DEPTH;
    const moveOptions = item ? parentOptions(menu, items, item.id) : [];

    return (
      <div key={entry.key} data-testid={isMain ? 'menu-main' : 'menu-sub'} data-id={item?.id} data-auto={entry.auto ? 'true' : 'false'} data-level={entry.level}>
        <div
          className={`flex items-center gap-2 py-2.5 flex-wrap ${isMain ? 'bg-white' : 'bg-gray-50/60 border-t border-gray-50'} ${item ? dnd.rowClass(item.id) : ''}`}
          style={{ paddingRight: 16 + (entry.level - 1) * 28, paddingLeft: 16 }}
          data-testid={isMain ? 'menu-main-row' : 'menu-sub-row'}
          {...(item ? dnd.rowProps(item.id) : {})}
        >
          {item ? (
            <button type="button" className={gripButtonClass} data-testid="drag-handle" {...dnd.handleProps(item.id, entry.label, (dir) => step(item.id, dir))}><Grip /></button>
          ) : <span className="w-[32px]" />}
          {!isMain && (
            <input
              type="checkbox"
              checked={isSelected(entry)}
              onChange={() => toggleSelect(entry)}
              aria-label={`اختيار ${entry.label} للتجميع`}
              className="w-4 h-4 accent-blue-600 flex-shrink-0"
              data-testid="menu-select"
            />
          )}
          <div className="flex-1 min-w-[150px]">
            <p className={`${isMain ? 'text-sm font-bold' : 'text-sm'} ${entry.visible ? (isMain ? 'text-gray-800' : 'text-gray-700') : 'text-gray-400 line-through'} ${entry.auto ? 'italic' : isMain ? '' : 'font-semibold'}`}>{entry.label}</p>
            <div className="flex flex-wrap gap-1 mt-0.5">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isMain ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'}`} data-testid={isMain ? 'main-placement' : 'sub-placement'}>{placementText(entry)}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${entry.auto ? 'bg-amber-100 text-amber-700' : entry.kind === 'group' ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-600'}`}>
                {entry.auto ? 'تلقائي من الشجرة' : MENU_KIND_LABELS[entry.kind]}
              </span>
              {entry.children.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700">فيه {entry.children.length} {autoCount > 0 ? `(${autoCount} تلقائي)` : ''}</span>}
            </div>
          </div>

          {item ? (
            <>
              <select
                value={item.parent_id ?? ''}
                onChange={(e) => move.mutate({ id: item.id, parentId: e.target.value === '' ? null : e.target.value })}
                disabled={busy}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white max-w-[200px]"
                aria-label={`نقل ${entry.label}`}
                data-testid="sub-move"
              >
                <option value="">رئيسي</option>
                {item.parent_id && !moveOptions.some((o) => o.id === item.parent_id) && flat.find((e) => e.item?.id === item.parent_id) && (
                  <option value={item.parent_id}>{`داخل: ${flat.find((e) => e.item?.id === item.parent_id)!.label}`}</option>
                )}
                {moveOptions.map((o) => <option key={o.id} value={o.id}>{`داخل: ${o.label}`}</option>)}
              </select>
              <Switch checked={entry.visible} onChange={(v) => update.mutate({ id: item.id, patch: { visible: v } })} label={`إظهار ${entry.label}`} />
              {canHold && (
                <button type="button" onClick={() => setDialog({ item: null, parentId: item.id })} className="text-xs font-semibold text-emerald-700 hover:bg-emerald-50 px-2.5 py-1.5 rounded-lg flex items-center gap-1" aria-label={`إضافة فرع داخل ${entry.label}`}><Plus size={13} /> فرع</button>
              )}
              {entry.kind === 'node' && (autoCount > 0 || item.auto_children) && (
                <button type="button" onClick={() => materialize.mutate(item.id)} disabled={busy} className="text-xs font-semibold text-amber-700 hover:bg-amber-50 px-2.5 py-1.5 rounded-lg flex items-center gap-1" title="تحويل الفروع التلقائية لفروع ثابتة تتحكم فيها" aria-label={`تثبيت فروع ${entry.label}`} data-testid="materialize"><Pin size={13} /> تثبيت الفروع</button>
              )}
              {entry.kind === 'group' && (
                <button type="button" onClick={() => ungroup.mutate(item.id)} disabled={busy} className="text-xs font-semibold text-sky-700 hover:bg-sky-50 px-2.5 py-1.5 rounded-lg flex items-center gap-1" title="اللي جواها يرجع مكانها والمجموعة تتشال" aria-label={`فك مجموعة ${entry.label}`} data-testid="ungroup"><Ungroup size={13} /> فك المجموعة</button>
              )}
              <button type="button" onClick={() => setDialog({ item })} className={`${iconBtn} hover:bg-blue-100 text-blue-600`} title="تعديل" aria-label={`تعديل ${entry.label}`}><Pencil size={14} /></button>
              <button type="button" onClick={() => confirmDelete(entry)} disabled={busy} className={`${iconBtn} hover:bg-red-100 text-red-500`} title="حذف" aria-label={`حذف ${entry.label}`}><Trash2 size={14} /></button>
            </>
          ) : (
            <button type="button" onClick={() => hideAuto(entry)} disabled={busy} className="text-xs font-semibold text-gray-600 hover:bg-gray-100 px-2.5 py-1.5 rounded-lg flex items-center gap-1" aria-label={`إخفاء ${entry.label}`} data-testid="hide-auto"><EyeOff size={13} /> إخفاء</button>
          )}
        </div>
        {entry.children.map(renderEntry)}
      </div>
    );
  };

  return (
    <div className="space-y-6" data-testid="display-map">
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit" role="group" aria-label="القناة">
        {([['web', 'الموقع'], ['app', 'التطبيق (قراءة فقط)']] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setChannel(key)} aria-pressed={channel === key} className={`px-4 py-1.5 rounded-lg text-xs font-bold ${channel === key ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`} data-testid={`map-channel-${key}`}>{label}</button>
        ))}
      </div>

      {channel === 'web' && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="max-w-3xl">
              <h2 className="text-lg font-bold text-gray-800">القايمة العلوية</h2>
              <p className="text-xs text-gray-500">
                الأسهم ▾ اللي في الهيدر: كل عنصر إما رئيسي أو فرعي جوه عنصر، والفرعي ممكن يحتوي على عناصر كمان (لحد {MAX_MENU_DEPTH} مستويات).
                اسحب أي عنصر من المقبض: فوق/تحت عنصر عشان ترتّبه، وفي نص عنصر عشان يبقى جواه، وجنب رئيسي عشان يبقى رئيسي.
                ولتجميع عناصر في مجموعة (زي «المواد»): علّم عليهم بالمربع، واضغط «تجميع في مجموعة».
              </p>
            </div>
            <button type="button" onClick={() => setDialog({ item: null, parentId: null })} className="btn-primary flex items-center gap-2" data-testid="menu-add">
              <Plus size={16} /> إضافة عنصر
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4" aria-label="معاينة الهيدر" data-testid="menu-preview">
            <div className="flex flex-wrap items-center gap-2">
              {menu.filter((m) => m.visible).map((m) => {
                const subs = m.children.filter((c) => c.visible);
                return (
                  <span key={m.key} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gray-100 text-sm font-semibold text-gray-700" data-testid="preview-main">
                    {m.label}{subs.length > 0 && <ChevronDown size={14} className="text-gray-500" aria-label="فيه فروع" />}
                  </span>
                );
              })}
              {menu.every((m) => !m.visible) && <span className="text-sm text-gray-400">القايمة فاضية.</span>}
            </div>
          </div>

          {selection && (
            <div className="sticky top-2 z-10 bg-blue-600 text-white rounded-2xl shadow-lg px-4 py-3 flex items-center gap-3 flex-wrap" data-testid="group-bar">
              <span className="text-sm font-semibold">اخترت {selection.keys.length} عنصر داخل «{byItemId.get(selection.parentId)?.label}»</span>
              {groupName === null ? (
                <button type="button" onClick={() => setGroupName('')} className="bg-white text-blue-700 text-sm font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5" data-testid="group-start"><Layers size={14} /> تجميع في مجموعة</button>
              ) : (
                <>
                  <input
                    autoFocus
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void submitGroup(); }}
                    placeholder="اسم المجموعة، مثلًا: المواد"
                    className="bg-white text-gray-800 text-sm rounded-xl px-3 py-1.5 w-56"
                    data-testid="group-name"
                  />
                  <button type="button" onClick={() => void submitGroup()} disabled={!groupName.trim() || busy} className="bg-white text-blue-700 text-sm font-bold px-3 py-1.5 rounded-xl disabled:opacity-50" data-testid="group-confirm">تجميع</button>
                </>
              )}
              <button type="button" onClick={() => { setSelection(null); setGroupName(null); }} className="mr-auto p-1.5 rounded-lg hover:bg-blue-500" aria-label="إلغاء الاختيار"><X size={16} /></button>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-50 overflow-hidden" data-testid="menu-list">
            {isLoading && <div className="flex items-center justify-center gap-2 py-10 text-gray-400"><Loader2 size={18} className="animate-spin" /> جارٍ التحميل...</div>}
            {menu.map(renderEntry)}
            {!isLoading && menu.length === 0 && <p className="text-center text-gray-400 py-10 text-sm">القايمة فاضية. اضغط «إضافة عنصر».</p>}
          </div>
        </section>
      )}

      {channel === 'app' && (
        <section className="bg-white rounded-2xl shadow-sm p-5 flex items-start gap-3" data-testid="app-note">
          <Smartphone size={20} className="text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <h2 className="font-bold text-gray-800">التطبيق مفيهوش قايمة علوية</h2>
            <p className="text-sm text-gray-500 mt-1">التطبيق فيه تابات سفلية (الرئيسية، السلة، الطلبات، حسابي). رفوف الرئيسية والشريط تحت متاحين للقراءة، والتعديل عليهم من تاب «شريط التصنيفات» و«الصفحة الرئيسية».</p>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">شريط التصنيفات</h2>
          <Link to="/catalog?tab=menus" className="text-sm font-semibold text-blue-600 hover:underline">تعديل الترتيب والإخفاء</Link>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap gap-2" data-testid="map-bar">
          {bar.map((n) => <span key={n.id} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700">{n.name_ar}</span>)}
          {bar.length === 0 && <span className="text-sm text-gray-400">مفيش تصنيفات في الشريط.</span>}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800" data-testid="shelves-title">رفوف الصفحة الرئيسية ({channel === 'web' ? 'الموقع' : 'التطبيق'})</h2>
          <Link to={channel === 'web' ? '/appearance' : '/catalog?tab=home'} className="text-sm font-semibold text-blue-600 hover:underline">{channel === 'web' ? 'تعديل من «مظهر المتجر»' : 'تعديل من «الصفحة الرئيسية»'}</Link>
        </div>
        <ol className="bg-white rounded-2xl shadow-sm divide-y divide-gray-50" data-testid="map-sections">
          {shelves.map((s, i) => (
            <li key={s.section_key} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="w-6 text-center text-xs font-bold text-blue-700">{i + 1}</span>
              <span className={`flex-1 ${s.visible ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{SHELF_LABELS[s.section_key] ?? s.section_key}</span>
              {s.item_limit != null && <span className="text-xs text-gray-400">{s.item_limit} رف</span>}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${s.visible ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>{s.visible ? 'ظاهر' : 'مخفي'}</span>
            </li>
          ))}
          {shelves.length === 0 && <li className="px-4 py-6 text-center text-gray-400 text-sm">مفيش رفوف.</li>}
        </ol>
      </section>

      {dialog && <MenuItemDialog key={dialog.item?.id ?? `new-${dialog.parentId ?? 'main'}`} target={dialog} items={items} menu={menu} nodes={nodes} onClose={() => setDialog(null)} />}
    </div>
  );
}
