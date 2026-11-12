import { useMemo, useState } from 'react';
import { Search, Plus, Minus, X, BookOpen, AlertCircle, Layers, RotateCcw } from 'lucide-react';
import {
  computeBundleSummary,
  type BundleComponentOption,
  type BundleItemDraft,
  type BundleKind,
} from '@/lib/bundles';
import { iapProductIdError } from '@/lib/iap';

interface BundleComposerProps {
  options: BundleComponentOption[];
  items: BundleItemDraft[];
  onItemsChange: (items: BundleItemDraft[]) => void;
  price: string;
  onPriceChange: (value: string) => void;
  /** Hands the price back to "follow سعر البناء automatically". */
  onResetPrice: () => void;
  currencySymbol: string;
  /** A paper bundle (the default) or an e-book series. */
  kind?: BundleKind;
  /** The series' product id in App Store Connect / Google Play (series only). */
  iapProductId?: string;
  onIapProductIdChange?: (value: string) => void;
}

function money(value: number, currencySymbol: string) {
  return `${value.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ${currencySymbol}`;
}

function Cover({ url, title }: { url?: string | null; title: string }) {
  return url ? (
    <img src={url} alt={title} className="w-9 h-12 rounded-lg object-cover flex-shrink-0 border border-gray-200" />
  ) : (
    <div className="w-9 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 border border-gray-200">
      <BookOpen size={12} className="text-gray-300" />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'good' | 'bad';
}) {
  const color = tone === 'good' ? 'text-green-600' : tone === 'bad' ? 'text-red-500' : 'text-gray-800';
  return (
    <div className="bg-white rounded-xl p-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-base font-bold ${color}`}>{value}</p>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{hint}</p>}
    </div>
  );
}

export default function BundleComposer({
  options,
  items,
  onItemsChange,
  price,
  onPriceChange,
  onResetPrice,
  currencySymbol,
  kind = 'paper',
  iapProductId = '',
  onIapProductIdChange,
}: BundleComposerProps) {
  const [query, setQuery] = useState('');
  const digital = kind === 'digital';
  const iapError = iapProductIdError(iapProductId);

  const byId = useMemo(() => new Map(options.map((o) => [o.variant_id, o])), [options]);
  const summary = useMemo(() => computeBundleSummary(items, byId, kind), [items, byId, kind]);

  const selectedIds = new Set(items.map((i) => i.component_variant_id));
  const q = query.trim().toLowerCase();
  const results = q
    ? options
        .filter(
          (o) =>
            !selectedIds.has(o.variant_id) &&
            (o.title.toLowerCase().includes(q) || o.variant_name.toLowerCase().includes(q))
        )
        .slice(0, 8)
    : [];

  const bundlePrice = Number(price) || 0;
  const savings = summary.buildPrice - bundlePrice;
  const savingsPct = summary.buildPrice > 0 && savings > 0 ? Math.round((savings / summary.buildPrice) * 100) : 0;
  const profit = bundlePrice - summary.totalCost;
  const distinctBooks = selectedIds.size;

  const addItem = (option: BundleComponentOption) => {
    onItemsChange([...items, { component_variant_id: option.variant_id, quantity: 1 }]);
    setQuery('');
  };

  const setQuantity = (variantId: string, quantity: number) => {
    onItemsChange(
      items.map((i) =>
        i.component_variant_id === variantId ? { ...i, quantity: Math.max(1, Math.min(99, quantity)) } : i
      )
    );
  };

  const removeItem = (variantId: string) => {
    onItemsChange(items.filter((i) => i.component_variant_id !== variantId));
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-bold text-gray-700">
          {digital ? 'كتب السلسلة' : 'كتب المجموعة'} <span className="text-red-500">*</span>
        </p>
        <p className="text-xs text-gray-400">
          {digital
            ? 'اختار كتابين أو أكتر من النسخ الإلكترونية. العميل بيشتري السلسلة مرة واحدة ويقرا كل كتبها. مفيش مخزون ولا شحن.'
            : 'اختار كتابين أو أكتر من النسخ الورقية. التكلفة وسعر البناء والمخزون والوزن بيتحسبوا تلقائيًا من الكتب نفسها.'}
        </p>
      </div>

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={digital ? 'ابحث باسم الكتاب لإضافته للسلسلة...' : 'ابحث باسم الكتاب لإضافته للمجموعة...'}
          className="input-field pr-10"
        />
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />

        {results.length > 0 && (
          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-72 overflow-y-auto">
            {results.map((o) => (
              <button
                key={o.variant_id}
                type="button"
                onClick={() => addItem(o)}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-blue-50 text-right transition-colors"
              >
                <Cover url={o.cover_url} title={o.title} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{o.title}</p>
                  <p className="text-xs text-gray-400">
                    {o.variant_name} · {o.price > 0 ? money(o.price, currencySymbol) : 'بدون سعر'}
                    {!digital && ` · متاح ${o.available ?? 0}`}
                    {!o.is_active && ' · مخفي من البيع منفردًا'}
                  </p>
                </div>
                <Plus size={15} className="text-blue-600 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}

        {q && results.length === 0 && (
          <p className="text-xs text-gray-400 mt-2">
            {digital ? 'مفيش نسخة إلكترونية بالاسم ده (أو اتضافت خلاص). الكتاب لازم يكون له نسخة إلكترونية الأول.' : 'مفيش نسخة ورقية بالاسم ده (أو اتضافت خلاص)'}
          </p>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 border border-dashed border-gray-200 rounded-2xl">
          <Layers size={28} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500 font-semibold">{digital ? 'لسه مفيش كتب في السلسلة' : 'لسه مفيش كتب في المجموعة'}</p>
          <p className="text-xs text-gray-400 mt-1">ابحث فوق وضيف الكتب اللي هتتباع مع بعض</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const option = byId.get(item.component_variant_id);

            if (!option) {
              return (
                <div
                  key={item.component_variant_id}
                  className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5"
                >
                  <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
                  <p className="flex-1 text-sm text-red-600">كتاب اتمسح أو مبقاش نسخة {digital ? 'إلكترونية' : 'ورقية'}. شيله من {digital ? 'السلسلة' : 'المجموعة'}.</p>
                  <button
                    type="button"
                    onClick={() => removeItem(item.component_variant_id)}
                    className="p-1.5 rounded-lg hover:bg-red-100 text-red-500"
                    title="شيل من المجموعة"
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            }

            const shortage = !digital && (option.available ?? 0) < item.quantity;

            return (
              <div
                key={item.component_variant_id}
                className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100"
              >
                <Cover url={option.cover_url} title={option.title} />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{option.title}</p>
                  <p className="text-xs text-gray-400">
                    {option.variant_name} ·{' '}
                    {option.price > 0 ? `${money(option.price, currencySymbol)} للنسخة` : 'بدون سعر'}
                    {!digital && (
                      <>
                        {' · '}
                        <span className={shortage ? 'text-red-500 font-semibold' : ''}>متاح {option.available ?? 0}</span>
                      </>
                    )}
                  </p>
                </div>

                {/* An e-book is bought once, so a series has no quantity to set. */}
                {!digital && (
                  <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 px-1">
                    <button
                      type="button"
                      onClick={() => setQuantity(item.component_variant_id, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                      className="p-1 text-gray-500 hover:text-blue-700 disabled:opacity-30"
                      title="نسخة أقل"
                    >
                      <Minus size={13} />
                    </button>
                    <span className="w-6 text-center text-sm font-bold text-gray-800">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity(item.component_variant_id, item.quantity + 1)}
                      className="p-1 text-gray-500 hover:text-blue-700"
                      title="نسخة أكتر"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => removeItem(item.component_variant_id)}
                  className="p-1.5 rounded-lg hover:bg-red-100 text-red-500"
                  title="شيل من المجموعة"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-blue-50 rounded-2xl p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="إجمالي التكلفة" value={money(summary.totalCost, currencySymbol)} />
          <Stat
            label="سعر الكتب منفردة (سعر البناء)"
            value={money(summary.buildPrice, currencySymbol)}
          />
          {digital ? (
            <Stat label="التسليم" value="إلكتروني" hint="من غير مخزون ولا شحن: بيتسجل في مكتبة العميل" />
          ) : (
            <Stat
              label="المخزون المتاح"
              value={`${summary.available.toLocaleString('ar-EG')} مجموعة`}
              hint={
                summary.bottleneck && items.length > 0
                  ? `محدود بـ: ${summary.bottleneck.title}`
                  : 'بيتحسب تلقائيًا من مخزون الكتب'
              }
              tone={items.length > 0 && summary.available === 0 ? 'bad' : 'default'}
            />
          )}
          <Stat
            label="توفير العميل"
            value={savings > 0 && bundlePrice > 0 ? `${money(savings, currencySymbol)} (${savingsPct}٪)` : '—'}
          />
          <Stat
            label="الربح المتوقع"
            value={bundlePrice > 0 ? money(profit, currencySymbol) : '—'}
            tone={bundlePrice > 0 ? (profit >= 0 ? 'good' : 'bad') : 'default'}
          />
          {!digital && (
            <Stat
              label="وزن الشحن"
              value={`${summary.weightKg.toLocaleString('ar-EG', { maximumFractionDigits: 3 })} كجم`}
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            {digital ? `سعر السلسلة على الموقع (${currencySymbol})` : `سعر المجموعة (${currencySymbol})`} <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              value={price}
              onChange={(e) => onPriceChange(e.target.value)}
              className="input-field flex-1"
              placeholder={summary.buildPrice > 0 ? String(summary.buildPrice) : '0'}
            />
            {summary.buildPrice > 0 && bundlePrice !== summary.buildPrice && (
              <button
                type="button"
                onClick={onResetPrice}
                className="btn-secondary text-xs whitespace-nowrap flex items-center gap-1"
                title="رجّع السعر لمجموع أسعار الكتب"
              >
                <RotateCcw size={12} />
                سعر البناء
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1.5">
            السعر بيبدأ بسعر البناء. اكتب رقم أقل منه عشان يظهر للعميل كخصم وتوفير.
            {digital && ' جوه التطبيق السعر بيتحدد من المتجر (App Store / Google Play) مش من هنا.'}
          </p>
        </div>

        {digital && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">معرّف منتج المتجر (App Store / Google Play)</label>
            <input
              type="text"
              dir="ltr"
              value={iapProductId}
              onChange={(e) => onIapProductIdChange?.(e.target.value)}
              className="input-field"
              placeholder="com.daralfath.store.series_nahw_ebook"
              aria-label="معرّف منتج المتجر"
            />
            {iapError && <p className="text-xs text-red-500 mt-1">{iapError}</p>}
            <p className="text-xs text-gray-500 mt-1.5">
              لازم يطابق بالظبط الـProduct ID اللي بتعمله للسلسلة في المتجرين (منتج من نوع Non-Consumable في App Store Connect، وone-time product في Google Play).
              من غيره السلسلة بتتباع على الموقع بس، وفي التطبيق بيظهر «غير متاح للشراء».
            </p>
          </div>
        )}

        {(() => {
          const warnings: string[] = [];
          if (items.length > 0 && distinctBooks < 2) warnings.push('المجموعة لازم فيها كتابين مختلفين على الأقل.');
          if (summary.missingPrice.length > 0) {
            warnings.push(`مفيش سعر بيع في الدولة دي لـ: ${summary.missingPrice.join('، ')}. سعر البناء ناقص.`);
          }
          if (summary.missingCost.length > 0) {
            warnings.push(`مفيش سعر تكلفة لـ: ${summary.missingCost.join('، ')}. الربح المحسوب مش دقيق.`);
          }
          if (bundlePrice > 0 && summary.buildPrice > 0 && bundlePrice > summary.buildPrice) {
            warnings.push('سعر المجموعة أعلى من مجموع أسعار الكتب منفردة، يعني العميل مش هيشوف أي توفير.');
          }
          if (digital && items.length > 0 && !iapProductId.trim()) {
            warnings.push('لسه مفيش معرّف منتج المتجر: السلسلة مش هتتباع من التطبيق لحد ما تكتبه.');
          }
          if (!digital && items.length > 0 && summary.available === 0 && summary.bottleneck) {
            warnings.push(
              `المخزون الحالي مش كفاية ولا لمجموعة واحدة، فهتظهر في المتجر "غير متوفرة" لحد ما يزيد مخزون: ${summary.bottleneck.title}.`
            );
          }
          if (warnings.length === 0) return null;
          return (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-1">
              {warnings.map((w) => (
                <p key={w} className="text-xs text-amber-800 flex items-start gap-1.5">
                  <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                  {w}
                </p>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
