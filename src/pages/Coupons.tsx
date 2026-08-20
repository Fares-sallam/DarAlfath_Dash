import { useState } from 'react';
import Layout from '@/components/layout/Layout';
import {
  Plus, Edit, Trash2, Copy, X, ToggleLeft, ToggleRight,
  Tag, Percent, DollarSign, Truck, Package, Calendar,
  MapPin, Loader2, AlertCircle, RefreshCw, Search, Download, Globe2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useCoupons, useUpsertCoupon, useToggleCoupon, useDeleteCoupon,
  useCouponProducts, useCouponCountries,
  getCouponStatus,
  type Coupon, type CouponType, type UpsertCouponInput,
} from '@/hooks/useCoupons';
import { useQueryClient } from '@tanstack/react-query';
import { useCountry } from '@/contexts/CountryContext';

/* ── Configs ── */
const statusConfig: Record<string, { cls: string; dot: string }> = {
  'نشط': { cls: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  'منتهي': { cls: 'bg-red-100 text-red-500', dot: 'bg-red-500' },
  'معطل': { cls: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400' },
  'لم يبدأ': { cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-400' },
};

const typeIcons: Record<CouponType, React.ReactNode> = {
  'نسبة': <Percent size={15} className="text-blue-600" />,
  'مبلغ ثابت': <DollarSign size={15} className="text-amber-600" />,
  'شحن مجاني': <Truck size={15} className="text-green-600" />,
  'خصم منتج': <Package size={15} className="text-purple-600" />,
};

const typeCardColors: Record<CouponType, string> = {
  'نسبة': 'border-blue-100',
  'مبلغ ثابت': 'border-amber-100',
  'شحن مجاني': 'border-green-100',
  'خصم منتج': 'border-purple-100',
};

const typeValueColors: Record<CouponType, string> = {
  'نسبة': 'text-blue-700',
  'مبلغ ثابت': 'text-amber-700',
  'شحن مجاني': 'text-green-600',
  'خصم منتج': 'text-purple-700',
};

function generateCode(): string {
  return Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8).padEnd(8, 'X');
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function toInputDate(iso?: string): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

interface CouponForm {
  code: string;
  type: CouponType;
  value: string;
  min_order: string;
  max_uses: string;
  product_id: string;
  country_id: string;
  valid_from: string;
  valid_to: string;
  is_active: boolean;
}

const emptyForm: CouponForm = {
  code: '',
  type: 'نسبة',
  value: '',
  min_order: '0',
  max_uses: '',
  product_id: '',
  country_id: '',
  valid_from: '',
  valid_to: '',
  is_active: true,
};

export default function Coupons() {
  const qc = useQueryClient();
  const { selectedCountry, currencySymbol } = useCountry();

  const { data: coupons = [], isLoading, isError } = useCoupons();
  const { data: products = [] } = useCouponProducts();
  const { data: countries = [] } = useCouponCountries();

  const upsertMutation = useUpsertCoupon();
  const toggleMutation = useToggleCoupon();
  const deleteMutation = useDeleteCoupon();

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('الكل');
  const [filterType, setFilterType] = useState('الكل');

  const [showModal, setShowModal] = useState(false);
  const [editCoupon, setEditCoupon] = useState<Coupon | null>(null);
  const [form, setForm] = useState<CouponForm>(emptyForm);

  const couponsWithStatus = coupons.map((c) => ({ ...c, _status: getCouponStatus(c) }));

  const filtered = couponsWithStatus.filter((c) => {
    const ms = filterStatus === 'الكل' || c._status === filterStatus;
    const mt = filterType === 'الكل' || c.type === filterType;
    const mq =
      !search ||
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      (c.products?.title ?? '').toLowerCase().includes(search.toLowerCase());

    return ms && mt && mq;
  });

  const active = couponsWithStatus.filter((c) => c._status === 'نشط').length;
  const expired = couponsWithStatus.filter((c) => c._status === 'منتهي').length;
  const disabled = couponsWithStatus.filter((c) => c._status === 'معطل').length;
  const notStarted = couponsWithStatus.filter((c) => c._status === 'لم يبدأ').length;
  const totalUsages = coupons.reduce((a, c) => a + c.used_count, 0);

  const openAdd = () => {
    setEditCoupon(null);
    setForm({
      ...emptyForm,
      valid_from: new Date().toISOString().slice(0, 10),
      country_id: selectedCountry?.id ?? '',
    });
    setShowModal(true);
  };

  const openEdit = (c: Coupon) => {
    setEditCoupon(c);
    setForm({
      code: c.code,
      type: c.type,
      value: String(c.value),
      min_order: String(c.min_order),
      max_uses: c.max_uses != null ? String(c.max_uses) : '',
      product_id: c.product_id ?? '',
      country_id: c.country_id ?? selectedCountry?.id ?? '',
      valid_from: toInputDate(c.valid_from),
      valid_to: toInputDate(c.valid_to),
      is_active: c.is_active,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.code.trim()) {
      toast.error('كود الخصم إلزامي');
      return;
    }

    if (form.type !== 'شحن مجاني' && (!form.value || parseFloat(form.value) <= 0)) {
      toast.error('قيمة الخصم إلزامية وأكبر من صفر');
      return;
    }

    if (!form.valid_from) {
      toast.error('تاريخ البداية إلزامي');
      return;
    }

    if (form.type === 'نسبة' && parseFloat(form.value) > 100) {
      toast.error('نسبة الخصم لا يمكن أن تتجاوز 100٪');
      return;
    }

    if (form.valid_to && form.valid_to < form.valid_from) {
      toast.error('تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية');
      return;
    }

    const input: UpsertCouponInput = {
      id: editCoupon?.id,
      code: form.code,
      type: form.type,
      value: parseFloat(form.value) || 0,
      min_order: parseFloat(form.min_order) || 0,
      max_uses: form.max_uses ? parseInt(form.max_uses) : undefined,
      product_id: form.product_id || undefined,
      country_id: form.country_id || selectedCountry?.id || undefined,
      valid_from: new Date(form.valid_from).toISOString(),
      valid_to: form.valid_to
        ? new Date(form.valid_to + 'T23:59:59').toISOString()
        : undefined,
      is_active: form.is_active,
    };

    await upsertMutation.mutateAsync(input);
    setShowModal(false);
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success(`تم نسخ الكود: ${code}`);
  };

  return (
    <Layout>
      <div className="fade-in" dir="rtl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="section-title">إدارة الكوبونات والخصم</h1>
            <p className="section-subtitle">
              إنشاء وإدارة كوبونات الخصم — {selectedCountry?.name ? `كوبونات ${selectedCountry.name}` : 'بيانات حقيقية من Supabase'}
            </p>

            <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-xl bg-blue-50 text-blue-700">
              <Globe2 size={12} />
              {selectedCountry?.name ?? 'كل الدول'} · {currencySymbol}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                qc.invalidateQueries({ queryKey: ['coupons'] });
                toast.info('جارٍ التحديث...');
              }}
              className="p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 transition-colors"
              title="تحديث"
            >
              <RefreshCw size={16} />
            </button>

            <button
              onClick={() => {
                const bom = '\uFEFF';
                const headers = ['الكود', 'النوع', 'القيمة', 'الحد الأدنى', 'الاستخدامات', 'الحد الأقصى', 'الحالة', 'يبدأ', 'ينتهي'];
                const rows = filtered.map((c) => [
                  c.code,
                  c.type,
                  c.type === 'نسبة' ? `${c.value}٪` : c.type === 'شحن مجاني' ? 'مجاني' : `${c.value} ${currencySymbol}`,
                  `${c.min_order} ${currencySymbol}`,
                  c.used_count,
                  c.max_uses ?? 'غير محدود',
                  c._status,
                  new Date(c.valid_from).toLocaleDateString('ar-EG'),
                  c.valid_to ? new Date(c.valid_to).toLocaleDateString('ar-EG') : 'غير محدود',
                ]);

                const csv =
                  bom +
                  [headers, ...rows]
                    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
                    .join('\n');

                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `coupons-${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);

                toast.success('تم تصدير الكوبونات');
              }}
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <Download size={14} />
              تصدير CSV
            </button>

            <button onClick={openAdd} className="btn-primary flex items-center gap-2">
              <Plus size={16} />
              إضافة كوبون
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {[
            { label: 'نشط', value: active, cls: 'text-green-600', bg: 'bg-green-50' },
            { label: 'منتهي', value: expired, cls: 'text-red-500', bg: 'bg-red-50' },
            { label: 'معطل', value: disabled, cls: 'text-gray-500', bg: 'bg-gray-50' },
            { label: 'لم يبدأ', value: notStarted, cls: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'إجمالي الاستخدامات', value: totalUsages, cls: 'text-blue-700', bg: 'bg-blue-50' },
          ].map((s, i) => (
            <div key={i} className={`${s.bg} rounded-2xl p-4 text-center`}>
              {isLoading ? (
                <div className="h-8 bg-white/60 rounded-lg animate-pulse mx-auto w-12 mb-1" />
              ) : (
                <p className={`text-2xl font-bold ${s.cls}`}>{s.value.toLocaleString()}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm mb-5 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="ابحث بالكود أو اسم المنتج..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pr-10"
            />
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>

          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input-field md:w-36">
            <option>الكل</option>
            <option>نشط</option>
            <option>منتهي</option>
            <option>معطل</option>
            <option>لم يبدأ</option>
          </select>

          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input-field md:w-40">
            <option>الكل</option>
            <option>نسبة</option>
            <option>مبلغ ثابت</option>
            <option>شحن مجاني</option>
            <option>خصم منتج</option>
          </select>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
            <Loader2 size={26} className="animate-spin" />
            <span>جارٍ تحميل الكوبونات...</span>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-red-400">
            <AlertCircle size={30} />
            <span>تعذّر تحميل الكوبونات</span>
          </div>
        )}

        {!isLoading && !isError && (
          <>
            <p className="text-sm text-gray-400 mb-4">{filtered.length} كوبون</p>

            {filtered.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <Tag size={44} className="text-gray-200 mx-auto mb-3" />
                <p className="font-semibold text-gray-500">لا توجد كوبونات</p>
                <p className="text-sm mt-1">لا توجد كوبونات لهذه الدولة بعد</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((coupon) => {
                  const status = coupon._status;
                  const sCfg = statusConfig[status] ?? statusConfig['معطل'];
                  const usePct = coupon.max_uses
                    ? Math.min(Math.round((coupon.used_count / coupon.max_uses) * 100), 100)
                    : 0;
                  const barColor = usePct >= 90 ? '#ef4444' : usePct >= 60 ? '#f59e0b' : '#1d4ed8';

                  return (
                    <div
                      key={coupon.id}
                      className={`bg-white rounded-2xl p-5 shadow-sm border-2 transition-all hover:shadow-md ${typeCardColors[coupon.type]}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                              {typeIcons[coupon.type]}
                            </div>

                            <span className="font-black text-gray-800 text-lg tracking-widest font-mono truncate">
                              {coupon.code}
                            </span>

                            <button
                              onClick={() => handleCopy(coupon.code)}
                              className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                              title="نسخ الكود"
                            >
                              <Copy size={12} />
                            </button>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${sCfg.cls}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${sCfg.dot}`} />
                              {status}
                            </span>
                            <span className="text-xs text-gray-400">{coupon.type}</span>
                          </div>
                        </div>

                        <div className="text-left flex-shrink-0 mr-2">
                          {coupon.type === 'شحن مجاني' ? (
                            <span className="text-sm font-bold text-green-600 bg-green-50 px-2 py-1 rounded-xl">مجاناً</span>
                          ) : (
                            <p className={`text-2xl font-black leading-none ${typeValueColors[coupon.type]}`}>
                              {coupon.type === 'نسبة'
                                ? `${coupon.value}٪`
                                : `${coupon.value.toLocaleString()} ${currencySymbol}`}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1.5 border-t border-gray-100 pt-3 mb-3">
                        <DetailRow label="الحد الأدنى" value={`${coupon.min_order.toLocaleString()} ${currencySymbol}`} />
                        <DetailRow
                          label="الاستخدامات"
                          value={
                            coupon.max_uses != null
                              ? `${coupon.used_count} / ${coupon.max_uses}`
                              : `${coupon.used_count} (غير محدود)`
                          }
                          highlight={coupon.max_uses != null && coupon.used_count >= coupon.max_uses}
                        />
                        <DetailRow label="يبدأ" value={formatDate(coupon.valid_from)} />
                        <DetailRow
                          label="ينتهي"
                          value={coupon.valid_to ? formatDate(coupon.valid_to) : 'غير محدود'}
                          highlight={status === 'منتهي'}
                        />
                        {coupon.products && (
                          <DetailRow label="منتج محدد" value={coupon.products.title} highlight={false} />
                        )}
                        {coupon.countries && (
                          <DetailRow label="الدولة" value={coupon.countries.name} />
                        )}
                        {coupon.profiles && (
                          <DetailRow label="عميل محدد" value={coupon.profiles.full_name} />
                        )}
                      </div>

                      {coupon.max_uses != null && (
                        <div className="mb-4">
                          <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span>نسبة الاستخدام</span>
                            <span className="font-semibold">{usePct}٪</span>
                          </div>
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${usePct}%`, background: barColor }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => openEdit(coupon)}
                          className="flex-1 btn-secondary text-xs flex items-center justify-center gap-1.5 py-2"
                          disabled={upsertMutation.isPending}
                        >
                          <Edit size={12} />
                          تعديل
                        </button>

                        <button
                          onClick={() => toggleMutation.mutate({ id: coupon.id, is_active: !coupon.is_active })}
                          disabled={toggleMutation.isPending}
                          className={`flex-1 text-xs flex items-center justify-center gap-1.5 py-2 rounded-xl border font-semibold transition-colors ${
                            coupon.is_active
                              ? 'border-gray-200 text-gray-500 hover:bg-gray-50'
                              : 'border-green-200 text-green-600 hover:bg-green-50'
                          }`}
                        >
                          {coupon.is_active ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                          {coupon.is_active ? 'تعطيل' : 'تفعيل'}
                        </button>

                        <button
                          onClick={() => deleteMutation.mutate(coupon.id)}
                          disabled={deleteMutation.isPending}
                          className="px-3 py-2 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                          title="حذف"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-6">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                  <Tag size={18} className="text-amber-600" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-800">{editCoupon ? 'تعديل الكوبون' : 'إضافة كوبون جديد'}</h2>
                  <p className="text-xs text-gray-400">سيُربط الكوبون بالدولة الحالية</p>
                </div>
              </div>

              <button
                onClick={() => setShowModal(false)}
                className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  كود الخصم <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                    className="input-field flex-1 font-mono tracking-widest"
                    placeholder="SUMMER25"
                    maxLength={30}
                  />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, code: generateCode() }))}
                    className="btn-secondary text-xs px-3 flex-shrink-0"
                  >
                    توليد
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">نوع الخصم</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CouponType }))}
                    className="input-field"
                  >
                    <option value="نسبة">نسبة %</option>
                    <option value="مبلغ ثابت">مبلغ ثابت ({currencySymbol})</option>
                    <option value="شحن مجاني">شحن مجاني</option>
                    <option value="خصم منتج">خصم منتج محدد</option>
                  </select>
                </div>

                {form.type !== 'شحن مجاني' && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      القيمة {form.type === 'نسبة' ? '(%) ≤ 100' : `(${currencySymbol})`} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={form.value}
                      onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                      className="input-field"
                      placeholder={form.type === 'نسبة' ? 'مثال: 20' : 'مثال: 50'}
                      min={0}
                      max={form.type === 'نسبة' ? 100 : undefined}
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">الحد الأدنى للطلب ({currencySymbol})</label>
                  <input
                    type="number"
                    value={form.min_order}
                    onChange={(e) => setForm((f) => ({ ...f, min_order: e.target.value }))}
                    className="input-field"
                    min={0}
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">الحد الأقصى للاستخدام</label>
                  <input
                    type="number"
                    value={form.max_uses}
                    onChange={(e) => setForm((f) => ({ ...f, max_uses: e.target.value }))}
                    className="input-field"
                    min={1}
                    placeholder="اتركه فارغاً = غير محدود"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <Calendar size={13} />
                    تاريخ البداية <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.valid_from}
                    onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))}
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <Calendar size={13} />
                    تاريخ الانتهاء
                  </label>
                  <input
                    type="date"
                    value={form.valid_to}
                    onChange={(e) => setForm((f) => ({ ...f, valid_to: e.target.value }))}
                    className="input-field"
                    min={form.valid_from}
                  />
                  <p className="text-xs text-gray-400 mt-1">اتركه فارغاً = لا ينتهي</p>
                </div>
              </div>

              <div className="bg-indigo-50 rounded-2xl p-4 space-y-3">
                <h4 className="text-sm font-bold text-indigo-800 flex items-center gap-2">
                  <Tag size={14} />
                  استهداف محدد (اختياري)
                </h4>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                    <Package size={11} />
                    منتج محدد
                  </label>
                  <select
                    value={form.product_id}
                    onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
                    className="input-field text-sm py-2 h-auto"
                  >
                    <option value="">جميع المنتجات</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                    <MapPin size={11} />
                    الدولة الحالية
                  </label>
                  <select
                    value={form.country_id}
                    onChange={(e) => setForm((f) => ({ ...f, country_id: e.target.value }))}
                    className="input-field text-sm py-2 h-auto"
                  >
                    <option value="">بدون دولة محددة</option>
                    {countries.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between bg-gray-50 rounded-2xl p-4">
                <div>
                  <p className="text-sm font-semibold text-gray-700">حالة الكوبون</p>
                  <p className="text-xs text-gray-400 mt-0.5">هل الكوبون مفعّل ومتاح للاستخدام؟</p>
                </div>

                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
                  className={`relative w-12 h-6 rounded-full transition-colors ${form.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                      form.is_active ? 'left-6' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-3xl">
              <button onClick={() => setShowModal(false)} className="btn-secondary">
                إلغاء
              </button>

              <button
                onClick={handleSave}
                disabled={upsertMutation.isPending}
                className="btn-primary flex items-center gap-2 disabled:opacity-60"
              >
                {upsertMutation.isPending ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : editCoupon ? (
                  <Edit size={15} />
                ) : (
                  <Plus size={15} />
                )}
                {upsertMutation.isPending ? 'جارٍ الحفظ...' : editCoupon ? 'حفظ التعديلات' : 'إضافة الكوبون'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function DetailRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline text-xs">
      <span className="text-gray-400">{label}</span>
      <span className={`font-semibold ${highlight ? 'text-red-500' : 'text-gray-700'}`}>
        {value}
      </span>
    </div>
  );
}