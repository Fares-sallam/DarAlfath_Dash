import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Loader2, RotateCcw, Save } from 'lucide-react';
import { useHeaderNavSetting, useSaveHeaderNav } from '@/hooks/useAdsStrips';
import { useSeriesList } from '@/hooks/useSeries';
import {
  HEADER_NAV_FIXED, defaultHeaderNav, resolveHeaderNav, seriesIdOf, type HeaderNavEntry,
} from '@/lib/headerNav';
import { Switch } from './CategoryBarSection';

/** The store's top menu bar: the order of its items and which ones show, with a live preview. */
export default function HeaderNavSection() {
  const { data: saved, isLoading: loadingSaved, isError, error } = useHeaderNavSetting();
  const { data: series = [], isLoading: loadingSeries } = useSeriesList();
  const save = useSaveHeaderNav();

  const seriesIds = useMemo(() => series.map((s) => s.id), [series]);
  const seriesById = useMemo(() => new Map(series.map((s) => [s.id, s])), [series]);
  const resolved = useMemo(() => resolveHeaderNav(saved, seriesIds), [saved, seriesIds]);

  // Edited here, saved together.
  const [draft, setDraft] = useState<HeaderNavEntry[]>([]);
  useEffect(() => {
    if (!loadingSaved && !loadingSeries) setDraft(resolved);
  }, [resolved, loadingSaved, loadingSeries]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(resolved);
  const isDefault = JSON.stringify(draft) === JSON.stringify(defaultHeaderNav(seriesIds));

  const move = (index: number, dir: -1 | 1) =>
    setDraft((list) => {
      const target = index + dir;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const toggle = (index: number, visible: boolean) =>
    setDraft((list) => list.map((e, i) => (i === index ? { ...e, visible } : e)));

  /** What an item is called, and why it may not show on the store even when switched on. */
  const describe = (entry: HeaderNavEntry) => {
    const sid = seriesIdOf(entry.key);
    if (!sid) {
      const fixed = HEADER_NAV_FIXED[entry.key as keyof typeof HEADER_NAV_FIXED];
      return { label: fixed?.label ?? entry.key, kind: 'رابط ثابت', note: null as string | null, isSeries: false };
    }
    const s = seriesById.get(sid);
    let note: string | null = null;
    if (s && !s.is_active) note = 'السلسلة متوقفة، مش هتظهر';
    else if (s && (s.books_count ?? 0) === 0) note = 'مفيش فيها كتب، مش هتظهر';
    return { label: s?.name ?? 'سلسلة', kind: 'سلسلة (قائمة منسدلة)', note, isSeries: true };
  };

  const previewItems = draft.filter((e) => e.visible && !describe(e).note);

  if (isError) {
    return (
      <div className="bg-white rounded-2xl border border-red-100 p-6 text-sm text-red-600">
        تعذّر تحميل إعداد شريط القائمة: {error instanceof Error ? error.message : 'خطأ غير معروف'}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Live preview, drawn like the store's bar ── */}
      <div className="rounded-2xl overflow-hidden border border-gray-100">
        <p className="text-xs font-semibold text-gray-500 px-4 py-2 bg-gray-50">
          معاينة شريط القائمة (زي ما هيظهر في الموقع على الكمبيوتر)
        </p>
        <div
          dir="rtl"
          data-testid="header-nav-preview"
          className="flex items-center gap-1 overflow-x-auto px-4 py-3 bg-[#f4f8f8]"
        >
          {previewItems.length === 0 ? (
            <span className="text-xs text-gray-400">الشريط هيبقى فاضي</span>
          ) : (
            previewItems.map((entry, i) => {
              const info = describe(entry);
              const active = entry.key === 'home';
              return (
                <span key={entry.key} className="flex items-center gap-1 flex-shrink-0">
                  {i > 0 && <span className="w-px h-5 bg-gray-300 mx-2" aria-hidden />}
                  <span
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-bold whitespace-nowrap text-[#054180] ${
                      active ? 'border-2 border-[#054180] bg-[#dae8e6]' : ''
                    }`}
                  >
                    {info.label}
                    {info.isSeries && <ChevronDown size={14} />}
                  </span>
                </span>
              );
            })
          )}
        </div>
      </div>

      {/* ── The list to order and switch ── */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-50 flex-wrap">
          <p className="text-xs text-gray-500">
            رتّب العناصر بالأسهم (الأول بيظهر في أقصى اليمين)، وشغّل أو اقفل كل واحد. السلسلة الجديدة بتظهر تلقائيًا بعد آخر سلسلة.
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setDraft(defaultHeaderNav(seriesIds))}
              disabled={isDefault}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              title="الرئيسية، الكتب، السلاسل بترتيبها في صفحة السلاسل، تواصل معنا"
            >
              <RotateCcw size={13} />
              الترتيب الافتراضي
            </button>
            <button
              onClick={() => save.mutate(draft)}
              disabled={!dirty || save.isPending}
              className="btn-primary flex items-center gap-2 disabled:opacity-40"
            >
              {save.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              حفظ الشريط
            </button>
          </div>
        </div>

        {loadingSaved || loadingSeries ? (
          <div className="py-12 flex justify-center text-gray-400"><Loader2 className="animate-spin" /></div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {draft.map((entry, i) => {
              const info = describe(entry);
              return (
                <li key={entry.key} className={`flex items-center gap-3 px-4 py-3 ${entry.visible ? '' : 'opacity-60'}`}>
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                      aria-label={`حرّك ${info.label} لأعلى`}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === draft.length - 1}
                      className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                      aria-label={`حرّك ${info.label} لأسفل`}
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                  <span className="w-6 text-center text-xs font-bold text-gray-400">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">{info.label}</p>
                    <p className="text-[11px] text-gray-400">{info.kind}</p>
                    {info.note && <p className="text-[11px] text-amber-600 font-semibold">{info.note}</p>}
                  </div>
                  <Switch checked={entry.visible} label={`إظهار ${info.label} في الشريط`} onChange={(next) => toggle(i, next)} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
