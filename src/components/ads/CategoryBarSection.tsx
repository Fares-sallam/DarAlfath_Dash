import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Save } from 'lucide-react';
import {
  useCategoryBarRows, useSaveCategoryBar, useSiteContentSettings, useUpdateSiteContentSettings, type CategoryBarRow,
} from '@/hooks/useAdsStrips';

/** An on/off switch with a real checkbox underneath (keyboard and screen readers). */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0" title={label}>
      <input type="checkbox" className="sr-only peer" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
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

  const move = (index: number, dir: -1 | 1) =>
    setDraft((list) => {
      const next = [...list];
      const target = index + dir;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const shown = draft.filter((r) => r.is_visible && r.books > 0);
  const allBooks = content?.all_books_in_bar ?? true;

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
          <p className="text-xs text-gray-500">رتّب التصنيفات بالأسهم، وشغّل أو اقفل كل واحد. التصنيف اللي مفيهوش كتب مش بيظهر حتى لو مفعّل.</p>
          <button onClick={() => saveBar.mutate(draft)} disabled={!dirty || saveBar.isPending} className="btn-primary flex items-center gap-2 disabled:opacity-40 flex-shrink-0">
            {saveBar.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            حفظ الترتيب والظهور
          </button>
        </div>
        {isLoading ? (
          <div className="py-12 flex justify-center text-gray-400"><Loader2 className="animate-spin" /></div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {draft.map((row, i) => (
              <li key={row.id} className="flex items-center gap-3 px-4 py-2.5" data-testid="category-bar-row">
                <div className="flex flex-col">
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`نقل ${row.name} لأعلى`} className="p-0.5 rounded text-gray-400 hover:text-indigo-600 disabled:opacity-20"><ArrowUp size={14} /></button>
                  <button onClick={() => move(i, 1)} disabled={i === draft.length - 1} aria-label={`نقل ${row.name} لأسفل`} className="p-0.5 rounded text-gray-400 hover:text-indigo-600 disabled:opacity-20"><ArrowDown size={14} /></button>
                </div>
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
