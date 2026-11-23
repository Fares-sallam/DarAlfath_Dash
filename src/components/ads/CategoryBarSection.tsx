import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Loader2, Save } from 'lucide-react';
import { Grip, gripButtonClass, useDragRows } from '@/components/catalog/useDragRows';
import { reorderRelative, stepInList } from '@/lib/dragSort';
import {
  useCategoryBarRows, useSaveCategoryBar, useSiteContentSettings, useUpdateSiteContentSettings, type CategoryBarRow,
} from '@/hooks/useAdsStrips';

/** An on/off switch with a real checkbox underneath (keyboard and screen readers). */
export function Switch({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={`relative inline-flex items-center flex-shrink-0 ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`} title={label}>
      <input type="checkbox" className="sr-only peer" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className="w-10 h-6 rounded-full bg-gray-200 peer-checked:bg-green-500 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-300" />
      <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:-translate-x-4" />
    </label>
  );
}

export default function CategoryBarSection() {
  const { data: rows, isLoading } = useCategoryBarRows();
  const { data: content } = useSiteContentSettings();
  const updateContent = useUpdateSiteContentSettings();
  const saveBar = useSaveCategoryBar();

  // Edited here, saved together.
  const [draft, setDraft] = useState<CategoryBarRow[]>([]);
  useEffect(() => {
    if (rows) setDraft(rows);
  }, [rows]);

  const dirty = useMemo(
    () => rows != null && JSON.stringify(draft.map((r) => [r.id, r.is_visible])) !== JSON.stringify(rows.map((r) => [r.id, r.is_visible])),
    [draft, rows],
  );

  const applyOrder = (list: CategoryBarRow[], ids: string[] | null) =>
    ids ? ids.map((id) => list.find((r) => r.id === id)!) : list;
  const step = (id: string, dir: -1 | 1) => setDraft((list) => applyOrder(list, stepInList(list.map((r) => r.id), id, dir)));
  const dnd = useDragRows({
    onDrop: (dragId, targetId, zone) =>
      setDraft((list) => applyOrder(list, reorderRelative(list.map((r) => r.id), dragId, targetId, zone === 'after' ? 'after' : 'before'))),
  });

  const shown = draft.filter((r) => r.is_visible && r.books > 0);
  const allBooks = content?.all_books_in_bar ?? true;

  // One click for the whole strip: every category, and «كل الكتب» at its head, closed (the strip then disappears from the
  // website and the app) or opened. It is saved at once, with the order as it stands here.
  const everythingClosed = draft.every((r) => !r.is_visible) && !allBooks;
  const everythingOpen = draft.every((r) => r.is_visible) && allBooks;
  const bulk = saveBar.isPending || updateContent.isPending;
  const setAll = async (open: boolean) => {
    if (!open && !window.confirm('هتقفل الشريط كله: كل التصنيفات و«كل الكتب». هيختفي من الموقع والتطبيق. تكمل؟')) return;
    const next = draft.map((r) => ({ ...r, is_visible: open }));
    setDraft(next);
    try {
      await saveBar.mutateAsync(next);
      await updateContent.mutateAsync({ all_books_in_bar: open });
    } catch {
      // the message is already shown
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl overflow-hidden border border-gray-100 bg-[#fbf6ed]">
        <p className="text-xs font-semibold text-gray-500 px-4 py-2 bg-gray-50">معاينة شريط التصنيفات</p>
        <div className="flex gap-2 overflow-x-auto px-4 py-3" data-testid="category-bar-preview">
          {allBooks && <span className="px-3 py-1.5 rounded-full border border-[#d8b15b] bg-white text-xs font-bold whitespace-nowrap">كل الكتب</span>}
          {shown.map((r) => (
            <span key={r.id} className="px-3 py-1.5 rounded-full border border-[#e6d3ad] bg-white text-xs font-bold whitespace-nowrap">{r.name}</span>
          ))}
          {!allBooks && shown.length === 0 && <span className="text-xs text-gray-400">الشريط مش هيظهر</span>}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-gray-800">«كل الكتب» في أول الشريط</p>
          <p className="text-xs text-gray-400">بيفتح صفحة الكتب كلها.</p>
        </div>
        <Switch checked={allBooks} label="إظهار كل الكتب في الشريط" onChange={(next) => updateContent.mutate({ all_books_in_bar: next })} />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-50">
          <p className="text-xs text-gray-500">رتّب التصنيفات بالسحب من المقبض، وشغّل أو اقفل كل واحد. التصنيف اللي مفيهوش كتب مش بيظهر حتى لو مفعّل.</p>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <button type="button" onClick={() => void setAll(false)} disabled={bulk || everythingClosed || isLoading} className="btn-secondary flex items-center gap-1.5 text-sm disabled:opacity-40" title="يقفل كل التصنيفات و«كل الكتب» مرة واحدة، فالشريط يختفي خالص" data-testid="bar-close-all">
              <EyeOff size={14} /> غلق الكل
            </button>
            <button type="button" onClick={() => void setAll(true)} disabled={bulk || everythingOpen || isLoading} className="btn-secondary flex items-center gap-1.5 text-sm disabled:opacity-40" title="يفتح كل التصنيفات و«كل الكتب» مرة واحدة" data-testid="bar-open-all">
              <Eye size={14} /> فتح الكل
            </button>
            <button onClick={() => saveBar.mutate(draft)} disabled={!dirty || saveBar.isPending} className="btn-primary flex items-center gap-2 disabled:opacity-40">
              {saveBar.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              حفظ الترتيب والظهور
            </button>
          </div>
        </div>
        {isLoading ? (
          <div className="py-12 flex justify-center text-gray-400"><Loader2 className="animate-spin" /></div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {draft.map((row, i) => (
              <li key={row.id} className={`flex items-center gap-3 px-4 py-2.5 ${dnd.rowClass(row.id)}`} data-testid="category-bar-row" {...dnd.rowProps(row.id)}>
                <button type="button" className={gripButtonClass} data-testid="drag-handle" {...dnd.handleProps(row.id, row.name, (dir) => step(row.id, dir))}><Grip /></button>
                <span className="w-6 text-xs text-gray-400 text-center">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${row.is_visible ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{row.name}</p>
                  <p className="text-xs text-gray-400">
                    {row.books > 0 ? `${row.books} كتاب` : <span className="text-amber-600">مفيش كتب فيه، مش هيظهر</span>}
                  </p>
                </div>
                <Switch
                  checked={row.is_visible}
                  label={`إظهار ${row.name}`}
                  onChange={(next) => setDraft((list) => list.map((r) => (r.id === row.id ? { ...r, is_visible: next } : r)))}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
