import { useEffect, useState } from 'react';
import { Copy, ExternalLink, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useCategories } from '@/hooks/useSettings';
import { useBookSearch, useBookTitle, useSeriesOptions } from '@/hooks/usePromoCards';
import { STOREFRONT_URL } from '@/lib/storefront';
import {
  STATIC_DESTINATIONS, bookLink, categoryLink, describeLink, parseLink, seriesLink, storePath,
} from '@/lib/promoCards';

const field = 'w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300';

type Kind = 'none' | 'static' | 'category' | 'series' | 'book' | 'custom';
const KINDS: { kind: Kind; label: string }[] = [
  { kind: 'none', label: 'من غير وجهة' },
  { kind: 'static', label: 'صفحة في التطبيق' },
  { kind: 'category', label: 'تصنيف' },
  { kind: 'series', label: 'سلسلة' },
  { kind: 'book', label: 'كتاب' },
  { kind: 'custom', label: 'رابط مخصص' },
];

/**
 * Where a card's button goes: any screen of the app, chosen from lists (never typed by hand, except "custom"), with a
 * "quick navigation" pair next to it: open the same page in the store, and copy the app link.
 */
export default function LinkPicker({ value, onChange }: { value: string | null; onChange: (link: string | null) => void }) {
  const parsed = parseLink(value);
  const [kind, setKind] = useState<Kind>(parsed.kind);
  // Follow the stored link when it changes from outside (after a save), but not while the admin has just switched
  // the kind and not chosen a value yet.
  useEffect(() => { if (parsed.kind !== 'none') setKind(parsed.kind); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: categories = [] } = useCategories();
  const { data: series = [] } = useSeriesOptions();
  const [bookWords, setBookWords] = useState('');
  const { data: found = [], isFetching } = useBookSearch(bookWords);
  const chosenBookId = parsed.kind === 'book' ? parsed.id : null;
  const { data: chosenBookTitle } = useBookTitle(chosenBookId);

  const changeKind = (next: Kind) => {
    setKind(next);
    // A value of another kind does not fit the new one: start the choice again (a fixed screen has a sensible first).
    if (next === 'none') onChange(null);
    else if (next === 'static') onChange(STATIC_DESTINATIONS[0].path);
    else if (parsed.kind !== next) onChange(null);
  };

  const site = storePath(value, { categoryIdByName: (name) => categories.find((c) => c.name === name)?.id });
  const copy = async () => {
    if (!value) return;
    try { await navigator.clipboard.writeText(value); toast.success('تم نسخ الرابط'); } catch { toast.error('تعذّر النسخ'); }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <select value={kind} onChange={(e) => changeKind(e.target.value as Kind)} className={field} aria-label="نوع الوجهة">
          {KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
        </select>

        {kind === 'static' && (
          <select value={parsed.kind === 'static' ? parsed.path : ''} onChange={(e) => onChange(e.target.value)} className={field} aria-label="الصفحة">
            {STATIC_DESTINATIONS.map((d) => <option key={d.path} value={d.path}>{d.label}</option>)}
          </select>
        )}
        {kind === 'category' && (
          <select
            value={parsed.kind === 'category' ? parsed.name : ''}
            onChange={(e) => onChange(e.target.value ? categoryLink(e.target.value) : null)}
            className={field}
            aria-label="التصنيف"
          >
            <option value="">اختار تصنيف…</option>
            {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        )}
        {kind === 'series' && (
          <select
            value={parsed.kind === 'series' ? parsed.id : ''}
            onChange={(e) => {
              const s = series.find((x) => x.id === e.target.value);
              onChange(s ? seriesLink(s.id, s.name) : null);
            }}
            className={field}
            aria-label="السلسلة"
          >
            <option value="">اختار سلسلة…</option>
            {series.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        {kind === 'custom' && (
          <input
            value={parsed.kind === 'custom' ? parsed.path : value ?? ''}
            onChange={(e) => onChange(e.target.value.trim() ? e.target.value : null)}
            dir="ltr"
            placeholder="/search?type=digital"
            className={field}
            aria-label="رابط مخصص جوه التطبيق"
          />
        )}
        {kind === 'book' && (
          <div className="relative">
            <Search size={14} className="absolute top-3 right-3 text-gray-400" />
            <input
              value={bookWords}
              onChange={(e) => setBookWords(e.target.value)}
              placeholder={chosenBookId ? 'ابحث عن كتاب تاني…' : 'ابحث باسم الكتاب…'}
              className={`${field} pr-8`}
              aria-label="ابحث عن كتاب"
            />
          </div>
        )}
      </div>

      {kind === 'book' && bookWords.trim().length >= 2 && (
        <ul className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-50 max-h-44 overflow-auto text-sm">
          {isFetching && <li className="px-3 py-2 text-gray-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> جارٍ البحث…</li>}
          {!isFetching && found.length === 0 && <li className="px-3 py-2 text-gray-400">مفيش كتاب بالاسم ده.</li>}
          {found.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => { onChange(bookLink(b.id)); setBookWords(''); }}
                className="w-full text-right px-3 py-2 hover:bg-indigo-50"
              >
                <span className="font-semibold text-gray-800">{b.title}</span>
                {b.author && <span className="text-xs text-gray-400"> — {b.author}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-500">
          الوجهة: <b className="text-gray-700">{describeLink(value, { book: chosenBookTitle ?? undefined, series: series.find((s) => parsed.kind === 'series' && s.id === parsed.id)?.name })}</b>
        </span>
        <span className="flex-1" />
        {site && (
          <a
            href={`${STOREFRONT_URL}${site}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
            title="يفتح نفس الصفحة في موقع المتجر"
          >
            <ExternalLink size={12} /> فتح في الموقع
          </a>
        )}
        {value && (
          <button type="button" onClick={copy} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200" title="نسخ رابط التطبيق">
            <Copy size={12} /> نسخ الرابط
          </button>
        )}
      </div>
    </div>
  );
}
