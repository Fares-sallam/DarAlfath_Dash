import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, PowerOff, RefreshCw, RotateCcw, Save, Smartphone, Undo2 } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Switch } from '@/components/ads/CategoryBarSection';
import { Field, ImageField, ScheduleFields, Segmented, field } from '@/components/links/admin/ui';
import AppControlPreview from '@/components/preview/AppControlPreview';
import PreviewDock from '@/components/preview/PreviewDock';
import type { AppNotice } from '@/lib/livePreview';
import { useAppControlAdmin, useDisableAppMaintenance, useSaveAppControl } from '@/hooks/useAppControl';
import ControlHistory from '@/components/appearance/ControlHistory';
import { appControlProblems, minimumReleaseProblems, raisesMinimum, withCampaign } from '@/lib/appControlDraft';
import {
  BUTTON_MAX, DEFAULT_APP_CONTROL, DEFAULT_MAINTENANCE_MESSAGE, DEFAULT_MAINTENANCE_TITLE, DEFAULT_UPDATE_MESSAGE, MESSAGE_MAX, POPUP_FREQUENCIES,
  POPUP_FREQUENCY_LABEL, POPUP_PLATFORMS, POPUP_PLATFORM_LABEL, TITLE_MAX, cleanBuild, isDefaultAppControl, maintenanceState, newCampaignId,
  resolveAppControl, type AppControl, type MaintenanceState, type PopupFrequency, type PopupPlatform,
} from '@/lib/appControl';

const signature = (c: AppControl) => JSON.stringify(resolveAppControl({ maintenance: c.maintenance, update_policy: c.update, popup: c.popup }));

const Section = ({ title, hint, testId, wide, status, onFocus, children }: {
  title: string; hint: string; testId: string; wide?: boolean; status?: React.ReactNode; onFocus?: () => void; children: React.ReactNode;
}) => (
  <section className={`min-w-0 bg-white rounded-2xl border border-gray-100 p-5 space-y-4 ${wide ? 'lg:col-span-2 xl:col-span-1' : ''}`} data-testid={testId} onFocusCapture={onFocus}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-bold text-gray-700">{title}</h2>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed max-w-xl">{hint}</p>
      </div>
      {status}
    </div>
    {children}
  </section>
);

const STATE_CHIP: Record<MaintenanceState, { label: string; cls: string }> = {
  off: { label: 'مقفولة', cls: 'bg-gray-100 text-gray-500' },
  scheduled: { label: 'مجدولة', cls: 'bg-amber-100 text-amber-700' },
  active: { label: 'شغّالة دلوقتي', cls: 'bg-red-100 text-red-700' },
  ended: { label: 'خلّص وقتها', cls: 'bg-gray-100 text-gray-500' },
};

const Chip = ({ label, cls, testId }: { label: string; cls: string; testId: string }) => (
  <span className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold ${cls}`} data-testid={testId}>{label}</span>
);

const SwitchRow = ({ title, hint, checked, onChange, label }: { title: string; hint: string; checked: boolean; onChange: (next: boolean) => void; label: string }) => (
  <div className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2.5">
    <div>
      <div className="text-sm font-semibold text-gray-800">{title}</div>
      <div className="text-[11px] text-gray-400 leading-relaxed">{hint}</div>
    </div>
    <Switch checked={checked} onChange={onChange} label={label} />
  </div>
);

/** The English texts are optional: folded away until wanted (open when something is already written). */
const English = ({ open, testId, children }: { open: boolean; testId: string; children: React.ReactNode }) => (
  <details open={open || undefined} className="rounded-xl border border-gray-100 px-3 py-2" data-testid={testId}>
    <summary className="text-xs font-semibold text-gray-600 cursor-pointer">النص بالإنجليزي (اختياري، لو التطبيق شغال إنجليزي)</summary>
    <div className="space-y-3 pt-3">{children}</div>
  </details>
);

const BuildInput = ({ label, value, onChange, testId }: { label: string; value: number | null; onChange: (next: number | null) => void; testId: string }) => (
  <input
    type="number"
    inputMode="numeric"
    min={1}
    aria-label={label}
    data-testid={testId}
    value={value ?? ''}
    placeholder="—"
    onChange={(e) => onChange(cleanBuild(e.target.value))}
    className={`${field} max-w-[130px]`}
  />
);

/** Pages inside the app a pop-up's button is likely to open: a click fills the address in. */
const LINK_PRESETS: { label: string; url: string }[] = [
  { label: 'البحث', url: '/search' },
  { label: 'السلة', url: '/(tabs)/cart' },
  { label: 'طلباتي', url: '/(tabs)/orders' },
  { label: 'المفضلة', url: '/wishlist' },
  { label: 'تواصل معنا', url: '/contact' },
];

/**
 * التحكم في التطبيق: the app's operating switches. A maintenance screen, a forced / recommended update by build number, and one
 * promotional pop-up. Only builds of the app that have this feature read it; older builds are not affected.
 * Nothing reaches the app until it is saved; the app takes a change when it opens or comes back to the front.
 */
export default function AppControlAdmin() {
  const { data, isLoading, isError, error } = useAppControlAdmin();
  const save = useSaveAppControl();
  const disableMaintenance = useDisableAppMaintenance();

  const [draft, setDraft] = useState<AppControl>(DEFAULT_APP_CONTROL);
  const [ready, setReady] = useState(false);
  const [baseRevision, setBaseRevision] = useState<string | null>(null);
  // which notice the live preview shows: the one whose section is being edited
  const [notice, setNotice] = useState<AppNotice>('maintenance');

  const saved = data?.control;
  const problems = useMemo(() => [...appControlProblems(draft), ...(saved ? minimumReleaseProblems(saved, draft) : [])], [draft, saved]);
  const dirty = ready && saved !== undefined && (signature(draft) !== signature(saved) || problems.length > 0);
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

  const tableMissing = data?.tableMissing === true;
  const isDefault = isDefaultAppControl(draft);
  const now = Date.now();

  const patchM = (next: Partial<AppControl['maintenance']>) => setDraft((d) => ({ ...d, maintenance: { ...d.maintenance, ...next } }));
  const patchU = (next: Partial<AppControl['update']>) => setDraft((d) => ({ ...d, update: { ...d.update, ...next } }));
  const patchP = (next: Partial<AppControl['popup']>) => setDraft((d) => ({ ...d, popup: { ...d.popup, ...next } }));
  const setBuild = (kind: 'publishedBuild' | 'minBuild' | 'recommendedBuild', platform: 'ios' | 'android', value: number | null) =>
    patchU({ [kind]: { ...draft.update[kind], [platform]: value } } as Partial<AppControl['update']>);

  const m = draft.maintenance;
  const u = draft.update;
  const p = draft.popup;
  const state = maintenanceState(m, now);

  const onSave = () => {
    const next: AppControl = { ...draft, popup: withCampaign(draft.popup) };
    const raised = saved ? raisesMinimum(saved, next) : [];
    if (raised.length > 0) {
      const lines = raised.map((r) => `${r.label}: أي نسخة رقمها أقل من ${r.build}`).join('\n');
      const ok = window.confirm(`الحد الأدنى للتحديث هيتطبّق:\n${lines}\n\nأصحابها هيشوفوا شاشة تحديث ومش هيقدروا يكمّلوا من غيرها. اتأكد إن الرقم مش أعلى من آخر نسخة منشورة في المتجر. تحفظ؟`);
      if (!ok) return;
    }
    setDraft(next);
    save.mutate({ control: next, revision: baseRevision });
  };

  const onDisableMaintenance = () => {
    if (!window.confirm('إيقاف وضع الصيانة الآن؟ المسودات الأخرى في الصفحة لن تُحفظ.')) return;
    disableMaintenance.mutate(undefined, {
      onSuccess: () => setDraft((current) => ({
        ...current,
        maintenance: { ...current.maintenance, enabled: false, startsAt: null, endsAt: null },
      })),
    });
  };

  return (
    <Layout>
      <div className="space-y-5 pb-28" data-testid="app-control-page">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Smartphone className="text-amber-500" size={24} />
              التحكم في التطبيق
            </h1>
            <p className="text-sm text-gray-500 mt-1 max-w-2xl">
              شاشة صيانة، وتحديث إجباري أو مقترح بحسب رقم البيلد، ونافذة ترويجية. بتشتغل فقط على نسخ التطبيق المنشورة اللي تدعم التحكم ده؛ النسخ الأقدم لا تتأثر.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {saved?.maintenance.enabled && !tableMissing && (
              <button
                type="button"
                onClick={onDisableMaintenance}
                disabled={disableMaintenance.isPending}
                data-testid="app-control-stop-maintenance"
                className="flex items-center gap-1.5 px-3 py-2 rounded border border-red-200 bg-white text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"
              >
                {disableMaintenance.isPending ? <Loader2 size={14} className="animate-spin" /> : <PowerOff size={14} />}
                إيقاف الصيانة الآن
              </button>
            )}
            <button
              type="button"
              onClick={() => setDraft(DEFAULT_APP_CONTROL)}
              disabled={isDefault}
              data-testid="app-control-reset"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              <RotateCcw size={14} /> قفل الكل
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
          <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4 flex gap-3" role="alert" data-testid="app-control-missing">
            <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
            <p className="text-sm text-amber-800">تحديث قاعدة البيانات الخاص بالصفحة دي لسه ما اتطبقش، فتقدر تجرّب لكن مش هتقدر تحفظ لحد ما يتطبق.</p>
          </div>
        )}

        {ready && (
          <div className="space-y-5 xl:space-y-0 xl:grid xl:grid-cols-[minmax(0,1fr)_440px] xl:gap-5 xl:items-start">
            {/* the live preview: above the form on a small screen, docked beside it (and following the scroll) on a wide one */}
            <PreviewDock>
              <AppControlPreview control={draft} notice={notice} onNoticeChange={setNotice} />
            </PreviewDock>
          <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-1 xl:col-start-1 xl:row-start-1 min-w-0">
            {/* ── maintenance ── */}
            <Section
              title="شاشة الصيانة"
              hint="لما تتشغل، التطبيق بيفتح على شاشة مقفولة لكل المستخدمين. الأدمن بيدخلوا التطبيق عادي ويشوفوا شريط تنبيه."
              testId="app-control-maintenance"
              onFocus={() => setNotice('maintenance')}
              status={<Chip label={STATE_CHIP[state].label} cls={STATE_CHIP[state].cls} testId="maintenance-state" />}
            >
              <SwitchRow title="تشغيل الصيانة" hint="من أول ما تحفظ (أو من وقت البداية لو حددت)" checked={m.enabled} onChange={(enabled) => patchM({ enabled })} label="تشغيل الصيانة" />
              <Field label="العنوان" hint={`سيبه فاضي لـ «${DEFAULT_MAINTENANCE_TITLE}»`}>
                <input value={m.title} maxLength={TITLE_MAX} placeholder={DEFAULT_MAINTENANCE_TITLE} data-testid="maintenance-title" onChange={(e) => patchM({ title: e.target.value })} className={field} />
              </Field>
              <Field label="الرسالة" hint={`لحد ${MESSAGE_MAX} حرف. سيبها فاضية للرسالة الأصلية`}>
                <textarea rows={3} value={m.message} maxLength={MESSAGE_MAX} placeholder={DEFAULT_MAINTENANCE_MESSAGE} data-testid="maintenance-message" onChange={(e) => patchM({ message: e.target.value })} className={`${field} resize-y`} />
              </Field>
              <English open={Boolean(m.titleEn || m.messageEn)} testId="maintenance-english">
                <input aria-label="عنوان الصيانة بالإنجليزي" dir="ltr" value={m.titleEn} maxLength={TITLE_MAX} placeholder="Under maintenance" onChange={(e) => patchM({ titleEn: e.target.value })} className={field} />
                <textarea aria-label="رسالة الصيانة بالإنجليزي" dir="ltr" rows={2} value={m.messageEn} maxLength={MESSAGE_MAX} placeholder="We are making improvements. We will be back soon." onChange={(e) => patchM({ messageEn: e.target.value })} className={`${field} resize-y`} />
              </English>
              <ScheduleFields startsAt={m.startsAt} endsAt={m.endsAt} onChange={(patch) => patchM({ ...('starts_at' in patch ? { startsAt: patch.starts_at ?? null } : null), ...('ends_at' in patch ? { endsAt: patch.ends_at ?? null } : null) })} />
            </Section>

            {/* ── update ── */}
            <Section
              title="تحديث التطبيق"
              hint="اكتب رقم البيلد (مش رقم الإصدار). قبل رفع الحد الإجباري، سجّل آخر بيلد تأكدت بنفسك أنه متاح للتحميل في المتجر."
              testId="app-control-update"
              onFocus={() => setNotice((n) => (n === 'update-offer' ? n : 'update-required'))}
            >
              <div className="w-full max-w-full rounded-xl border border-gray-100 overflow-x-auto" role="table" aria-label="أرقام البيلد">
                <div className="min-w-[520px] divide-y divide-gray-100">
                <div className="grid grid-cols-[72px_repeat(3,minmax(0,1fr))] gap-2 px-3 py-2 bg-gray-50 text-[11px] font-semibold text-gray-500 rounded-t-xl" role="row">
                  <span role="columnheader" />
                  <span role="columnheader">المنشور فعلًا</span>
                  <span role="columnheader">إجباري (أقل منه يحدّث)</span>
                  <span role="columnheader">مقترح (يقدر يأجّل)</span>
                </div>
                {([['ios', 'آيفون'], ['android', 'أندرويد']] as const).map(([platform, label]) => (
                  <div key={platform} className="grid grid-cols-[72px_repeat(3,minmax(0,1fr))] gap-2 items-center px-3 py-2.5" role="row" data-testid={`update-row-${platform}`}>
                    <span role="cell" className="text-sm font-semibold text-gray-800">{label}</span>
                    <div role="cell"><BuildInput label={`آخر بيلد منشور ${label}`} testId={`published-${platform}`} value={u.publishedBuild[platform]} onChange={(v) => setBuild('publishedBuild', platform, v)} /></div>
                    <div role="cell"><BuildInput label={`الحد الإجباري ${label}`} testId={`min-${platform}`} value={u.minBuild[platform]} onChange={(v) => setBuild('minBuild', platform, v)} /></div>
                    <div role="cell"><BuildInput label={`الحد المقترح ${label}`} testId={`rec-${platform}`} value={u.recommendedBuild[platform]} onChange={(v) => setBuild('recommendedBuild', platform, v)} /></div>
                  </div>
                ))}
                </div>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">المنشور فعلًا: رقم تتأكد منه يدويًا في المتجر، مش مجرد رقم في مشروع التطبيق. آيفون: Build، أندرويد: Version code.</p>
              <Field label="رسالة التحديث" hint={`سيبها فاضية للرسالة الأصلية: «${DEFAULT_UPDATE_MESSAGE}»`}>
                <textarea rows={2} value={u.message} maxLength={MESSAGE_MAX} data-testid="update-message" onChange={(e) => patchU({ message: e.target.value })} className={`${field} resize-y`} />
              </Field>
              <English open={Boolean(u.messageEn)} testId="update-english">
                <textarea aria-label="رسالة التحديث بالإنجليزي" dir="ltr" rows={2} value={u.messageEn} maxLength={MESSAGE_MAX} onChange={(e) => patchU({ messageEn: e.target.value })} className={`${field} resize-y`} />
              </English>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="رابط آيفون (اختياري)" hint="سيبه فاضي لصفحة التطبيق في App Store">
                  <input dir="ltr" value={u.storeUrl.ios} placeholder="https://apps.apple.com/…" data-testid="store-ios" onChange={(e) => patchU({ storeUrl: { ...u.storeUrl, ios: e.target.value } })} className={field} />
                </Field>
                <Field label="رابط أندرويد (اختياري)" hint="سيبه فاضي لصفحة التطبيق في Google Play">
                  <input dir="ltr" value={u.storeUrl.android} placeholder="https://play.google.com/…" data-testid="store-android" onChange={(e) => patchU({ storeUrl: { ...u.storeUrl, android: e.target.value } })} className={field} />
                </Field>
              </div>
            </Section>

            {/* ── pop-up ── */}
            <Section
              title="النافذة الترويجية"
              hint="نافذة بتظهر فوق الصفحة الرئيسية بعد ما التطبيق يفتح: عرض، خصم، إعلان. المستخدم يقفلها أو يفتح الرابط."
              testId="app-control-popup"
              onFocus={() => setNotice('popup')}
              wide
              status={<Chip label={p.enabled ? 'شغّالة' : 'مقفولة'} cls={p.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'} testId="popup-state" />}
            >
              <div className="space-y-4">
              <SwitchRow title="تشغيل النافذة" hint="بتظهر من أول ما تحفظ (أو من وقت البداية لو حددت)" checked={p.enabled} onChange={(enabled) => patchP({ enabled })} label="تشغيل النافذة" />
              <Field label="العنوان">
                <input value={p.title} maxLength={TITLE_MAX} placeholder="مثلًا: خصم 20% على كل الكتب" data-testid="popup-title" onChange={(e) => patchP({ title: e.target.value })} className={field} />
              </Field>
              <Field label="الرسالة" hint={`لحد ${MESSAGE_MAX} حرف`}>
                <textarea rows={3} value={p.message} maxLength={MESSAGE_MAX} data-testid="popup-message" onChange={(e) => patchP({ message: e.target.value })} className={`${field} resize-y`} />
              </Field>
              <Field label="الصورة (اختياري)" hint="بتظهر فوق الكلام. الأحسن صورة عريضة">
                <ImageField value={p.imageUrl} onChange={(imageUrl) => patchP({ imageUrl })} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="كلمة الزر" hint={`سيبها فاضية لـ «افتح». لحد ${BUTTON_MAX} حرف`}>
                  <input value={p.buttonLabel} maxLength={BUTTON_MAX} placeholder="تصفّح العروض" data-testid="popup-button" onChange={(e) => patchP({ buttonLabel: e.target.value })} className={field} />
                </Field>
                <Field label="الرابط (اختياري)" hint="صفحة جوه التطبيق تبدأ بـ / أو https://. من غيره تفضل بزر قفل بس">
                  <input dir="ltr" value={p.linkUrl ?? ''} placeholder="/search" data-testid="popup-link" onChange={(e) => patchP({ linkUrl: e.target.value === '' ? null : e.target.value })} className={field} />
                </Field>
              </div>
              <div className="flex flex-wrap gap-1.5" aria-label="روابط جاهزة">
                {LINK_PRESETS.map((preset) => (
                  <button key={preset.url} type="button" onClick={() => patchP({ linkUrl: preset.url })} className="px-2.5 py-1 rounded-lg bg-gray-100 text-[11px] font-semibold text-gray-600 hover:bg-gray-200">
                    {preset.label}
                  </button>
                ))}
              </div>
              <English open={Boolean(p.titleEn || p.messageEn || p.buttonLabelEn)} testId="popup-english">
                <input aria-label="عنوان النافذة بالإنجليزي" dir="ltr" value={p.titleEn} maxLength={TITLE_MAX} onChange={(e) => patchP({ titleEn: e.target.value })} className={field} />
                <textarea aria-label="رسالة النافذة بالإنجليزي" dir="ltr" rows={2} value={p.messageEn} maxLength={MESSAGE_MAX} onChange={(e) => patchP({ messageEn: e.target.value })} className={`${field} resize-y`} />
                <input aria-label="كلمة الزر بالإنجليزي" dir="ltr" value={p.buttonLabelEn} maxLength={BUTTON_MAX} onChange={(e) => patchP({ buttonLabelEn: e.target.value })} className={field} />
              </English>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="كل قد إيه تظهر">
                  <Segmented<PopupFrequency> label="تكرار النافذة" value={p.frequency} options={POPUP_FREQUENCIES.map((key) => ({ key, label: POPUP_FREQUENCY_LABEL[key] }))} onChange={(frequency) => patchP({ frequency })} />
                </Field>
                <Field label="لمين">
                  <Segmented<PopupPlatform> label="النافذة لمين" value={p.platform} options={POPUP_PLATFORMS.map((key) => ({ key, label: POPUP_PLATFORM_LABEL[key] }))} onChange={(platform) => patchP({ platform })} />
                </Field>
              </div>
              <ScheduleFields startsAt={p.startsAt} endsAt={p.endsAt} onChange={(patch) => patchP({ ...('starts_at' in patch ? { startsAt: patch.starts_at ?? null } : null), ...('ends_at' in patch ? { endsAt: patch.ends_at ?? null } : null) })} />
              <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2.5">
                <div>
                  <div className="text-sm font-semibold text-gray-800">عرضها من جديد لكل المستخدمين</div>
                  <div className="text-[11px] text-gray-400 leading-relaxed">اللي قفلها قبل كده هيشوفها تاني. استخدمها لما تبدأ حملة جديدة، مش لتصحيح كلمة.</div>
                </div>
                <button
                  type="button"
                  onClick={() => patchP({ campaign: newCampaignId() })}
                  data-testid="popup-new-campaign"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 shrink-0"
                >
                  <RefreshCw size={14} /> حملة جديدة
                </button>
              </div>
              </div>
            </Section>
          </div>
          </div>
        )}

        {ready && problems.length > 0 && (
          <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4 space-y-1" role="alert" data-testid="app-control-problems">
            <p className="text-sm font-bold text-amber-800">لازم تظبط ده قبل الحفظ:</p>
            <ul className="list-disc pr-5 text-sm text-amber-800 space-y-0.5">
              {problems.map((problem) => <li key={problem}>{problem}</li>)}
            </ul>
          </div>
        )}
      </div>

      {dirty && (
        <div className="fixed bottom-4 inset-x-0 z-40 flex justify-center pointer-events-none px-4 lg:pr-72 xl:pl-[480px]">
          <div className="pointer-events-auto flex items-center gap-3 flex-wrap justify-center rounded-2xl bg-gray-900 text-white shadow-2xl px-4 py-3" role="status" data-testid="app-control-save-bar">
            <span className="text-sm">فيه تغييرات لسه ما اتحفظتش</span>
            <button type="button" onClick={() => saved && setDraft(saved)} disabled={save.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-300 hover:bg-white/10 disabled:opacity-40">
              <Undo2 size={14} /> تراجع
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={save.isPending || tableMissing || !baseRevision || problems.length > 0}
              data-testid="app-control-save"
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-500 text-sm font-semibold hover:bg-indigo-400 disabled:opacity-40 disabled:hover:bg-indigo-500"
            >
              {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              حفظ
            </button>
          </div>
        </div>
      )}
      {!tableMissing && !isError && <ControlHistory scope="app_control" revision={data?.revision ?? null} onRestored={() => setReady(false)} />}
    </Layout>
  );
}
