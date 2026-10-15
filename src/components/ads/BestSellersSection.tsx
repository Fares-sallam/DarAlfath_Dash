import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Loader2, Minus, Plus, Save, Trophy, Wand2 } from 'lucide-react';
import { useBestSellerPicks, useBookSales, useSaveBestSellerPicks, type SalesWindow } from '@/hooks/useAdsStrips';
import { topSellerIds, type BookSales } from '@/lib/bestSellers';

const WINDOWS: { value: SalesWindow; label: string }[] = [
  { value: 30, label: 'آخر 30 يوم' },
  { value: 90, label: 'آخر 90 يوم' },
  { value: 'all', label: 'من البداية' },
];

/** The row reads best with a few books in it: fewer than this gets a note. */
const FEW = 4;

const money = (n: number) => `${n.toLocaleString('ar-EG')} ج.م`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export default function BestSellersSection() {
  const [span, setSpan] = useState<SalesWindow>(90);
  const { data: ranking = [], isLoading, isError, error } = useBookSales(span);
  const { data: saved } = useBestSellerPicks();
  const savePicks = useSaveBestSellerPicks();

  const [picks, setPicks] = useState<string[]>([]);
  useEffect(() => {
    if (saved) setPicks(saved);
  }, [saved]);
  const dirty = saved != null && JSON.stringify(picks) !== JSON.stringify(saved);

  const byId = useMemo(() => new Map(ranking.map((r) => [r.id, r])), [ranking]);
  const toggle = (id: string) => setPicks((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const move = (index: number, dir: -1 | 1) =>
    setPicks((list) => {
      const next = [...list];
      const target = index + dir;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const autoFill = () => {
    const top = topSellerIds(ranking, 8);
    setPicks(top);
  };
  const sold = ranking.filter((r) => r.rank != null).length;

  return (
    <div className="space-y-5">
      {/* The row as it will be on the home page. */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2"><Trophy size={16} className="text-amber-500" /> صف «الأكثر مبيعًا» في الرئيسية</h2>
            <p className="text-xs text-gray-400">بالترتيب ده بالظبط. لو فاضي، الصف مش بيظهر في الموقع.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={autoFill} disabled={isLoading || sold === 0} className="btn-secondary flex items-center gap-2 disabled:opacity-40" title="أعلى 8 كتب مبيعًا في الفترة المختارة، من الكتب الظاهرة في المتجر">
              <Wand2 size={15} /> اختيار الأعلى مبيعًا تلقائيًا
            </button>
            <button onClick={() => savePicks.mutate({ picks, before: saved ?? [] })} disabled={!dirty || savePicks.isPending} className="btn-primary flex items-center gap-2 disabled:opacity-40">
              {savePicks.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              حفظ الصف
            </button>
          </div>
        </div>

        {picks.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">مفيش كتب في الصف. اختار من الجدول تحت، أو دوس «اختيار الأعلى مبيعًا تلقائيًا».</p>
        ) : (
          <ol className="flex gap-3 overflow-x-auto pb-2" data-testid="best-sellers-picks">
            {picks.map((id, i) => {
              const book = byId.get(id);
              return (
                <li key={id} className="w-32 flex-shrink-0 rounded-xl border border-gray-100 p-2 space-y-1.5 bg-gray-50/50">
                  <div className="aspect-square rounded-lg bg-white overflow-hidden flex items-center justify-center">
                    {book?.cover_url ? <img src={book.cover_url} alt="" className="w-full h-full object-contain" /> : <BookOpen size={20} className="text-gray-300" />}
                  </div>
                  <p className="text-xs font-semibold text-gray-700 line-clamp-2 min-h-[2rem]">{book?.title ?? 'كتاب محذوف'}</p>
                  {book && !book.is_active && <p className="text-[10px] text-amber-600">مخفي من المتجر، مش هيظهر</p>}
                  <div className="flex items-center justify-between">
                    <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="قدّمه" className="p-1 rounded text-gray-400 hover:text-indigo-600 disabled:opacity-20"><ChevronRight size={14} /></button>
                    <span className="text-[11px] text-gray-400">{i + 1}</span>
                    <button onClick={() => move(i, 1)} disabled={i === picks.length - 1} aria-label="أخّره" className="p-1 rounded text-gray-400 hover:text-indigo-600 disabled:opacity-20"><ChevronLeft size={14} /></button>
                    <button onClick={() => toggle(id)} aria-label={`شيل ${book?.title ?? ''} من الصف`} className="p-1 rounded text-gray-400 hover:text-red-600"><Minus size={13} /></button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {picks.length > 0 && picks.length < FEW && (
          <p className="text-xs text-amber-600">الصف بيبان أحسن من {FEW} كتب أو أكتر.</p>
        )}
        {dirty && <p className="text-xs text-amber-600">فيه تغييرات لسه ما اتحفظتش.</p>}
      </div>

      {/* Every book with its sales, best first: which one has earned its place. */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-50">
          <div>
            <h3 className="text-sm font-bold text-gray-800">مبيعات الكتب</h3>
            <p className="text-xs text-gray-400">الطلبات الملغية والمرتجعة مش محسوبة. الترتيب بعدد النسخ، وبعدين الإيراد.</p>
          </div>
          <div className="inline-flex bg-gray-100 rounded-xl p-1 gap-1" role="group" aria-label="الفترة">
            {WINDOWS.map((w) => (
              <button
                key={String(w.value)}
                onClick={() => setSpan(w.value)}
                aria-pressed={span === w.value}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${span === w.value ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center text-gray-400"><Loader2 className="animate-spin" /></div>
        ) : isError ? (
          <p className="py-10 text-center text-sm text-red-500">{error instanceof Error ? error.message : 'تعذّر تحميل المبيعات'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="book-sales-table">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-right font-semibold">#</th>
                  <th className="px-3 py-2 text-right font-semibold">الكتاب</th>
                  <th className="px-3 py-2 text-right font-semibold">النسخ المباعة</th>
                  <th className="px-3 py-2 text-right font-semibold">الإيراد</th>
                  <th className="px-3 py-2 text-right font-semibold">الطلبات</th>
                  <th className="px-3 py-2 text-right font-semibold">آخر بيع</th>
                  <th className="px-3 py-2 text-right font-semibold">المخزون</th>
                  <th className="px-3 py-2 text-right font-semibold">في الصف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ranking.map((row) => <SalesRow key={row.id} row={row} picked={picks.includes(row.id)} onToggle={() => toggle(row.id)} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SalesRow({ row, picked, onToggle }: { row: BookSales; picked: boolean; onToggle: () => void }) {
  return (
    <tr className={picked ? 'bg-amber-50/40' : undefined} data-testid="book-sales-row">
      <td className="px-3 py-2 text-gray-400">{row.rank ?? '—'}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2 min-w-[12rem]">
          <div className="w-9 h-9 rounded-lg bg-gray-50 overflow-hidden flex items-center justify-center flex-shrink-0">
            {row.cover_url ? <img src={row.cover_url} alt="" loading="lazy" className="w-full h-full object-contain" /> : <BookOpen size={14} className="text-gray-300" />}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-800 truncate max-w-[16rem]">{row.title}</p>
            <p className="text-[11px] text-gray-400">
              {row.is_bundle ? 'مجموعة' : row.author ?? ''}
              {!row.is_active && <span className="text-amber-600"> · مخفي من المتجر</span>}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-2 font-bold text-gray-800">{row.units.toLocaleString('ar-EG')}</td>
      <td className="px-3 py-2 text-gray-600">{money(row.revenue)}</td>
      <td className="px-3 py-2 text-gray-600">{row.orders.toLocaleString('ar-EG')}</td>
      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{day(row.lastSoldAt)}</td>
      <td className="px-3 py-2 text-gray-600">{row.stock == null ? '—' : row.stock.toLocaleString('ar-EG')}</td>
      <td className="px-3 py-2">
        <button
          onClick={onToggle}
          disabled={!row.is_active && !picked}
          aria-pressed={picked}
          aria-label={picked ? `شيل ${row.title} من الصف` : `ضيف ${row.title} للصف`}
          title={!row.is_active && !picked ? 'الكتاب مخفي من المتجر' : undefined}
          className={`w-8 h-8 rounded-lg flex items-center justify-center border ${picked ? 'bg-amber-500 border-amber-500 text-white' : 'border-gray-200 text-gray-500 hover:bg-gray-50'} disabled:opacity-30`}
        >
          {picked ? <Minus size={14} /> : <Plus size={14} />}
        </button>
      </td>
    </tr>
  );
}
