import { useMemo, useState } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ads/CategoryBarSection';
import { useCreateMenuItem, useMoveMenuItem, useUpdateMenuItem } from '@/hooks/useMenuItems';
import { NODE_TYPE_LABELS, buildTree, type CatalogNode } from '@/lib/catalogTree';
import {
  MENU_KIND_LABELS, itemLabel, nextMenuSort, placementProblem, validMenuUrl, type MenuItem, type MenuKind,
} from '@/lib/menuMap';

export interface MenuDialogTarget {
  /** the item being edited, or null to create one */
  item: MenuItem | null;
  /** when creating: the main item it goes inside (null = a main item) */
  parentId?: string | null;
}

const KINDS: MenuKind[] = ['node', 'group', 'link', 'home', 'books', 'contact'];

/** Add or edit one menu entry, with an explicit "inside what" choice. */
export default function MenuItemDialog({ target, items, nodes, onClose }: { target: MenuDialogTarget; items: MenuItem[]; nodes: CatalogNode[]; onClose: () => void }) {
  const existing = target.item;
  const create = useCreateMenuItem();
  const update = useUpdateMenuItem();
  const move = useMoveMenuItem();

  const [kind, setKind] = useState<MenuKind>(existing?.kind ?? 'node');
  const [nodeId, setNodeId] = useState(existing?.node_id ?? '');
  const [labelAr, setLabelAr] = useState(existing?.label_ar ?? '');
  const [labelEn, setLabelEn] = useState(existing?.label_en ?? '');
  const [url, setUrl] = useState(existing?.url ?? '');
  const [parentId, setParentId] = useState<string>(existing ? (existing.parent_id ?? '') : (target.parentId ?? ''));
  const [visible, setVisible] = useState(existing?.visible ?? true);
  const [autoChildren, setAutoChildren] = useState(existing?.auto_children ?? (existing === null && kind === 'node'));

  const mains = items.filter((i) => i.parent_id === null && i.id !== existing?.id);
  const nodeOptions = useMemo(() => buildTree(nodes, 'web', new Set(nodes.map((n) => n.id))), [nodes]);
  const busy = create.isPending || update.isPending || move.isPending;
  const isMain = parentId === '';

  const save = async () => {
    if (kind === 'node' && !nodeId) { toast.error('اختار العنصر من السلاسل والتصنيفات'); return; }
    if ((kind === 'link' || kind === 'group') && !labelAr.trim()) { toast.error('اكتب اسم العنصر'); return; }
    if (kind === 'link' && !validMenuUrl(url)) { toast.error('الرابط لازم يبدأ بـ / (صفحة في الموقع) أو https://'); return; }
    if (existing) {
      const problem = placementProblem(items, existing.id, parentId || null);
      if (problem) { toast.error(problem); return; }
    }

    const fields = {
      node_id: kind === 'node' ? nodeId : null,
      label_ar: labelAr.trim() || null,
      label_en: labelEn.trim() || null,
      url: kind === 'link' ? url.trim() : null,
      visible,
      auto_children: kind === 'node' && isMain ? autoChildren : false,
    };

    if (existing) {
      const patch: Partial<MenuItem> = {};
      (Object.keys(fields) as (keyof typeof fields)[]).forEach((key) => {
        if (fields[key] !== existing[key]) (patch as Record<string, unknown>)[key] = fields[key];
      });
      if (Object.keys(patch).length > 0) await update.mutateAsync({ id: existing.id, patch });
      if ((parentId || null) !== existing.parent_id) await move.mutateAsync({ id: existing.id, parentId: parentId || null });
      toast.success('تم الحفظ');
    } else {
      await create.mutateAsync({ kind, ...fields, parent_id: parentId || null, sort_order: nextMenuSort(items, 'web', parentId || null) });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto" dir="rtl" data-testid="menu-dialog">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl my-6 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800">{existing ? `تعديل «${itemLabel(existing, nodes)}»` : 'إضافة عنصر للقايمة'}</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500" aria-label="إغلاق"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <label className="block">
            <span className="block text-sm font-semibold text-gray-700 mb-1.5">نوع العنصر</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as MenuKind)} disabled={!!existing} className="input-field" data-testid="menu-kind">
              {KINDS.map((k) => <option key={k} value={k}>{MENU_KIND_LABELS[k]}</option>)}
            </select>
          </label>

          {kind === 'node' && (
            <label className="block">
              <span className="block text-sm font-semibold text-gray-700 mb-1.5">العنصر</span>
              <select value={nodeId} onChange={(e) => setNodeId(e.target.value)} className="input-field" data-testid="menu-node">
                <option value="">— اختار —</option>
                {nodeOptions.map((row) => (
                  <option key={row.node.id} value={row.node.id}>{`${'— '.repeat(row.depth)}${NODE_TYPE_LABELS[row.node.type]}: ${row.node.name_ar}`}</option>
                ))}
              </select>
            </label>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-sm font-semibold text-gray-700 mb-1.5">الاسم بالعربي {kind === 'link' || kind === 'group' ? '*' : '(اختياري)'}</span>
              <input value={labelAr} onChange={(e) => setLabelAr(e.target.value)} className="input-field" placeholder={kind === 'node' ? 'لو فاضي بنستخدم اسم العنصر' : ''} data-testid="menu-label-ar" />
            </label>
            <label className="block">
              <span className="block text-sm font-semibold text-gray-700 mb-1.5">الاسم بالإنجليزي</span>
              <input value={labelEn} onChange={(e) => setLabelEn(e.target.value)} className="input-field" dir="ltr" />
            </label>
          </div>

          {kind === 'link' && (
            <label className="block">
              <span className="block text-sm font-semibold text-gray-700 mb-1.5">الرابط *</span>
              <input value={url} onChange={(e) => setUrl(e.target.value)} className="input-field" dir="ltr" placeholder="/books  أو  https://..." data-testid="menu-url" />
            </label>
          )}

          <label className="block">
            <span className="block text-sm font-semibold text-gray-700 mb-1.5">مكانه في القايمة</span>
            <select value={parentId} onChange={(e) => setParentId(e.target.value)} className="input-field" data-testid="menu-parent">
              <option value="">رئيسي (على الشريط نفسه)</option>
              {mains.map((m) => <option key={m.id} value={m.id}>{`فرعي داخل: ${itemLabel(m, nodes)}`}</option>)}
            </select>
            <span className="block text-xs text-gray-500 mt-1">القايمة مستويين: رئيسي، أو فرعي جوه رئيسي معيّن (بيظهر كسهم ▾ جنب الرئيسي).</span>
          </label>

          <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
            <span className="text-sm font-semibold text-gray-700">ظاهر في القايمة</span>
            <Switch checked={visible} onChange={setVisible} label="ظاهر في القايمة" />
          </div>
          {kind === 'node' && isMain && (
            <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
              <div>
                <span className="text-sm font-semibold text-gray-700">ملء الفروع تلقائيًا من الشجرة</span>
                <p className="text-xs text-gray-500">اللي تحت العنصر في الشجرة بيظهر كفروع لوحده.</p>
              </div>
              <Switch checked={autoChildren} onChange={setAutoChildren} label="ملء الفروع تلقائيًا" />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold hover:bg-gray-50">إلغاء</button>
          <button type="button" onClick={() => void save()} disabled={busy} className="btn-primary flex items-center gap-2 disabled:opacity-50" data-testid="menu-save">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {existing ? 'حفظ' : 'إضافة'}
          </button>
        </div>
      </div>
    </div>
  );
}
