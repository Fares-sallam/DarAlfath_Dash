import { useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import LinkPicker from '@/components/promo/LinkPicker';
import { ImageSlot } from '@/components/promo/PromoCardsSection';
import { useBookTitles } from '@/hooks/useHomeShelves';
import { useBookSearch, uploadHomeBlockImage } from '@/hooks/usePromoCards';
import { useCountries } from '@/hooks/useSettings';
import { fieldsFor, type BlockDraft } from '@/lib/homeBlockDraft';
import {
  BOOK_SHELF_KIND, CUSTOM_META, FILTER_SHELF_KIND, FILTER_SOURCES, MAX_PICKED_BOOKS, PROMO_KIND, PROMO_TONES, blockDefaults,
  type Devices, type FilterSource, type HomeChannel, type PromoTone,
} from '@/lib/homeBlocks';
import { reorderRelative, stepInList } from '@/lib/dragSort';
import { SHELF_KIND } from '@/lib/homeShelves';
import { Grip, gripButtonClass, useDragRows } from './useDragRows';

const DEVICE_LABELS: Record<Devices, string> = { all: 'كل الأجهزة', mobile: 'الموبايل بس', desktop: 'الكمبيوتر بس' };

export interface NodeChoice { id: string; label: string }

interface Props {
  channel: HomeChannel;
  draft: BlockDraft;
  onChange: (next: BlockDraft) => void;
  /** the nodes a category shelf (or a rule shelf's scope) can be made from */
  nodes: NodeChoice[];
  problem: string;
  saving: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

const heading = (draft: BlockDraft) => {
  if (draft.std) return null;
  if (draft.kind === SHELF_KIND) return 'رف تصنيف';
  if (draft.kind === BOOK_SHELF_KIND || draft.kind === FILTER_SHELF_KIND || draft.kind === PROMO_KIND) return CUSTOM_META[draft.kind].label;
  return null;
};

/**
 * The form for one block of the home page, whatever its kind: the words, what is inside (a node, picked books, a rule or a
 * promo's picture / link / button), and when and where it shows (dates; countries and devices on the website).
 */
export default function HomeBlockForm({ channel, draft, onChange, nodes, problem, saving, onSubmit, onCancel }: Props) {
  const isNew = draft.key === null;
  const fields = fieldsFor(draft, channel);
  const set = (patch: Partial<BlockDraft>) => onChange({ ...draft, ...patch });
  const defaults = draft.std ? blockDefaults(draft.std, channel) : null;
  const scopeName = nodes.find((n) => n.id === draft.nodeId)?.label.split(': ').slice(1).join(': ');
  const titleHint = defaults?.title
    ?? (draft.kind === BOOK_SHELF_KIND ? 'كتب مختارة'
      : draft.kind === FILTER_SHELF_KIND ? FILTER_SOURCES[draft.source].title
        : draft.kind === PROMO_KIND ? 'العنوان' : scopeName ?? 'لو فاضي بنكتب اسم التصنيف');
  const limitLabel = defaults?.limitLabel ?? 'عدد الكتب';
  const limitHint = defaults?.limit != null ? String(defaults.limit) : draft.kind === FILTER_SHELF_KIND ? '12' : 'الكل';
  const isPromo = draft.kind === PROMO_KIND;

  return (
    <div className="p-5 bg-gray-50 border-b border-gray-100 space-y-4" data-testid="shelf-form">
      {heading(draft) && <p className="text-sm font-bold text-gray-700" data-testid="form-kind">{isNew ? 'إضافة ' : 'تعديل '}{heading(draft)}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {draft.kind === SHELF_KIND && isNew && (
          <label className="block md:col-span-3">
            <span className="block text-sm font-semibold text-gray-700 mb-1.5">التصنيف / السلسلة</span>
            <select value={draft.nodeId} onChange={(e) => set({ nodeId: e.target.value })} className="input-field" data-testid="shelf-node">
              <option value="">— اختار —</option>
              {nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
          </label>
        )}

        {draft.kind === FILTER_SHELF_KIND && (
          <>
            <label className="block">
              <span className="block text-sm font-semibold text-gray-700 mb-1.5">القاعدة</span>
              <select value={draft.source} onChange={(e) => set({ source: e.target.value as FilterSource })} className="input-field" data-testid="filter-source">
                {(Object.keys(FILTER_SOURCES) as FilterSource[]).map((k) => <option key={k} value={k}>{FILTER_SOURCES[k].label}</option>)}
              </select>
            </label>
            <label className="block md:col-span-2">
              <span className="block text-sm font-semibold text-gray-700 mb-1.5">من أنهي جزء؟</span>
              <select value={draft.nodeId} onChange={(e) => set({ nodeId: e.target.value })} className="input-field" data-testid="filter-node">
                <option value="">المتجر كله</option>
                {nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
            </label>
          </>
        )}

        {fields.includes('title') && (
          <label className={`block ${fields.includes('subtitle') && !isPromo ? '' : 'md:col-span-2'}`}>
            <span className="block text-sm font-semibold text-gray-700 mb-1.5">{isPromo ? 'العنوان' : 'العنوان (اختياري)'}</span>
            <input value={draft.title} onChange={(e) => set({ title: e.target.value })} className="input-field" maxLength={isPromo ? 120 : 80} placeholder={titleHint} data-testid="shelf-title" />
          </label>
        )}
        {fields.includes('subtitle') && !isPromo && (
          <label className="block">
            <span className="block text-sm font-semibold text-gray-700 mb-1.5">السطر تحت العنوان (اختياري)</span>
            <input value={draft.subtitle} onChange={(e) => set({ subtitle: e.target.value })} className="input-field" maxLength={120}
              placeholder={defaults?.subtitle ?? (draft.kind === FILTER_SHELF_KIND ? FILTER_SOURCES[draft.source].subtitle : 'لو فاضي بنكتب سطر جاهز')} data-testid="shelf-subtitle" />
          </label>
        )}
        {fields.includes('limit') && (
          <label className="block">
            <span className="block text-sm font-semibold text-gray-700 mb-1.5">{limitLabel} (اختياري)</span>
            <input value={draft.limit} onChange={(e) => set({ limit: e.target.value })} inputMode="numeric" className="input-field" placeholder={limitHint} data-testid="shelf-limit" />
          </label>
        )}
        {isPromo && (
          <label className="block md:col-span-3">
            <span className="block text-sm font-semibold text-gray-700 mb-1.5">النص (اختياري)</span>
            <textarea value={draft.subtitle} onChange={(e) => set({ subtitle: e.target.value })} className="input-field min-h-[72px]" maxLength={400} data-testid="shelf-subtitle" />
          </label>
        )}
      </div>

      {draft.kind === BOOK_SHELF_KIND && <BookPicker ids={draft.productIds} onChange={(productIds) => set({ productIds })} />}

      {isPromo && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-testid="promo-fields">
          <div data-testid="promo-image">
            <ImageSlot label="الصورة (اختيارية)" value={draft.imageUrl} onChange={(imageUrl) => set({ imageUrl })} upload={uploadHomeBlockImage} />
          </div>
          <div className="md:col-span-2 space-y-3">
            <div>
              <span className="block text-sm font-semibold text-gray-700 mb-1.5">الزر يفتح إيه؟ (اختياري)</span>
              <LinkPicker value={draft.linkUrl} onChange={(linkUrl) => set({ linkUrl })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-sm font-semibold text-gray-700 mb-1.5">كلمة الزر</span>
                <input value={draft.buttonLabel} onChange={(e) => set({ buttonLabel: e.target.value })} maxLength={40} className="input-field" placeholder="تصفح الآن" data-testid="promo-button" />
              </label>
              <label className="block">
                <span className="block text-sm font-semibold text-gray-700 mb-1.5">اللون</span>
                <select value={draft.tone} onChange={(e) => set({ tone: e.target.value as PromoTone })} className="input-field" data-testid="promo-tone">
                  {(Object.keys(PROMO_TONES) as PromoTone[]).map((t) => <option key={t} value={t}>{PROMO_TONES[t]}</option>)}
                </select>
              </label>
            </div>
            <p className="text-xs text-gray-400">الرابط صفحة جوه التطبيق، والموقع بيفتح الصفحة المقابلة ليها. لو مفيش مقابل، الزر مش بيظهر في الموقع.</p>
          </div>
        </div>
      )}

      <WindowFields channel={channel} draft={draft} onChange={set} />

      {problem && <p className="text-sm text-red-600" data-testid="shelf-problem">{problem}</p>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={onSubmit} disabled={saving} className="btn-primary flex items-center gap-1.5 disabled:opacity-50" data-testid="shelf-save">
          {saving && <Loader2 size={14} className="animate-spin" />} {isNew ? 'إضافة' : 'حفظ'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">إلغاء</button>
      </div>
    </div>
  );
}

/** When it shows (dates), and on the website where (countries) and on what (phones or computers). */
function WindowFields({ channel, draft, onChange }: { channel: HomeChannel; draft: BlockDraft; onChange: (patch: Partial<BlockDraft>) => void }) {
  const { data: countries = [] } = useCountries();
  const toggle = (code: string) =>
    onChange({ countries: draft.countries.includes(code) ? draft.countries.filter((c) => c !== code) : [...draft.countries, code] });
  return (
    <fieldset className="rounded-xl border border-gray-200 bg-white p-4 space-y-3" data-testid="block-window">
      <legend className="px-2 text-sm font-bold text-gray-700">متى وفين يظهر</legend>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs font-semibold text-gray-600 mb-1">يبدأ من (اختياري)</span>
          <input type="datetime-local" value={draft.startsAt} onChange={(e) => onChange({ startsAt: e.target.value })} className="input-field" data-testid="block-starts" />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-600 mb-1">ينتهي في (اختياري)</span>
          <input type="datetime-local" value={draft.endsAt} onChange={(e) => onChange({ endsAt: e.target.value })} className="input-field" data-testid="block-ends" />
        </label>
      </div>
      {channel === 'web' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <span className="block text-xs font-semibold text-gray-600 mb-1">الدول (سيبها فاضية = كل الدول)</span>
            <div className="flex flex-wrap gap-2" data-testid="block-countries">
              {countries.map((c) => (
                <label key={c.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer ${draft.countries.includes(c.code.toUpperCase()) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
                  <input type="checkbox" className="accent-blue-600" checked={draft.countries.includes(c.code.toUpperCase())} onChange={() => toggle(c.code.toUpperCase())} data-testid={`block-country-${c.code.toUpperCase()}`} />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">الجهاز</span>
            <select value={draft.devices} onChange={(e) => onChange({ devices: e.target.value as Devices })} className="input-field" data-testid="block-devices">
              {(Object.keys(DEVICE_LABELS) as Devices[]).map((d) => <option key={d} value={d}>{DEVICE_LABELS[d]}</option>)}
            </select>
          </label>
        </div>
      ) : (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2" data-testid="window-app-note">
          التطبيق متجر واحد وموبايل بس، فالتحكم هنا بالتاريخ. والتاريخ بيشتغل في نسخة التطبيق الجاية (النسخة الحالية بتتبع مفتاح الإظهار بس).
        </p>
      )}
    </fieldset>
  );
}

/** Choose books by name and put them in the order they should show. */
function BookPicker({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) {
  const [words, setWords] = useState('');
  const { data: found = [], isFetching } = useBookSearch(words);
  const { data: titles } = useBookTitles(ids);
  const full = ids.length >= MAX_PICKED_BOOKS;
  const add = (id: string) => { if (!ids.includes(id) && !full) onChange([...ids, id]); setWords(''); };
  const move = (next: string[] | null) => { if (next) onChange(next); };
  const dnd = useDragRows({ onDrop: (dragId, targetId, zone) => move(reorderRelative(ids, dragId, targetId, zone === 'after' ? 'after' : 'before')) });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3" data-testid="book-picker">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-gray-700">الكتب</span>
        <span className="text-xs text-gray-400">{ids.length} من {MAX_PICKED_BOOKS}</span>
      </div>
      <div className="relative">
        <Search size={14} className="absolute top-3 right-3 text-gray-400" />
        <input value={words} onChange={(e) => setWords(e.target.value)} placeholder={full ? 'وصلت للحد الأقصى' : 'ابحث باسم الكتاب لإضافته…'} disabled={full}
          className="input-field pr-8" aria-label="ابحث عن كتاب" data-testid="picker-search" />
      </div>
      {words.trim().length >= 2 && (
        <ul className="rounded-xl border border-gray-200 divide-y divide-gray-50 max-h-44 overflow-auto text-sm" data-testid="picker-results">
          {isFetching && <li className="px-3 py-2 text-gray-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> جارٍ البحث…</li>}
          {!isFetching && found.length === 0 && <li className="px-3 py-2 text-gray-400">مفيش كتاب بالاسم ده.</li>}
          {found.map((b) => (
            <li key={b.id}>
              <button type="button" disabled={ids.includes(b.id)} onClick={() => add(b.id)} className="w-full text-right px-3 py-2 hover:bg-blue-50 disabled:opacity-40" data-testid={`picker-add-${b.id}`}>
                <span className="font-semibold text-gray-800">{b.title}</span>
                {b.author && <span className="text-xs text-gray-400"> — {b.author}</span>}
                {ids.includes(b.id) && <span className="text-xs text-emerald-600"> (مضاف)</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {ids.length === 0 ? (
        <p className="text-sm text-gray-400" data-testid="picker-empty">لسه ما اخترتش كتب.</p>
      ) : (
        <ol className="divide-y divide-gray-50 rounded-xl border border-gray-100" data-testid="picker-chosen">
          {ids.map((id, i) => {
            const info = titles?.get(id);
            const name = info?.title ?? (titles ? 'كتاب اتحذف' : '…');
            return (
              <li key={id} className={`flex items-center gap-3 px-3 py-2 ${dnd.rowClass(id)}`} data-testid="picker-row" {...dnd.rowProps(id)}>
                <button type="button" className={gripButtonClass} {...dnd.handleProps(id, name, (dir) => move(stepInList(ids, id, dir)))}><Grip /></button>
                <span className="w-5 text-xs text-gray-400 text-center">{i + 1}</span>
                <span className={`flex-1 min-w-0 truncate text-sm ${info ? 'text-gray-800' : 'text-gray-400'}`}>{name}{info?.author && <span className="text-xs text-gray-400"> — {info.author}</span>}</span>
                <button type="button" onClick={() => onChange(ids.filter((x) => x !== id))} className="p-1 rounded-lg hover:bg-red-100 text-red-500" aria-label={`شيل ${name}`} data-testid={`picker-remove-${id}`}><X size={14} /></button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
