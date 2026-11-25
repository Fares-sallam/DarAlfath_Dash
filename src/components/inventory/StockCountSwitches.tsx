import { useMemo, useState } from 'react';
import { AlertTriangle, Eye, EyeOff, Loader2, Save, Undo2 } from 'lucide-react';
import LiveFrame from '@/components/preview/LiveFrame';
import { Pills, PreviewShell } from '@/components/preview/PreviewControls';
import { useSampleBooks } from '@/hooks/useSampleBooks';
import { useSaveStockVisibility, useStockVisibilityAdmin } from '@/hooks/useStockVisibility';
import { SITE_PREVIEW_READY, buildStockMessage, siteOrigin, sitePreviewUrl } from '@/lib/livePreview';
import { DEFAULT_STOCK_VISIBILITY, STOCK_VISIBILITY_LABELS, stockVisibilityChanged, type StockVisibility } from '@/lib/stockVisibility';

const SIZE = { mobile: { width: 390, height: 600 }, desktop: { width: 1024, height: 600 } } as const;

function Switch({ checked, onChange, label, testId, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; testId: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-blue-700' : 'bg-gray-300'}`}
      data-testid={testId}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? '-translate-x-5' : '-translate-x-0.5'}`} />
    </button>
  );
}

/**
 * «إظهار عدد النسخ للعملاء»: two switches, one for the website and one for the app. With a switch off, the customer sees «متوفر»
 * (or «نافد» / «آخر النسخ») instead of the number of copies. A change is tried on the real website's book page before it is saved.
 */
export default function StockCountSwitches() {
  const { data, isLoading } = useStockVisibilityAdmin();
  const save = useSaveStockVisibility();
  const { data: books = [] } = useSampleBooks();

  const [draft, setDraft] = useState<StockVisibility | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');

  const saved = data?.value ?? DEFAULT_STOCK_VISIBILITY;
  const current = draft ?? saved;
  const dirty = draft !== null && stockVisibilityChanged(saved, draft);
  const missing = Boolean(data?.columnMissing);
  // the frame opens by itself once something is changed (that is when it is needed), or whenever the owner asks for it
  const showPreview = (previewOpen || dirty) && !missing;
  const bookId = books[0]?.id ?? null;
  const message = useMemo(() => buildStockMessage(current, bookId), [current, bookId]);

  const set = (place: 'web' | 'app', next: boolean) => setDraft({ ...current, [place]: next });
  const onSave = () => {
    if (!draft || !dirty) return;
    save.mutate({ loaded: saved, draft }, { onSuccess: () => setDraft(null) });
  };

  const row = (place: 'web' | 'app', title: string, note: string) => (
    <div className="flex items-center gap-3 py-3" data-testid={`stock-row-${place}`}>
      <Switch checked={current[place]} onChange={(next) => set(place, next)} label={`إظهار عدد النسخ في ${title}`} testId={`stock-switch-${place}`} disabled={missing || isLoading || save.isPending} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-gray-800">{title}</p>
        <p className={`text-xs ${current[place] ? 'text-green-700' : 'text-amber-700'}`} data-testid={`stock-state-${place}`}>
          {current[place] ? STOCK_VISIBILITY_LABELS[place].shown : STOCK_VISIBILITY_LABELS[place].hidden}
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5">{note}</p>
      </div>
    </div>
  );

  return (
    <section className="bg-white rounded-2xl shadow-sm p-5 mb-6" data-testid="stock-count-card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="max-w-2xl">
          <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
            {current.web && current.app ? <Eye size={17} className="text-blue-700" /> : <EyeOff size={17} className="text-amber-600" />}
            إظهار عدد النسخ للعملاء
          </h2>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            بيتحكم في الرقم اللي بيظهر للعميل تحت كل طبعة («متوفر 12 نسخة») وفي «باقي N نسخ فقط» و«آخر N نسخ». لما تقفله بيظهر «متوفر» أو «نافد» أو «آخر النسخ» بدل الرقم.
            المخزون عندك هنا مش بيتأثر، ده اللي العميل بيشوفه بس.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPreviewOpen((v) => !v)}
          disabled={missing}
          className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50"
          data-testid="stock-preview-toggle"
          aria-expanded={showPreview}
        >
          {showPreview ? 'إخفاء المعاينة' : 'معاينة'}
        </button>
      </div>

      {missing && (
        <p className="mt-3 text-xs font-semibold text-amber-700 bg-amber-50 rounded-xl px-3 py-2 flex items-center gap-2" data-testid="stock-missing">
          <AlertTriangle size={14} /> الإعداد ده لسه مش متفعّل على قاعدة البيانات، فمش هيتحفظ.
        </p>
      )}

      <div className={showPreview ? 'mt-3 xl:grid xl:grid-cols-[minmax(0,1fr)_460px] xl:gap-5 xl:items-start' : 'mt-3'}>
        <div>
          <div className="divide-y divide-gray-100">
            {row('web', 'في الموقع', 'بيشمل صفحة الكتاب والكارت.')}
            {row('app', 'في التطبيق', 'بيتطبق في التطبيق مع أول نسخة جديدة منه. النسخ المنزّلة دلوقتي بتعرض العدد دايمًا.')}
          </div>
          <div className="flex items-center gap-3 flex-wrap mt-2">
            <button type="button" onClick={onSave} disabled={!dirty || save.isPending || missing} className="btn-primary flex items-center gap-2 disabled:opacity-50" data-testid="stock-save">
              {save.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} حفظ
            </button>
            <button type="button" onClick={() => setDraft(null)} disabled={!dirty || save.isPending} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1.5" data-testid="stock-reset">
              <Undo2 size={14} /> تراجع
            </button>
            {dirty && <span className="text-xs text-amber-700 font-semibold" data-testid="stock-dirty">فيه تعديل مش محفوظ (شايفه في المعاينة)</span>}
          </div>
        </div>

        {showPreview && (
          <div className="mt-4 xl:mt-0 min-w-0">
            <PreviewShell
              testId="stock-live-preview"
              title="معاينة حية"
              hint="صفحة كتاب حقيقي في الموقع بالإعداد قبل الحفظ (الطبعات تحت «اختر الطبعة»)."
              controls={<Pills<'mobile' | 'desktop'> label="حجم الشاشة" value={device} onChange={setDevice} options={[{ key: 'mobile', label: 'موبايل', testId: 'stock-device-mobile' }, { key: 'desktop', label: 'كمبيوتر', testId: 'stock-device-desktop' }]} />}
            >
              <LiveFrame
                key={`stock-${device}`}
                testId="stock-frame"
                title="معاينة عدد النسخ"
                src={sitePreviewUrl(bookId ? `/book/${bookId}` : '/books')}
                origin={siteOrigin}
                readyType={SITE_PREVIEW_READY}
                message={message}
                phone={device === 'mobile'}
                {...SIZE[device]}
              />
            </PreviewShell>
          </div>
        )}
      </div>
    </section>
  );
}
