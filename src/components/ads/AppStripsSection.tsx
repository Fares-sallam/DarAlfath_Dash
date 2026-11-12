import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2, RotateCcw, Save, Smartphone, Truck } from 'lucide-react';
import { Switch } from './CategoryBarSection';
import { useAppHomeSettings, useSaveAppHomeSettings } from '@/hooks/useAppHome';
import { useShippingOffers } from '@/hooks/useShippingOffers';
import { currentOffer } from '@/lib/shippingOffers';
import {
  DEFAULT_APP_HOME_SETTINGS, DEFAULT_DEPARTMENTS_TITLE, DEFAULT_DONE_TEXT, DEFAULT_PROGRESS_TEXT, MAX_TEXT_LENGTH,
  PLACEHOLDERS, cartProgress, cleanText, fillTemplate, formatAmount, sameSettings, unknownPlaceholders,
  type AppHomeSettings,
} from '@/lib/appHome';

const field = 'w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300';

/** The amount used in the previews when the app has no live free-shipping offer to read the minimum from. */
const SAMPLE_THRESHOLD = 500;

/**
 * The strips the APP adds around the store's own content: the free-shipping bar at the bottom of the cart, and which
 * sections its home screen shows. (The offers strip, the category bar, best sellers and the boxes have their own tabs.)
 */
export default function AppStripsSection() {
  const { data: saved, isLoading, isError, error } = useAppHomeSettings();
  const { data: offers = [] } = useShippingOffers();
  const save = useSaveAppHomeSettings();
  const [draft, setDraft] = useState<AppHomeSettings>(DEFAULT_APP_HOME_SETTINGS);

  // Start from what is saved, and follow it after a save.
  useEffect(() => { if (saved) setDraft(saved); }, [saved]);

  const dirty = !!saved && !sameSettings(saved, draft);
  const set = <K extends keyof AppHomeSettings>(key: K, value: AppHomeSettings[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const appOffer = currentOffer(offers, 'app');
  const threshold = appOffer ? Number(appOffer.min_subtotal) : SAMPLE_THRESHOLD;

  if (isLoading) return <div className="py-12 flex justify-center text-gray-400"><Loader2 className="animate-spin" /></div>;
  if (isError) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
        تعذّر تحميل إعدادات شرايط التطبيق: {error instanceof Error ? error.message : 'خطأ غير معروف'}
        <p className="text-xs text-red-400 mt-1">لو الجدول <code dir="ltr">app_home_settings</code> لسه ما اتعملش، اطلب تطبيق ملف الـmigration الأول.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── The free-shipping bar ── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4" data-testid="app-shipping-bar">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2"><Truck size={16} className="text-indigo-600" /> شريط الشحن المجاني في سلة التطبيق</h2>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              بيظهر أسفل السلة ويقول للعميل أضاف كام وباقي كام عشان ياخد الشحن المجاني. مش بيظهر لسلة كتب إلكترونية (مفيش شحن).
            </p>
          </div>
          <Switch checked={draft.free_shipping_bar_enabled} onChange={(v) => set('free_shipping_bar_enabled', v)} label="إظهار شريط الشحن المجاني" />
        </div>

        <div className={`rounded-xl px-3 py-2 text-xs ${appOffer ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
          {appOffer ? (
            <>أقل مبلغ للشحن المجاني في التطبيق دلوقتي: <b>{Number(appOffer.min_subtotal).toLocaleString('ar-EG')}</b> (عرض «{appOffer.title}»). </>
          ) : (
            <>مفيش عرض شحن مجاني شغال للتطبيق دلوقتي، فالشريط مش هيظهر. </>
          )}
          <Link to="/shipping" className="underline font-semibold">إدارة الشحن ← عروض الشحن المجاني</Link>
        </div>

        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-4 ${draft.free_shipping_bar_enabled ? '' : 'opacity-50 pointer-events-none'}`}>
          <WordingField
            label="الكلام تحت الشريط قبل ما العميل يوصل"
            value={draft.free_shipping_progress_text}
            fallback={DEFAULT_PROGRESS_TEXT}
            onChange={(v) => set('free_shipping_progress_text', v)}
          />
          <WordingField
            label="الكلام لما العميل يوصل للشحن المجاني"
            value={draft.free_shipping_done_text}
            fallback={DEFAULT_DONE_TEXT}
            onChange={(v) => set('free_shipping_done_text', v)}
          />
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">معاينة (زي ما بتظهر في التطبيق){appOffer ? '' : ` — بمبلغ تجريبي ${SAMPLE_THRESHOLD}`}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-2xl bg-gray-100 p-4">
            <BarPreview
              threshold={threshold}
              added={Math.round(threshold * 0.4)}
              progressText={draft.free_shipping_progress_text ?? DEFAULT_PROGRESS_TEXT}
              doneText={draft.free_shipping_done_text ?? DEFAULT_DONE_TEXT}
            />
            <BarPreview
              threshold={threshold}
              added={threshold + 20}
              progressText={draft.free_shipping_progress_text ?? DEFAULT_PROGRESS_TEXT}
              doneText={draft.free_shipping_done_text ?? DEFAULT_DONE_TEXT}
            />
          </div>
        </div>
      </section>

      {/* ── The home screen's own sections ── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-1" data-testid="app-home-sections">
        <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2"><Smartphone size={16} className="text-indigo-600" /> أقسام الرئيسية في التطبيق</h2>
        <p className="text-xs text-gray-500 pb-2 leading-relaxed">
          أقسام التطبيق بتتبني لوحدها من الكتب. هنا بتقفل أو تفتح أي قسم منها. شريط الإعلانات والتصنيفات والأكثر مبيعًا والمربعات من التابات اللي جنبه، والبانر من «صور الصفحة الرئيسية».
        </p>

        <ToggleRow
          title="أقسام المتجر"
          hint="كروت السلاسل (بصورها) تحت البانر. الصور والأسماء والترتيب من «إدارة السلاسل»."
          checked={draft.show_store_departments}
          onChange={(v) => set('show_store_departments', v)}
        >
          <label className="block text-xs text-gray-500 mb-1">عنوان القسم (فاضي = «{DEFAULT_DEPARTMENTS_TITLE}»)</label>
          <input
            value={draft.store_departments_title ?? ''}
            onChange={(e) => set('store_departments_title', e.target.value === '' ? null : e.target.value)}
            maxLength={MAX_TEXT_LENGTH}
            placeholder={DEFAULT_DEPARTMENTS_TITLE}
            className={field}
            aria-label="عنوان أقسام المتجر"
          />
        </ToggleRow>
        <ToggleRow
          title="وصل حديثًا"
          hint="رف أحدث الكتب المضافة."
          checked={draft.show_new_arrivals}
          onChange={(v) => set('show_new_arrivals', v)}
        />
        <ToggleRow
          title="عروض وخصومات"
          hint="رف الكتب اللي سعرها أقل من سعرها المعتاد. لو مفيش خصومات كفاية مش بيظهر لوحده."
          checked={draft.show_offers}
          onChange={(v) => set('show_offers', v)}
        />
        <ToggleRow
          title="المكتبة الإلكترونية"
          hint="الكارت اللي بيفتح الكتب الإلكترونية بس (بيظهر لما يبقى فيه كتاب إلكتروني)."
          checked={draft.show_ebook_library}
          onChange={(v) => set('show_ebook_library', v)}
        />
      </section>

      {/* ── Save bar ── */}
      <div className="sticky bottom-3 flex items-center justify-between gap-3 bg-white/95 backdrop-blur rounded-2xl border border-gray-200 shadow-lg px-4 py-3">
        <p className="text-xs text-gray-500">{dirty ? 'فيه تغييرات لسه ما اتحفظتش.' : 'كل التغييرات محفوظة.'}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDraft({ ...DEFAULT_APP_HOME_SETTINGS })}
            disabled={sameSettings(draft, DEFAULT_APP_HOME_SETTINGS)}
            className="px-3 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-40 flex items-center gap-1.5"
            title="كله شغال بالكلام الافتراضي"
          >
            <RotateCcw size={14} /> الافتراضي
          </button>
          <button
            onClick={() => saved && setDraft(saved)}
            disabled={!dirty}
            className="px-3 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-40"
          >
            تراجع
          </button>
          <button
            onClick={() => save.mutate(normalise(draft))}
            disabled={!dirty || save.isPending}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 flex items-center gap-1.5"
          >
            {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} حفظ
          </button>
        </div>
      </div>
    </div>
  );
}

/** What is stored: every wording trimmed and empty = null (the app's own words). */
function normalise(s: AppHomeSettings): AppHomeSettings {
  return {
    ...s,
    free_shipping_progress_text: s.free_shipping_progress_text ? cleanText(s.free_shipping_progress_text) : null,
    free_shipping_done_text: s.free_shipping_done_text ? cleanText(s.free_shipping_done_text) : null,
    store_departments_title: s.store_departments_title ? cleanText(s.store_departments_title) : null,
  };
}

function WordingField({
  label, value, fallback, onChange,
}: { label: string; value: string | null; fallback: string; onChange: (v: string | null) => void }) {
  const unknown = useMemo(() => unknownPlaceholders(value ?? ''), [value]);
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      <textarea
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        maxLength={MAX_TEXT_LENGTH}
        rows={2}
        placeholder={fallback}
        className={`${field} resize-none`}
        aria-label={label}
      />
      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
        <span className="text-[11px] text-gray-400">ضيف:</span>
        {PLACEHOLDERS.map((p) => (
          <button
            key={p.token}
            type="button"
            onClick={() => onChange(`${value ?? ''}${value && !value.endsWith(' ') ? ' ' : ''}${p.token}`)}
            className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-600 text-[11px] hover:bg-indigo-100"
            title={p.label}
          >
            {p.label} <span dir="ltr" className="opacity-60">{p.token}</span>
          </button>
        ))}
      </div>
      {unknown.length > 0 && (
        <p className="text-[11px] text-amber-600 mt-1">
          الكلمة <span dir="ltr">{unknown.join(' ')}</span> مش معروفة وهتظهر للعميل زي ما هي. المعروف: <span dir="ltr">{PLACEHOLDERS.map((p) => p.token).join(' ')}</span>
        </p>
      )}
    </div>
  );
}

function ToggleRow({
  title, hint, checked, onChange, children,
}: { title: string; hint: string; checked: boolean; onChange: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className="py-3 border-t border-gray-50 first:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-800">{title}</p>
          <p className="text-xs text-gray-500 mt-0.5">{hint}</p>
        </div>
        <Switch checked={checked} onChange={onChange} label={`إظهار ${title}`} />
      </div>
      {children && <div className={`mt-2 ${checked ? '' : 'opacity-50 pointer-events-none'}`}>{children}</div>}
    </div>
  );
}

/** The bar as the app draws it: what was added, what is left, the fill, and the wording. */
function BarPreview({
  threshold, added, progressText, doneText,
}: { threshold: number; added: number; progressText: string; doneText: string }) {
  const p = cartProgress(threshold, added);
  const values = { added: formatAmount(added), remaining: formatAmount(p.remaining), threshold: formatAmount(threshold) };
  const tone = p.reached ? 'border-green-300 bg-green-50 text-green-700' : 'border-amber-300 bg-amber-50 text-amber-700';
  return (
    <div className={`rounded-xl border px-3 py-2.5 space-y-1.5 ${tone}`} data-testid="bar-preview">
      <div className="flex items-center gap-2 text-gray-800 text-sm">
        {p.reached ? <CheckCircle2 size={16} className="text-green-600" /> : <Truck size={16} className="text-amber-600" />}
        <span className="flex-1 font-medium">أضفت {values.added} ج.م</span>
        {!p.reached && <span className="font-bold">باقي {values.remaining} ج.م</span>}
      </div>
      <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-full rounded-full ${p.reached ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${Math.round(p.fraction * 100)}%` }} />
      </div>
      <p className="text-xs">{fillTemplate(p.reached ? doneText : progressText, values)}</p>
    </div>
  );
}
