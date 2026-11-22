import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, ExternalLink, Loader2, Plus, RotateCcw, Save, Trash2, Undo2 } from 'lucide-react';
import { Switch } from '@/components/ads/CategoryBarSection';
import { Field, Segmented, field } from '@/components/links/admin/ui';
import CardSample from '@/components/appearance/CardSample';
import { useDisplaySettingsAdmin, useSaveDisplaySettings } from '@/hooks/useDisplaySettings';
import { blankColumn, blankLink, blankTrust, displayProblems, moveItem, removeAt, replaceAt } from '@/lib/displayDraft';
import {
  CARD_ELEMENT_KEYS, CARD_ELEMENT_META, DEFAULT_DISPLAY, DESCRIPTION_MAX, DISCOUNT_STYLES, DISCOUNT_STYLE_LABEL, FOOTER_LABEL_MAX, FOOTER_LINE_MAX,
  FOOTER_MAX_COLUMNS, FOOTER_MAX_LINKS, FOOTER_TITLE_MAX, LOW_STOCK_MAX, LOW_STOCK_MIN, NEW_DAYS_MAX, NEW_DAYS_MIN, PAGE_ELEMENT_KEYS, PAGE_ELEMENT_META,
  PER_ROW_DESKTOP, PER_ROW_MOBILE, TRUST_ICONS, TRUST_ICON_LABEL, TRUST_MAX_ITEMS, TRUST_TEXT_MAX, YEAR_TOKEN, copyrightText, isDefaultDisplay,
  resolveDisplay, safeFooterUrl,
  type ChannelSwitch, type DisplaySettings, type ElementMeta, type FooterColumn, type FooterLink, type TrustIcon, type TrustItem,
} from '@/lib/displaySettings';
import { STOREFRONT_URL } from '@/lib/storefront';

const signature = (d: DisplaySettings) => JSON.stringify(resolveDisplay(d));

const Section = ({ title, hint, testId, wide, children }: { title: string; hint?: string; testId: string; wide?: boolean; children: React.ReactNode }) => (
  <section className={`bg-white rounded-2xl border border-gray-100 p-5 space-y-4 ${wide ? 'lg:col-span-2' : ''}`} data-testid={testId}>
    <div>
      <h2 className="text-sm font-bold text-gray-700">{title}</h2>
      {hint && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{hint}</p>}
    </div>
    {children}
  </section>
);

/** One row per element, with a switch for the website and one for the app. A place the element does not exist in shows a dash. */
function Matrix<K extends string>({
  keys, meta, value, onChange, scope,
}: {
  keys: readonly K[];
  meta: Record<K, ElementMeta>;
  value: Record<K, ChannelSwitch>;
  onChange: (key: K, next: ChannelSwitch) => void;
  scope: string;
}) {
  return (
    <div className="rounded-xl border border-gray-100 divide-y divide-gray-100" role="table" aria-label={scope}>
      <div className="grid grid-cols-[1fr_64px_64px] gap-2 px-3 py-2 bg-gray-50 text-[11px] font-semibold text-gray-500 rounded-t-xl" role="row">
        <span role="columnheader">العنصر</span>
        <span role="columnheader" className="text-center">الموقع</span>
        <span role="columnheader" className="text-center">التطبيق</span>
      </div>
      {keys.map((key) => {
        const m = meta[key];
        const v = value[key];
        return (
          <div key={key} className="grid grid-cols-[1fr_64px_64px] gap-2 items-center px-3 py-2.5" role="row" data-testid={`display-row-${scope}-${key}`}>
            <div role="cell" className="min-w-0">
              <div className="text-sm font-semibold text-gray-800">{m.label}</div>
              <div className="text-[11px] text-gray-400 leading-relaxed">{m.hint}</div>
            </div>
            <div role="cell" className="flex justify-center">
              {m.web ? <Switch checked={v.web} onChange={(web) => onChange(key, { ...v, web })} label={`${m.label} في الموقع`} /> : <span className="text-gray-300 text-sm" aria-hidden>—</span>}
            </div>
            <div role="cell" className="flex justify-center">
              {m.app ? <Switch checked={v.app} onChange={(app) => onChange(key, { ...v, app })} label={`${m.label} في التطبيق`} /> : <span className="text-gray-300 text-sm" aria-hidden>—</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const NumberField = ({ label, hint, value, min, max, onChange, testId }: {
  label: string; hint: string; value: number; min: number; max: number; onChange: (n: number) => void; testId: string;
}) => (
  <Field label={label} hint={hint}>
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={value}
      data-testid={testId}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n))));
      }}
      className={`${field} max-w-[140px]`}
    />
  </Field>
);

const iconButton = 'p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent';

/**
 * تفاصيل العرض: what a book card, a book's page and the website's footer show. Every element has a switch for the website
 * and one for the app; the footer is the website's only (the app has none). Nothing reaches customers until it is saved.
 */
export default function DisplayDetails() {
  const { data, isLoading, isError, error } = useDisplaySettingsAdmin();
  const save = useSaveDisplaySettings();

  const [draft, setDraft] = useState<DisplaySettings>(DEFAULT_DISPLAY);
  const [ready, setReady] = useState(false);

  const saved = data?.display;
  const problems = useMemo(() => displayProblems(draft), [draft]);
  // a half-written row is not a difference in what would be saved (it is dropped), but it is still unfinished work to show
  const dirty = ready && saved !== undefined && (signature(draft) !== signature(saved) || problems.length > 0);
  const dirtyNow = useRef(false);
  dirtyNow.current = dirty;

  useEffect(() => {
    if (!saved) return;
    if (!ready || !dirtyNow.current) {
      setDraft(saved);
      setReady(true);
    }
  }, [saved, ready]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const columnMissing = data?.columnMissing === true;
  const isDefault = isDefaultDisplay(draft);

  const patchCard = (next: Partial<DisplaySettings['card']>) => setDraft((d) => ({ ...d, card: { ...d.card, ...next } }));
  const patchPage = (next: Partial<DisplaySettings['page']>) => setDraft((d) => ({ ...d, page: { ...d.page, ...next } }));
  const patchFooter = (next: Partial<DisplaySettings['footer']>) => setDraft((d) => ({ ...d, footer: { ...d.footer, ...next } }));

  const setColumn = (index: number, next: FooterColumn) => patchFooter({ columns: replaceAt(draft.footer.columns, index, next) });
  const setLink = (c: number, l: number, next: FooterLink) => setColumn(c, { ...draft.footer.columns[c], links: replaceAt(draft.footer.columns[c].links, l, next) });
  const setTrust = (index: number, next: TrustItem) => patchPage({ trust: replaceAt(draft.page.trust, index, next) });

  const year = new Date().getFullYear();
  const anyNewOn = draft.card.show.isNew.web || draft.card.show.isNew.app;
  const anyLowOn = draft.card.show.lowStock.web || draft.card.show.lowStock.app || draft.page.show.stockHint.web || draft.page.show.stockHint.app;

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-sm text-gray-500 max-w-2xl">
          إيه اللي يظهر على بطاقة الكتاب وفي صفحته وفي تذييل الموقع. لكل عنصر مفتاح للموقع ومفتاح للتطبيق. والتذييل للموقع بس لأن التطبيق ملوش تذييل.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={`${STOREFRONT_URL}/books`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
          >
            <ExternalLink size={14} /> افتح صفحة الكتب في الموقع
          </a>
          <button
            type="button"
            onClick={() => setDraft(DEFAULT_DISPLAY)}
            disabled={isDefault}
            data-testid="display-reset"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <RotateCcw size={14} /> رجوع للشكل الأصلي
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

      {columnMissing && (
        <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4 flex gap-3" role="alert" data-testid="display-missing">
          <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
          <p className="text-sm text-amber-800">تحديث قاعدة البيانات الخاص بالصفحة دي لسه ما اتطبقش، فتقدر تجرّب لكن مش هتقدر تحفظ لحد ما يتطبق.</p>
        </div>
      )}

      {ready && (
        <div className="grid gap-5 lg:grid-cols-2" data-testid="display-page">
          {/* ── the book card ── */}
          <Section title="بطاقة الكتاب" hint="البطاقة اللي بتظهر في القوائم والبحث وصفوف الرئيسية." testId="display-card">
            <Matrix keys={CARD_ELEMENT_KEYS} meta={CARD_ELEMENT_META} value={draft.card.show} scope="card" onChange={(key, next) => patchCard({ show: { ...draft.card.show, [key]: next } })} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="شكل الخصم" hint="يظهر على الكتب المخفّضة">
                <Segmented
                  label="شكل الخصم"
                  value={draft.card.discountStyle}
                  options={DISCOUNT_STYLES.map((key) => ({ key, label: DISCOUNT_STYLE_LABEL[key] }))}
                  onChange={(discountStyle) => patchCard({ discountStyle })}
                />
              </Field>
              <Field label="تأثير الإمالة (الموقع)" hint="البطاقة بتميل مع الماوس">
                <Switch checked={draft.card.tilt} onChange={(tilt) => patchCard({ tilt })} label="تأثير الإمالة" />
              </Field>
              <NumberField label="«جديد» لمدة (يوم)" hint={anyNewOn ? 'الكتاب يفضل «جديد» المدة دي من يوم إضافته' : 'شغّل شارة «جديد» فوق الأول'} value={draft.card.newDays} min={NEW_DAYS_MIN} max={NEW_DAYS_MAX} testId="display-new-days" onChange={(newDays) => patchCard({ newDays })} />
              <NumberField label="«آخر نسخ» عند (نسخة)" hint={anyLowOn ? 'من العدد ده وأقل يظهر التنبيه (على البطاقة وفي الصفحة)' : 'شغّل الشارة أو التنبيه الأول'} value={draft.card.lowStockAt} min={LOW_STOCK_MIN} max={LOW_STOCK_MAX} testId="display-low-stock" onChange={(lowStockAt) => patchCard({ lowStockAt })} />
              <Field label="كتب في الصف، كمبيوتر (الموقع)" hint="في صفحة الكتب. تلقائي يعني زي ما هو مصمم">
                <Segmented
                  label="كتب في الصف على الكمبيوتر"
                  value={String(draft.card.perRow.desktop ?? 'auto')}
                  options={[{ key: 'auto', label: 'تلقائي' }, ...PER_ROW_DESKTOP.map((n) => ({ key: String(n), label: String(n) }))]}
                  onChange={(v) => patchCard({ perRow: { ...draft.card.perRow, desktop: v === 'auto' ? null : Number(v) } })}
                />
              </Field>
              <Field label="كتب في الصف، موبايل (الموقع)" hint="في صفحة الكتب على الموبايل">
                <Segmented
                  label="كتب في الصف على الموبايل"
                  value={String(draft.card.perRow.mobile ?? 'auto')}
                  options={[{ key: 'auto', label: 'تلقائي' }, ...PER_ROW_MOBILE.map((n) => ({ key: String(n), label: String(n) }))]}
                  onChange={(v) => patchCard({ perRow: { ...draft.card.perRow, mobile: v === 'auto' ? null : Number(v) } })}
                />
              </Field>
            </div>

            <CardSample card={draft.card} />
          </Section>

          {/* ── the book's page ── */}
          <Section title="صفحة الكتاب" hint="المواصفات وشريط الثقة وتنبيه المخزون." testId="display-page-section">
            <Matrix keys={PAGE_ELEMENT_KEYS} meta={PAGE_ELEMENT_META} value={draft.page.show} scope="page" onChange={(key, next) => patchPage({ show: { ...draft.page.show, [key]: next } })} />

            <div className="space-y-3" data-testid="display-trust">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-gray-700">شارات شريط الثقة</h3>
                <button
                  type="button"
                  onClick={() => patchPage({ trust: [...draft.page.trust, blankTrust()] })}
                  disabled={draft.page.trust.length >= TRUST_MAX_ITEMS}
                  data-testid="display-trust-add"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40"
                >
                  <Plus size={13} /> شارة
                </button>
              </div>
              {draft.page.trust.length === 0 && <p className="text-xs text-gray-400">مفيش شارات. الشريط مش هيظهر.</p>}
              {draft.page.trust.map((item, i) => (
                <div key={i} className="flex items-center gap-2" data-testid={`display-trust-${i}`}>
                  <select
                    aria-label={`أيقونة الشارة ${i + 1}`}
                    value={item.icon}
                    onChange={(e) => setTrust(i, { ...item, icon: e.target.value as TrustIcon })}
                    className={`${field} !w-40 shrink-0`}
                  >
                    {TRUST_ICONS.map((icon) => <option key={icon} value={icon}>{TRUST_ICON_LABEL[icon]}</option>)}
                  </select>
                  <input
                    aria-label={`نص الشارة ${i + 1}`}
                    value={item.text}
                    maxLength={TRUST_TEXT_MAX}
                    placeholder="مثلًا: استرجاع خلال 14 يوم"
                    onChange={(e) => setTrust(i, { ...item, text: e.target.value })}
                    className={field}
                  />
                  <button type="button" aria-label="لفوق" className={iconButton} disabled={i === 0} onClick={() => patchPage({ trust: moveItem(draft.page.trust, i, -1) })}><ArrowUp size={15} /></button>
                  <button type="button" aria-label="لتحت" className={iconButton} disabled={i === draft.page.trust.length - 1} onClick={() => patchPage({ trust: moveItem(draft.page.trust, i, 1) })}><ArrowDown size={15} /></button>
                  <button type="button" aria-label="احذف الشارة" className={`${iconButton} !text-red-500`} onClick={() => patchPage({ trust: removeAt(draft.page.trust, i) })}><Trash2 size={15} /></button>
                </div>
              ))}
              <p className="text-[11px] text-gray-400">لحد {TRUST_MAX_ITEMS} شارات. بتظهر في الموقع من أول ما يتشغل «شريط الثقة» فوق، وفي التطبيق لو شغّلته.</p>
            </div>

            <Field label="وصف الكتاب لما يكون فاضي (الموقع)" hint={`الجملة اللي تظهر في تبويب «نبذة» لكتاب ملوش وصف. سيبها فاضية للجملة الأصلية. لحد ${DESCRIPTION_MAX} حرف`}>
              <textarea
                rows={3}
                maxLength={DESCRIPTION_MAX}
                value={draft.page.description ?? ''}
                data-testid="display-description"
                onChange={(e) => patchPage({ description: e.target.value === '' ? null : e.target.value })}
                className={`${field} resize-y`}
              />
            </Field>
          </Section>

          {/* ── the footer ── */}
          <Section
            title="تذييل الموقع"
            hint="الأعمدة اللي بين اسم الدار وبيانات التواصل، والسطرين اللي تحت. للموقع بس."
            testId="display-footer"
            wide
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-4 lg:col-span-2">
                <div className="grid gap-4 lg:grid-cols-2 items-start">
                {draft.footer.columns.map((column, c) => (
                  <div key={c} className="rounded-xl border border-gray-100 p-3 space-y-3" data-testid={`display-footer-col-${c}`}>
                    <div className="flex items-center gap-2">
                      <input
                        aria-label={`عنوان العمود ${c + 1}`}
                        value={column.title}
                        maxLength={FOOTER_TITLE_MAX}
                        placeholder="عنوان العمود"
                        onChange={(e) => setColumn(c, { ...column, title: e.target.value })}
                        className={`${field} font-semibold`}
                      />
                      <button type="button" aria-label="العمود لقدام" className={iconButton} disabled={c === 0} onClick={() => patchFooter({ columns: moveItem(draft.footer.columns, c, -1) })}><ArrowUp size={15} /></button>
                      <button type="button" aria-label="العمود لورا" className={iconButton} disabled={c === draft.footer.columns.length - 1} onClick={() => patchFooter({ columns: moveItem(draft.footer.columns, c, 1) })}><ArrowDown size={15} /></button>
                      <button type="button" aria-label="احذف العمود" className={`${iconButton} !text-red-500`} onClick={() => patchFooter({ columns: removeAt(draft.footer.columns, c) })}><Trash2 size={15} /></button>
                    </div>

                    {column.links.map((link, l) => {
                      const urlBad = link.url.trim() !== '' && safeFooterUrl(link.url) === null;
                      return (
                        <div key={l} className="flex flex-wrap items-start gap-2" data-testid={`display-footer-link-${c}-${l}`}>
                          <input
                            aria-label={`كلمة الرابط ${l + 1} في العمود ${c + 1}`}
                            value={link.label}
                            maxLength={FOOTER_LABEL_MAX}
                            placeholder="الكلمة"
                            onChange={(e) => setLink(c, l, { ...link, label: e.target.value })}
                            className={`${field} sm:!w-44 sm:shrink-0`}
                          />
                          <div className="flex-1 min-w-[200px]">
                            <input
                              aria-label={`عنوان الرابط ${l + 1} في العمود ${c + 1}`}
                              dir="ltr"
                              value={link.url}
                              placeholder="/books أو https://…"
                              aria-invalid={urlBad}
                              onChange={(e) => setLink(c, l, { ...link, url: e.target.value })}
                              className={`${field} ${urlBad ? '!border-red-300 !bg-red-50' : ''}`}
                            />
                            {urlBad && <span className="text-[11px] text-red-600">لازم يبدأ بـ / أو https:// أو mailto: أو tel:</span>}
                          </div>
                          <button type="button" aria-label="الرابط لفوق" className={iconButton} disabled={l === 0} onClick={() => setColumn(c, { ...column, links: moveItem(column.links, l, -1) })}><ArrowUp size={15} /></button>
                          <button type="button" aria-label="الرابط لتحت" className={iconButton} disabled={l === column.links.length - 1} onClick={() => setColumn(c, { ...column, links: moveItem(column.links, l, 1) })}><ArrowDown size={15} /></button>
                          <button type="button" aria-label="احذف الرابط" className={`${iconButton} !text-red-500`} onClick={() => setColumn(c, { ...column, links: removeAt(column.links, l) })}><Trash2 size={15} /></button>
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => setColumn(c, { ...column, links: [...column.links, blankLink()] })}
                      disabled={column.links.length >= FOOTER_MAX_LINKS}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40"
                    >
                      <Plus size={13} /> رابط
                    </button>
                  </div>
                ))}
                </div>

                <button
                  type="button"
                  onClick={() => patchFooter({ columns: [...draft.footer.columns, blankColumn()] })}
                  disabled={draft.footer.columns.length >= FOOTER_MAX_COLUMNS}
                  data-testid="display-footer-add-column"
                  className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40"
                >
                  <Plus size={14} /> عمود
                </button>
                <p className="text-[11px] text-gray-400">لحد {FOOTER_MAX_COLUMNS} أعمدة، وفي كل عمود لحد {FOOTER_MAX_LINKS} روابط. «/books» صفحة جوه المتجر، و«https://…» أي موقع.</p>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2.5 lg:col-span-2">
                <div>
                  <div className="text-sm font-semibold text-gray-800">عمود بيانات التواصل</div>
                  <div className="text-[11px] text-gray-400">التليفون والإيميل والعنوان من «إعدادات المتجر»</div>
                </div>
                <Switch checked={draft.footer.showContact} onChange={(showContact) => patchFooter({ showContact })} label="عمود بيانات التواصل" />
              </div>

              <Field label="السطر الأول تحت" hint={`اكتب ${YEAR_TOKEN} مكان السنة وهتتغير لوحدها كل سنة`}>
                <input value={draft.footer.copyright} maxLength={FOOTER_LINE_MAX} data-testid="display-copyright" onChange={(e) => patchFooter({ copyright: e.target.value })} className={field} />
              </Field>
              <Field label="السطر التاني تحت" hint="سيبه فاضي لو مش عاوزه">
                <input value={draft.footer.note} maxLength={FOOTER_LINE_MAX} data-testid="display-note" onChange={(e) => patchFooter({ note: e.target.value })} className={field} />
              </Field>

              <p className="text-xs text-gray-500 lg:col-span-2" data-testid="display-copyright-preview">
                هيظهر كده: <strong className="text-gray-700">{copyrightText(draft.footer.copyright, year) || '—'}</strong>
                {draft.footer.note.trim() ? <> · <span>{draft.footer.note}</span></> : null}
              </p>
            </div>
          </Section>
        </div>
      )}

      {ready && problems.length > 0 && (
        <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4 space-y-1" role="alert" data-testid="display-problems">
          <p className="text-sm font-bold text-amber-800">لازم تظبط ده قبل الحفظ:</p>
          <ul className="list-disc pr-5 text-sm text-amber-800 space-y-0.5">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}

      {dirty && (
        <div className="fixed bottom-4 inset-x-0 z-40 flex justify-center pointer-events-none px-4 lg:pr-72">
          <div className="pointer-events-auto flex items-center gap-3 flex-wrap justify-center rounded-2xl bg-gray-900 text-white shadow-2xl px-4 py-3" role="status" data-testid="display-save-bar">
            <span className="text-sm">فيه تغييرات لسه ما اتحفظتش</span>
            <button type="button" onClick={() => saved && setDraft(saved)} disabled={save.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-300 hover:bg-white/10 disabled:opacity-40">
              <Undo2 size={14} /> تراجع
            </button>
            <button
              type="button"
              onClick={() => save.mutate(draft)}
              disabled={save.isPending || columnMissing || problems.length > 0}
              data-testid="display-save"
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
