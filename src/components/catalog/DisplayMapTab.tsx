import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, EyeOff, Loader2, Pencil, Pin, Plus, Smartphone, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ads/CategoryBarSection';
import { useCatalogNodes } from '@/hooks/useCatalog';
import {
  useCreateMenuItem, useDeleteMenuItem, useHomeLayout, useMaterializeMenuChildren, useMenuItems, useMoveMenuItem,
  useReorderMenuItems, useUpdateMenuItem,
} from '@/hooks/useMenuItems';
import { MENU_KIND_LABELS, nextMenuSort, placementProblem, placementText, resolveMenu, type ResolvedMenuItem } from '@/lib/menuMap';
import { stepInList, type DropZone } from '@/lib/dragSort';
import MenuItemDialog, { type MenuDialogTarget } from './MenuItemDialog';
import { Grip, gripButtonClass, useDragRows } from './useDragRows';

const SECTION_LABELS: Record<string, string> = {
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

/** The whole display, top to bottom: the top menu (main and sub-items), the category bar, the home sections. */
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

  const [channel, setChannel] = useState<Channel>('web');
  const [dialog, setDialog] = useState<MenuDialogTarget | null>(null);

  const menu = useMemo(() => resolveMenu(items, nodes, 'web'), [items, nodes]);
  const mains = items.filter((i) => i.parent_id === null);
  const busy = create.isPending || update.isPending || remove.isPending || reorder.isPending || move.isPending || materialize.isPending;

  const bar = useMemo(
    () =>
      nodes
        .filter((n) => (n.type === 'category' || n.type === 'collection') && n.is_active && n.show_in_bar_app)
        .sort((a, b) => a.sort_app - b.sort_app || a.name_ar.localeCompare(b.name_ar, 'ar')),
    [nodes],
  );
  const sections = layout.filter((l) => l.channel === channel).sort((a, b) => a.sort_order - b.sort_order);

  /** The stored sub-items (or the main items) of a parent, in the order they are drawn. */
  const orderOf = (parentId: string | null): string[] =>
    parentId === null
      ? menu.map((m) => m.item!.id)
      : (menu.find((m) => m.item!.id === parentId)?.children ?? []).filter((c) => c.item).map((c) => c.item!.id);

  /** One step with the keyboard (the grip focused, then the up and down arrows). */
  const step = (id: string, dir: -1 | 1) => {
    const item = items.find((i) => i.id === id);
    const ids = item ? stepInList(orderOf(item.parent_id), id, dir) : null;
    if (ids) reorder.mutate(ids);
  };

  /**
   * Dropped above or below an item = placed next to it, at its level (a sub-item dropped beside a main item becomes
   * main; a main item dropped beside a sub-item becomes a sub-item); dropped in the middle of a main item = placed inside it.
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
    allowInside: (id) => items.find((i) => i.id === id)?.parent_id === null,
    canDrop: (dragId, targetId, zone) => {
      const target = items.find((i) => i.id === targetId);
      if (!target || dragId === targetId) return false;
      if (zone === 'inside' && target.parent_id !== null) return false;
      return placementProblem(items, dragId, zone === 'inside' ? target.id : target.parent_id) === null;
    },
    onDrop: (dragId, targetId, zone) => void dropItem(dragId, targetId, zone),
  });

  const confirmDelete = (entry: ResolvedMenuItem) => {
    if (!entry.item) return;
    const subs = entry.children.filter((c) => c.item).length;
    const text = subs > 0 ? `حذف «${entry.label}» وفروعه (${subs})؟` : `حذف «${entry.label}» من القايمة؟`;
    if (window.confirm(text)) remove.mutate(entry.item.id);
  };

  /** A sub-item that is filled automatically can be hidden: that stores a hidden row for the same child. */
  const hideAuto = (entry: ResolvedMenuItem) => {
    if (!entry.parent?.item || !entry.nodeId) return;
    create.mutate({
      kind: 'node', node_id: entry.nodeId, parent_id: entry.parent.item.id, visible: false,
      sort_order: nextMenuSort(items, 'web', entry.parent.item.id),
    });
  };

  const iconBtn = 'p-1.5 rounded-lg disabled:opacity-30';

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
            <div>
              <h2 className="text-lg font-bold text-gray-800">القايمة العلوية</h2>
              <p className="text-xs text-gray-500">الأسهم ▾ اللي في الهيدر: كل عنصر إما رئيسي أو فرعي جوه رئيسي معيّن. اسحب أي عنصر من المقبض: فوق/تحت عنصر عشان ترتّبه، وفي نص عنصر رئيسي عشان يبقى فرعي جواه، وجنب رئيسي عشان يبقى رئيسي.</p>
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

          <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-50" data-testid="menu-list">
            {isLoading && <div className="flex items-center justify-center gap-2 py-10 text-gray-400"><Loader2 size={18} className="animate-spin" /> جارٍ التحميل...</div>}
            {menu.map((main) => {
              const subs = main.children;
              const autoCount = subs.filter((s) => s.auto).length;
              return (
                <div key={main.key} data-testid="menu-main" data-id={main.item!.id}>
                  <div className={`flex items-center gap-2 px-4 py-3 flex-wrap ${dnd.rowClass(main.item!.id)}`} data-testid="menu-main-row" {...dnd.rowProps(main.item!.id)}>
                    <button type="button" className={gripButtonClass} data-testid="drag-handle" {...dnd.handleProps(main.item!.id, main.label, (dir) => step(main.item!.id, dir))}><Grip /></button>
                    <div className="flex-1 min-w-[160px]">
                      <p className={`text-sm font-bold ${main.visible ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{main.label}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700">{placementText(main)}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600">{MENU_KIND_LABELS[main.kind]}</span>
                        {subs.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700">فيه {subs.length} فرع{autoCount > 0 ? ` (${autoCount} تلقائي)` : ''}</span>}
                      </div>
                    </div>
                    <Switch checked={main.visible} onChange={(v) => update.mutate({ id: main.item!.id, patch: { visible: v } })} label={`إظهار ${main.label}`} />
                    <button type="button" onClick={() => setDialog({ item: null, parentId: main.item!.id })} className="text-xs font-semibold text-emerald-700 hover:bg-emerald-50 px-2.5 py-1.5 rounded-lg flex items-center gap-1" aria-label={`إضافة فرع داخل ${main.label}`}><Plus size={13} /> فرع</button>
                    {main.kind === 'node' && (autoCount > 0 || main.item!.auto_children) && (
                      <button type="button" onClick={() => materialize.mutate(main.item!.id)} disabled={busy} className="text-xs font-semibold text-amber-700 hover:bg-amber-50 px-2.5 py-1.5 rounded-lg flex items-center gap-1" title="تحويل الفروع التلقائية لفروع ثابتة تتحكم فيها" aria-label={`تثبيت فروع ${main.label}`} data-testid="materialize"><Pin size={13} /> تثبيت الفروع</button>
                    )}
                    <button type="button" onClick={() => setDialog({ item: main.item })} className={`${iconBtn} hover:bg-blue-100 text-blue-600`} title="تعديل" aria-label={`تعديل ${main.label}`}><Pencil size={14} /></button>
                    <button type="button" onClick={() => confirmDelete(main)} disabled={busy} className={`${iconBtn} hover:bg-red-100 text-red-500`} title="حذف" aria-label={`حذف ${main.label}`}><Trash2 size={14} /></button>
                  </div>

                  {subs.length > 0 && (
                    <div className="bg-gray-50/60 border-t border-gray-50" data-testid="menu-subs">
                      {subs.map((sub) => (
                        <div key={sub.key} className={`flex items-center gap-2 px-4 py-2 pr-12 flex-wrap ${sub.item ? dnd.rowClass(sub.item.id) : ''}`} data-testid="menu-sub" data-auto={sub.auto ? 'true' : 'false'} {...(sub.item ? dnd.rowProps(sub.item.id) : {})}>
                          {sub.item ? (
                            <button type="button" className={gripButtonClass} data-testid="drag-handle" {...dnd.handleProps(sub.item.id, sub.label, (dir) => step(sub.item!.id, dir))}><Grip /></button>
                          ) : <span className="w-[32px]" />}
                          <div className="flex-1 min-w-[150px]">
                            <p className={`text-sm ${sub.visible ? 'text-gray-700' : 'text-gray-400 line-through'} ${sub.auto ? 'italic' : 'font-semibold'}`}>{sub.label}</p>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-700" data-testid="sub-placement">{placementText(sub)}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${sub.auto ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>{sub.auto ? 'تلقائي من الشجرة' : MENU_KIND_LABELS[sub.kind]}</span>
                            </div>
                          </div>
                          {sub.item ? (
                            <>
                              <select
                                value={main.item!.id}
                                onChange={(e) => move.mutate({ id: sub.item!.id, parentId: e.target.value === '' ? null : e.target.value })}
                                disabled={busy}
                                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                                aria-label={`نقل ${sub.label}`}
                                data-testid="sub-move"
                              >
                                <option value="">اجعله رئيسي</option>
                                {mains.map((m) => <option key={m.id} value={m.id}>{`داخل: ${menu.find((x) => x.item?.id === m.id)?.label ?? ''}`}</option>)}
                              </select>
                              <Switch checked={sub.visible} onChange={(v) => update.mutate({ id: sub.item!.id, patch: { visible: v } })} label={`إظهار ${sub.label}`} />
                              <button type="button" onClick={() => setDialog({ item: sub.item })} className={`${iconBtn} hover:bg-blue-100 text-blue-600`} title="تعديل" aria-label={`تعديل ${sub.label}`}><Pencil size={13} /></button>
                              <button type="button" onClick={() => confirmDelete(sub)} disabled={busy} className={`${iconBtn} hover:bg-red-100 text-red-500`} title="حذف" aria-label={`حذف ${sub.label}`}><Trash2 size={13} /></button>
                            </>
                          ) : (
                            <button type="button" onClick={() => hideAuto(sub)} disabled={busy} className="text-xs font-semibold text-gray-600 hover:bg-gray-100 px-2.5 py-1.5 rounded-lg flex items-center gap-1" aria-label={`إخفاء ${sub.label}`} data-testid="hide-auto"><EyeOff size={13} /> إخفاء</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {!isLoading && menu.length === 0 && <p className="text-center text-gray-400 py-10 text-sm">القايمة فاضية. اضغط «إضافة عنصر».</p>}
          </div>
        </section>
      )}

      {channel === 'app' && (
        <section className="bg-white rounded-2xl shadow-sm p-5 flex items-start gap-3" data-testid="app-note">
          <Smartphone size={20} className="text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <h2 className="font-bold text-gray-800">التطبيق مفيهوش قايمة علوية</h2>
            <p className="text-sm text-gray-500 mt-1">التطبيق فيه تابات سفلية (الرئيسية، السلة، الطلبات، حسابي). شكل الرئيسية والشريط تحت متاحين للقراءة، والتعديل عليهم من تاب «القوائم والأشرطة» و«الصفحة الرئيسية».</p>
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
          <h2 className="text-lg font-bold text-gray-800">أقسام الصفحة الرئيسية ({channel === 'web' ? 'الموقع' : 'التطبيق'})</h2>
          <Link to={channel === 'web' ? '/appearance' : '/catalog?tab=home'} className="text-sm font-semibold text-blue-600 hover:underline">{channel === 'web' ? 'تعديل من «مظهر المتجر»' : 'تعديل من «الصفحة الرئيسية»'}</Link>
        </div>
        <ol className="bg-white rounded-2xl shadow-sm divide-y divide-gray-50" data-testid="map-sections">
          {sections.map((s, i) => (
            <li key={s.section_key} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="w-6 text-center text-xs font-bold text-blue-700">{i + 1}</span>
              <span className={`flex-1 ${s.visible ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{SECTION_LABELS[s.section_key] ?? s.section_key}</span>
              {s.item_limit != null && <span className="text-xs text-gray-400">{s.item_limit} رف</span>}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${s.visible ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>{s.visible ? 'ظاهر' : 'مخفي'}</span>
            </li>
          ))}
          {sections.length === 0 && <li className="px-4 py-6 text-center text-gray-400 text-sm">مفيش أقسام.</li>}
        </ol>
      </section>

      {dialog && <MenuItemDialog key={dialog.item?.id ?? `new-${dialog.parentId ?? 'main'}`} target={dialog} items={items} nodes={nodes} onClose={() => setDialog(null)} />}
    </div>
  );
}
