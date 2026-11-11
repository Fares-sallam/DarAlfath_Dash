import { useRef, useState, type ReactNode } from 'react';
import { ImagePlus, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { uploadLinksImage } from '@/hooks/useLinksPageAdmin';
import {
  COLOR_STYLES, COLOR_STYLE_LABEL, DIVIDER_TYPES, DIVIDER_TYPE_LABEL, ICON_OPTIONS, isImageUrl,
  type ColorStyle, type DividerType,
} from '@/lib/linksPage';
import { LinkIcon } from '../linkIcons';
import { Divider } from '../LinksPageView';
import '../linksPage.css';

/* Small form pieces shared by the editors of the company links page. */

export const field =
  'w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 disabled:opacity-60';

export function Field({
  label, hint, error, children, className = '',
}: { label: string; hint?: string; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`} role="group" aria-label={label}>
      <span className="text-xs font-semibold text-gray-600">{label}</span>
      {children}
      {hint && !error && <span className="text-[11px] text-gray-400 leading-relaxed">{hint}</span>}
      {error && <span className="text-[11px] text-red-600 font-medium">{error}</span>}
    </div>
  );
}

/** A few choices on one line, one of them on. */
export function Segmented<T extends string>({
  value, options, onChange, label,
}: { value: T; options: { key: T; label: string }[]; onChange: (next: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 p-1 bg-gray-100 rounded-xl">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${on ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const SWATCH: Record<ColorStyle, string> = {
  primary: 'linear-gradient(135deg, #054180 50%, #067e70 50%)',
  navy: '#054180',
  teal: '#2aa3ab',
  green: '#067e70',
  mint: '#dae8e6',
  outline: 'transparent',
};

/** The house palette, as swatches. */
export function ColorPicker({ value, onChange }: { value: ColorStyle; onChange: (next: ColorStyle) => void }) {
  return (
    <div role="radiogroup" aria-label="اللون" className="flex flex-wrap gap-2">
      {COLOR_STYLES.map((c) => {
        const on = c === value;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(c)}
            className={`flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
              on ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span
              className="w-5 h-5 rounded-full border border-black/10 flex-shrink-0"
              style={{ background: SWATCH[c], ...(c === 'outline' ? { border: '2px solid #054180' } : null) }}
              aria-hidden
            />
            {COLOR_STYLE_LABEL[c]}
          </button>
        );
      })}
    </div>
  );
}

/** Every icon a link can wear, one tap each. */
export function IconPicker({ value, onChange }: { value: string | null; onChange: (next: string | null) => void }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5 max-h-44 overflow-y-auto p-1">
        {ICON_OPTIONS.map((o) => {
          const on = o.key === value;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onChange(o.key)}
              title={o.label}
              aria-label={o.label}
              aria-pressed={on}
              className={`h-10 rounded-lg border flex items-center justify-center transition-colors ${
                on ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <LinkIcon name={o.key} size={19} />
            </button>
          );
        })}
      </div>
      {value && (
        <button type="button" onClick={() => onChange(null)} className="text-xs text-gray-500 hover:text-red-600">
          بدون أيقونة
        </button>
      )}
    </div>
  );
}

/** A picture: upload one (it is shrunk first) or paste an address. */
export function ImageField({
  value, onChange, hint, error,
}: { value: string | null; onChange: (next: string | null) => void; hint?: string; error?: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await uploadLinksImage(file));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذّر رفع الصورة');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-3">
        <div className="w-28 h-20 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center flex-shrink-0">
          {isImageUrl(value) ? <img src={value!} alt="" className="w-full h-full object-cover" /> : <ImagePlus size={22} className="text-gray-300" />}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {value ? 'استبدال الصورة' : 'رفع صورة'}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                <Trash2 size={14} /> إزالة
              </button>
            )}
          </div>
          <input
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value.trim() || null)}
            dir="ltr"
            placeholder="أو الصق رابط صورة (https://...)"
            aria-label="رابط الصورة"
            className={field}
          />
        </div>
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      {hint && !error && <p className="text-[11px] text-gray-400">{hint}</p>}
      {error && <p className="text-[11px] text-red-600 font-medium">{error}</p>}
    </div>
  );
}

/** ISO time to the value a datetime-local field shows (local time), and back. */
export const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

/** When a block shows: from and until, both optional. */
export function ScheduleFields({
  startsAt, endsAt, onChange,
}: { startsAt: string | null; endsAt: string | null; onChange: (patch: { starts_at?: string | null; ends_at?: string | null }) => void }) {
  const wrong = Boolean(startsAt && endsAt && new Date(endsAt) <= new Date(startsAt));
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-gray-600">
          يظهر من (اختياري)
          <input type="datetime-local" value={toLocalInput(startsAt)} onChange={(e) => onChange({ starts_at: fromLocalInput(e.target.value) })} className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-gray-600">
          يختفي في (اختياري)
          <input type="datetime-local" value={toLocalInput(endsAt)} onChange={(e) => onChange({ ends_at: fromLocalInput(e.target.value) })} className={field} />
        </label>
      </div>
      {wrong && <p className="text-[11px] text-red-600 font-medium">تاريخ الاختفاء لازم يكون بعد تاريخ الظهور.</p>}
    </div>
  );
}

/** The divider types, each drawn the way the page draws it. */
export function DividerTypePicker({ value, onChange }: { value: DividerType; onChange: (next: DividerType) => void }) {
  return (
    <div role="radiogroup" aria-label="نوع الفاصل" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {DIVIDER_TYPES.map((t) => {
        const on = t === value;
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(t)}
            className={`rounded-xl border p-2 text-center transition-colors ${on ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
          >
            {/* the page's own look, on the page's own ground */}
            <span className="lp-root lp-shape-rounded block rounded-lg h-10 !min-h-0 overflow-hidden" data-lp-theme="light">
              <span className="flex h-full items-center">
                {t === 'space' ? (
                  <span className="mx-auto text-[11px] text-gray-400">مسافة</span>
                ) : (
                  <span className="block w-full"><Divider type={t} length="long" /></span>
                )}
              </span>
            </span>
            <span className={`block mt-1.5 text-[11px] font-semibold ${on ? 'text-indigo-700' : 'text-gray-600'}`}>{DIVIDER_TYPE_LABEL[t]}</span>
          </button>
        );
      })}
    </div>
  );
}
