import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ExternalLink, Loader2, Moon, Palette, RotateCcw, Save, Sun, Undo2 } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Switch } from '@/components/ads/CategoryBarSection';
import DisplayDetails from '@/components/appearance/DisplayDetails';
import ControlHistory from '@/components/appearance/ControlHistory';
import StrengthSlider from '@/components/appearance/StrengthSlider';
import StripSample from '@/components/appearance/StripSample';
import { Segmented } from '@/components/links/admin/ui';
import { useSaveStorefrontAppearance, useStorefrontAppearanceAdmin } from '@/hooks/useStorefrontAppearance';
import {
  BRAND_COLORS, BUTTON_COLORS, BUTTON_KEYS, BUTTON_META, DEFAULT_APPEARANCE, NIGHT_COLORS, PREVIEW_PARAM,
  STRIP_ARRANGEMENTS, STRIP_ARRANGEMENT_LABEL, TONES, TONE_LABELS, buttonPaint, encodePreview, resolveAppearance,
  type ButtonColor, type ButtonKey, type NightColor, type StoreTheme, type StorefrontAppearance, type StripArrangement, type Tone,
} from '@/lib/appearance';
import { STOREFRONT_URL } from '@/lib/storefront';

const signature = (a: StorefrontAppearance) => JSON.stringify(resolveAppearance(a));

const SWATCH_BG: Record<NightColor, string> = {
  same: 'linear-gradient(135deg, #ffffff 0 50%, #0a2a52 50% 100%)',
  default: 'repeating-linear-gradient(45deg, #e5e7eb 0 4px, #f9fafb 4px 8px)',
  navy: BRAND_COLORS.navy.hex,
  teal: BRAND_COLORS.teal.hex,
  green: BRAND_COLORS.green.hex,
  mint: BRAND_COLORS.mint.hex,
};

const COLOR_NAME: Record<NightColor, string> = {
  same: 'نفس لون النهار',
  default: 'الأصلي',
  navy: BRAND_COLORS.navy.label,
  teal: BRAND_COLORS.teal.label,
  green: BRAND_COLORS.green.label,
  mint: BRAND_COLORS.mint.label,
};

/** What a button looks like with no colour chosen, in each theme (as the store designed it), for the sample. */
const ORIGINAL_SAMPLE: Record<StoreTheme, { background: string; color: string; borderColor: string }> = {
  light: { background: '#eef3f9', color: '#054180', borderColor: '#dbe5f1' },
  dark: { background: 'rgba(42, 163, 171, 0.12)', color: '#2aa3ab', borderColor: '#0a4a8a' },
};

const THEME_LABEL: Record<StoreTheme, string> = { light: 'الوضع الفاتح (النهاري)', dark: 'الوضع الليلي' };

/**
 * مظهر المتجر: what the store looks like and how its home page is put together, set here and read by the store
 * itself. The pattern's strength, which home sections show and in what order, and the colour of four buttons
 * (only the four house colours, in five tones). «معاينة المتجر» opens the real store with what is on screen,
 * saved or not; nothing reaches customers until it is saved.
 */
function LookAdmin({ onRestored }: { onRestored: () => void }) {
  const { data, isLoading, isError, error } = useStorefrontAppearanceAdmin();
  const save = useSaveStorefrontAppearance();

  const [draft, setDraft] = useState<StorefrontAppearance>(DEFAULT_APPEARANCE);
  const [ready, setReady] = useState(false);
  const [baseRevision, setBaseRevision] = useState<string | null>(null);
  /** Which theme's button colours are being edited: the store has a day look and a night look. */
  const [theme, setTheme] = useState<StoreTheme>('light');

  const saved = data?.appearance;
  const dirty = ready && saved !== undefined && signature(draft) !== signature(saved);
  const dirtyNow = useRef(false);
  dirtyNow.current = dirty;

  useEffect(() => {
    if (!saved) return;
    if (!ready || !dirtyNow.current) {
      setDraft(saved);
      setBaseRevision(data?.revision ?? null);
      setReady(true);
    }
  }, [saved, ready, data?.revision]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const patch = (next: Partial<StorefrontAppearance>) => setDraft((d) => ({ ...d, ...next }));

  const setButton = (key: ButtonKey, change: Partial<{ color: NightColor; tone: Tone }>) => {
    const current = draft.button_styles[key];
    const next = theme === 'light'
      ? {
          ...current,
          ...(change.color !== undefined ? { color: change.color as ButtonColor } : null),
          ...(change.tone !== undefined ? { tone: change.tone } : null),
          // choosing the original colour puts the tone back to the middle
          ...(change.color === 'default' ? { tone: 0 as Tone } : null),
        }
      : {
          ...current,
          night: {
            ...current.night,
            ...(change.color !== undefined ? { color: change.color } : null),
            ...(change.tone !== undefined ? { tone: change.tone } : null),
            ...(change.color === 'default' || change.color === 'same' ? { tone: 0 as Tone } : null),
          },
        };
    patch({ button_styles: { ...draft.button_styles, [key]: next } });
  };

  const previewUrl = useMemo(() => `${STOREFRONT_URL}?${PREVIEW_PARAM}=${encodePreview(draft)}`, [draft]);

  const tableMissing = data?.tableMissing === true;
  const isDefault = signature(draft) === signature(DEFAULT_APPEARANCE);

  return (
    <>
      <div className="space-y-5 pb-28" data-testid="appearance-page">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Palette className="text-amber-500" size={24} />
              مظهر المتجر
            </h1>
            <p className="text-sm text-gray-500 mt-1 max-w-2xl">
              درجة الباترن، وترتيب أقسام الرئيسية وإظهارها، وألوان أزرار المتجر من ألوان الهوية. جرّب وعاين في المتجر الحقيقي قبل ما تحفظ.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="appearance-preview"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
            >
              <ExternalLink size={14} /> معاينة المتجر بالتعديلات
            </a>
            <button
              type="button"
              onClick={() => setDraft(DEFAULT_APPEARANCE)}
              disabled={isDefault}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              <RotateCcw size={14} /> رجوع للتصميم الأصلي
            </button>
          </div>
        </div>

        {isLoading && <div className="py-24 flex justify-center text-gray-400"><Loader2 className="animate-spin" /></div>}

        {isError && (
          <div className="bg-white rounded-2xl border border-red-100 p-6 space-y-2" role="alert">
            <p className="text-sm font-bold text-red-600">تعذّر تحميل الصفحة</p>
            <p className="text-sm text-gray-600">{error instanceof Error ? error.message : 'خطأ غير معروف'}</p>
          </div>
        )}

        {tableMissing && (
          <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4 flex gap-3" role="alert" data-testid="appearance-missing">
            <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
            <p className="text-sm text-amber-800">
              تحديث قاعدة البيانات الخاص بالصفحة دي لسه ما اتطبقش، فتقدر تجرّب وتعاين لكن مش هتقدر تحفظ لحد ما يتطبق.
            </p>
          </div>
        )}

        {ready && (
          <div className="grid gap-5 lg:grid-cols-2">
            {/* ── the pattern ── */}
            <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 lg:col-span-2" data-testid="appearance-pattern">
              <div>
                <h2 className="text-sm font-bold text-gray-700">الباترن في المتجر</h2>
                <p className="text-[11px] text-gray-400 mt-1">
                  بيأثر على الباترن ورا الصفحة الرئيسية وعلى شريط الباترن وخلفية التذييل وصفحة تسجيل العملاء (دخول وإنشاء حساب).
                  وصفحة الروابط ليها شريط تاني منفصل في «إدارة الصفحة والروابط ← إعدادات الصفحة».
                </p>
              </div>
              <div className="max-w-md">
                <StrengthSlider
                  label="درجة وضوح الباترن في المتجر"
                  value={draft.pattern_strength}
                  onChange={(pattern_strength) => patch({ pattern_strength })}
                  testId="store-pattern-strength"
                />
              </div>
            </section>

            {/* ── the pattern strips ── */}
            <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 lg:col-span-2" data-testid="appearance-strip">
              <div>
                <h2 className="text-sm font-bold text-gray-700">شريط الباترن بين الأقسام</h2>
                <p className="text-[11px] text-gray-400 mt-1">
                  الشريط الصغير (3 وحدات) اللي بيفصل بين أقسام الصفحة الرئيسية وباقي صفحات المتجر. اختار الوحدات تتكرر نسخة واحدة بالظبط،
                  أو كل وحدة بتبدّل ألوان أهلّتها من ألوان الهوية. (الفاصل في صفحة الروابط ليه الاختيار ده لوحده في «إدارة الصفحة والروابط».)
                </p>
              </div>
              <Segmented<StripArrangement>
                label="ترتيب وحدات الشريط"
                value={draft.strip_arrangement}
                options={STRIP_ARRANGEMENTS.map((k) => ({ key: k, label: STRIP_ARRANGEMENT_LABEL[k] }))}
                onChange={(strip_arrangement) => patch({ strip_arrangement })}
              />
              <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
                {STRIP_ARRANGEMENTS.map((k) => (
                  <div
                    key={k}
                    className={`rounded-xl border p-3 flex flex-col items-center gap-1 ${draft.strip_arrangement === k ? 'border-indigo-400 bg-indigo-50/40' : 'border-gray-100'}`}
                  >
                    <StripSample arrangement={k} label={STRIP_ARRANGEMENT_LABEL[k]} />
                    <span className="text-[11px] text-gray-500">{STRIP_ARRANGEMENT_LABEL[k]}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* ── home sections: moved ── */}
            <section className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col md:flex-row md:items-center gap-3 justify-between" data-testid="appearance-sections">
              <div>
                <h2 className="text-sm font-bold text-gray-700">أقسام الصفحة الرئيسية</h2>
                <p className="text-[11px] text-gray-400 mt-1">
                  ترتيب الأقسام وإخفاؤها وعناوينها وعدد كتبها، مع رفوف التصنيفات، بقوا في مكان واحد: «السلاسل والتصنيفات ← الصفحة الرئيسية».
                </p>
              </div>
              <Link to="/catalog?tab=home" className="btn-primary self-start whitespace-nowrap" data-testid="home-blocks-link">فتح «الصفحة الرئيسية»</Link>
            </section>

            {/* ── buttons ── */}
            <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4" data-testid="appearance-buttons">
              <div>
                <h2 className="text-sm font-bold text-gray-700">ألوان الأزرار</h2>
                <p className="text-[11px] text-gray-400 mt-1">
                  الاختيار من ألوان الهوية بس (كحلي، تركواز، أخضر، نعناعي) بخمس درجات. لون النص بيتظبط لوحده عشان يتقري. «الأصلي» معناه التصميم الحالي.
                  للمتجر وضعين (نهاري وليلي) واللون بيتحدد لكل وضع لوحده، لأن اللون اللي بيبان حلو في النهار ممكن ما يبانش في الليل.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap" data-testid="button-theme-switch">
                {(['light', 'dark'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={theme === t}
                    data-testid={`button-theme-${t}`}
                    onClick={() => setTheme(t)}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${theme === t ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    {t === 'light' ? <Sun size={14} /> : <Moon size={14} />}
                    {THEME_LABEL[t]}
                  </button>
                ))}
              </div>
              <div className="space-y-4">
                {BUTTON_KEYS.map((key) => {
                  const meta = BUTTON_META[key];
                  const style = draft.button_styles[key];
                  const paint = buttonPaint(style, theme);
                  const shown = theme === 'light' ? style.color : style.night.color;
                  const shownTone = theme === 'light' ? style.tone : style.night.tone;
                  const choices: NightColor[] = theme === 'light' ? BUTTON_COLORS : NIGHT_COLORS;
                  return (
                    <div key={key} className="rounded-xl border border-gray-100 p-3 space-y-3" data-testid={`button-${key}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-700">{meta.label}</p>
                          <p className="text-[11px] text-gray-400">{meta.hint}</p>
                        </div>
                        <span
                          className="shrink-0 rounded-xl p-2.5"
                          style={{ background: theme === 'light' ? '#ffffff' : '#00102a', border: '1px solid #e5e7eb' }}
                          data-testid={`button-${key}-stage`}
                        >
                          <span
                            className="block rounded-full px-4 py-1.5 text-xs font-bold border"
                            style={paint ? { background: paint.bg, color: paint.fg, borderColor: paint.bg } : ORIGINAL_SAMPLE[theme]}
                            data-testid={`button-${key}-sample`}
                          >
                            {meta.sample}
                          </span>
                        </span>
                      </div>
                      <div role="radiogroup" aria-label={`لون ${meta.label} (${THEME_LABEL[theme]})`} className="flex flex-wrap gap-2">
                        {choices.map((color) => {
                          const on = shown === color;
                          return (
                            <button
                              key={color}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              aria-label={COLOR_NAME[color]}
                              data-testid={`button-${key}-${color}`}
                              onClick={() => setButton(key, { color })}
                              className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold transition-colors ${on ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                            >
                              <span className="w-4 h-4 rounded-full border border-black/10" style={{ background: SWATCH_BG[color] }} />
                              {COLOR_NAME[color]}
                            </button>
                          );
                        })}
                      </div>
                      {shown !== 'default' && shown !== 'same' && (
                        <Segmented<string>
                          label={`درجة ${meta.label}`}
                          value={String(shownTone)}
                          options={TONES.map((t) => ({ key: String(t), label: TONE_LABELS[t] }))}
                          onChange={(t) => setButton(key, { tone: Number(t) as Tone })}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}
        {!tableMissing && !isError && <ControlHistory scope="appearance" revision={data?.revision ?? null} onRestored={onRestored} />}
      </div>

      {dirty && (
        <div className="fixed bottom-4 inset-x-0 z-40 flex justify-center pointer-events-none px-4 lg:pr-72">
          <div className="pointer-events-auto flex items-center gap-3 flex-wrap justify-center rounded-2xl bg-gray-900 text-white shadow-2xl px-4 py-3" role="status" data-testid="appearance-save-bar">
            <span className="text-sm">فيه تغييرات لسه ما اتحفظتش</span>
            <button type="button" onClick={() => saved && setDraft(saved)} disabled={save.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-300 hover:bg-white/10 disabled:opacity-40">
              <Undo2 size={14} /> تراجع
            </button>
            <button
              type="button"
              onClick={() => save.mutate({ appearance: draft, revision: baseRevision })}
              disabled={save.isPending || tableMissing || !baseRevision}
              data-testid="appearance-save"
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-500 text-sm font-semibold hover:bg-indigo-400 disabled:opacity-40 disabled:hover:bg-indigo-500"
            >
              {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              حفظ
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const TABS = [
  { key: 'look', label: 'الألوان والباترن', to: '/appearance' },
  { key: 'display', label: 'تفاصيل العرض', to: '/appearance?tab=display' },
] as const;

/**
 * مظهر المتجر has two tabs: the look (pattern, home sections, button colours) and «تفاصيل العرض» (what the book card, the
 * book's page and the footer show). Both stay mounted, so an unsaved draft in one is still there after a look at the other.
 */
export default function AppearanceAdmin() {
  const [params] = useSearchParams();
  const active = params.get('tab') === 'display' ? 'display' : 'look';
  const [editorVersion, setEditorVersion] = useState(0);
  const resetEditors = () => setEditorVersion((version) => version + 1);

  return (
    <Layout>
      <nav className="flex gap-1 p-1 mb-4 bg-gray-100 rounded-xl w-fit" aria-label="أقسام مظهر المتجر" data-testid="appearance-tabs">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            to={tab.to}
            replace
            aria-current={active === tab.key ? 'page' : undefined}
            data-testid={`appearance-tab-${tab.key}`}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${active === tab.key ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div hidden={active !== 'look'}>
        <LookAdmin key={`look-${editorVersion}`} onRestored={resetEditors} />
      </div>
      <div hidden={active !== 'display'} className="space-y-5 pb-28" data-testid="display-admin">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Palette className="text-amber-500" size={24} />
          تفاصيل العرض
        </h1>
        <DisplayDetails key={`display-${editorVersion}`} onRestored={resetEditors} />
      </div>
    </Layout>
  );
}
