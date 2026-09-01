import { useState } from 'react';
import { escapeHtml } from '@/lib/utils';
import * as XLSX from 'xlsx';
import Layout from '@/components/layout/Layout';
import {
  Search, Eye, Download, Printer, MessageCircle, Truck, X,
  Package, MapPin, CreditCard, Calendar, ChevronDown, Loader2,
  AlertCircle, RefreshCw, BookOpen, Phone, Hash, Check,
  ChevronUp, User, FileText, DollarSign, Scale
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  useOrders, useOrderDetail, useUpdateOrder, useShippingCompanies,
  exportOrdersCsv,
  type Order, type OrderFilters,
} from '@/hooks/useOrders';
import { useCountry } from '@/contexts/CountryContext';

/* ── Status config ── */
const ALL_STATUSES = ['جديد', 'قيد المراجعة', 'تم التأكيد', 'جاري الشحن', 'تم التوصيل', 'ملغي', 'مرتجع'] as const;
type OrderStatus = typeof ALL_STATUSES[number];

const statusConfig: Record<string, { cls: string; dot: string; ring: string }> = {
  'جديد':          { cls: 'bg-cyan-100 text-cyan-700',    dot: 'bg-cyan-500',    ring: 'ring-cyan-300' },
  'قيد المراجعة':  { cls: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500', ring: 'ring-yellow-300' },
  'تم التأكيد':    { cls: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500',    ring: 'ring-blue-300' },
  'جاري الشحن':    { cls: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500', ring: 'ring-indigo-300' },
  'تم التوصيل':    { cls: 'bg-green-100 text-green-700',  dot: 'bg-green-500',   ring: 'ring-green-300' },
  'ملغي':          { cls: 'bg-red-100 text-red-500',       dot: 'bg-red-500',     ring: 'ring-red-300' },
  'مرتجع':         { cls: 'bg-orange-100 text-orange-600', dot: 'bg-orange-500', ring: 'ring-orange-300' },
};

const paymentStatusConfig: Record<string, string> = {
  'مدفوع':  'bg-green-100 text-green-700',
  'معلق':   'bg-yellow-100 text-yellow-700',
  'مرتجع':  'bg-orange-100 text-orange-600',
  'فاشل':   'bg-red-100 text-red-500',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ar-EG', {
    year: 'numeric', month: 'short', day: 'numeric'
  });
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('ar-EG', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

/* ════════════════════════════════════════════════════════════ */
/* ── Order Detail Modal ── */
/* ════════════════════════════════════════════════════════════ */
interface DetailModalProps {
  orderId: string;
  onClose: () => void;
}

function OrderDetailModal({ orderId, onClose }: DetailModalProps) {
  const { currencySymbol: selectedCurrencySymbol } = useCountry();
  const { data: order, isLoading } = useOrderDetail(orderId);
  const { data: shippingCos = [] } = useShippingCompanies();
  const updateMutation = useUpdateOrder();

  const [localStatus, setLocalStatus] = useState<string>('');
  const [localPayStatus, setLocalPayStatus] = useState<string>('');
  const [trackingNum, setTrackingNum] = useState('');
  const [shippingCoId, setShippingCoId] = useState('');
  const [notes, setNotes] = useState('');
  const [initialized, setInitialized] = useState(false);

  if (order && !initialized) {
    setLocalStatus(order.status);
    setLocalPayStatus(order.payment_status);
    setTrackingNum(order.tracking_number ?? '');
    setShippingCoId(order.shipping_company_id ?? '');
    setNotes(order.notes ?? '');
    setInitialized(true);
  }

  const currency = order?.countries?.currency_symbol ?? selectedCurrencySymbol ?? 'ج.م';

  const handleSave = async () => {
    if (!order) return;
    await updateMutation.mutateAsync({
      id: order.id,
      status: localStatus,
      payment_status: localPayStatus,
      tracking_number: trackingNum || undefined,
      shipping_company_id: shippingCoId || null,
      notes: notes || undefined,
    });
    onClose();
  };

  const addr = order?.shipping_address;
  const customerName = order?.profiles?.full_name ?? addr?.name ?? 'زائر';
  const customerPhone = addr?.phone ?? order?.profiles?.phone ?? '';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-6">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
              <FileText size={16} className="text-blue-700" />
              تفاصيل الطلب
            </h2>
            <p className="text-xs text-blue-600 font-bold font-mono mt-0.5">{orderId}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400">
            <X size={20} />
          </button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
            <Loader2 size={24} className="animate-spin" />
            <span>جارٍ تحميل التفاصيل...</span>
          </div>
        )}

        {order && (
          <div className="p-6 space-y-5">
            <div className="flex items-start gap-4 bg-gradient-to-l from-blue-50 to-indigo-50 rounded-2xl p-4">
              {order.profiles?.avatar_url ? (
                <img
                  src={order.profiles.avatar_url}
                  alt={customerName}
                  className="w-12 h-12 rounded-2xl object-cover border-4 border-white shadow-sm flex-shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-blue-200 border-4 border-white shadow-sm flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-800 text-lg font-black">{customerName.charAt(0)}</span>
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-800">{customerName}</p>
                {customerPhone && (
                  <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5" dir="ltr">
                    <Phone size={12} />
                    {customerPhone}
                  </p>
                )}
                {(addr?.governorate || addr?.city) && (
                  <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                    <MapPin size={12} />
                    {[addr?.governorate, addr?.city].filter(Boolean).join(' — ')}
                  </p>
                )}
                {addr?.street && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {[addr.street, addr.building, addr.floor ? `طابق ${addr.floor}` : '', addr.apartment ? `شقة ${addr.apartment}` : '']
                      .filter(Boolean)
                      .join('، ')}
                  </p>
                )}
              </div>

              <button
                onClick={() => toast.info(`إرسال واتساب لـ ${customerName}`)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-xl text-xs font-semibold hover:bg-green-200 transition-colors flex-shrink-0"
              >
                <MessageCircle size={13} />
                واتساب
              </button>
            </div>

            <div>
              <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Package size={14} className="text-indigo-600" />
                  عناصر الطلب ({order.order_items?.length ?? 0})
                </span>
                {(() => {
                  const physicalItems = (order.order_items ?? []).filter((it) => !it.is_digital);
                  const totalWeight = physicalItems.reduce(
                    (sum, it) => sum + (it.product_variants?.weight_kg ?? 0) * it.quantity,
                    0
                  );
                  if (physicalItems.length < 2 || totalWeight <= 0) return null;
                  return (
                    <span className="flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-lg">
                      <Scale size={12} />
                      إجمالي الوزن: {totalWeight.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} كجم
                    </span>
                  );
                })()}
              </h3>

              <div className="space-y-2 max-h-56 overflow-y-auto">
                {(order.order_items ?? []).map((item) => {
                  const subtotal = (item.price_per_item - item.discount_per_item) * item.quantity;
                  const itemWeight = item.product_variants?.weight_kg;

                  return (
                    <div key={item.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-2.5">
                      {item.products?.cover_url ? (
                        <img
                          src={item.products.cover_url}
                          alt={item.products?.title}
                          className="w-9 h-12 rounded-lg object-cover flex-shrink-0 shadow-sm"
                        />
                      ) : (
                        <div className="w-9 h-12 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
                          <BookOpen size={12} className="text-gray-400" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">
                          {item.products?.title ?? 'منتج محذوف'}
                        </p>

                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          {item.product_variants?.variant_name && (
                            <span className="text-xs text-blue-600 font-semibold">
                              {item.product_variants.variant_name}
                            </span>
                          )}

                          <span className="text-xs text-gray-400">
                            الكمية: {item.quantity} × {item.price_per_item.toLocaleString()} {currency}
                          </span>

                          {item.discount_per_item > 0 && (
                            <span className="text-xs text-red-500">
                              خصم: {item.discount_per_item.toLocaleString()} {currency}
                            </span>
                          )}

                          {!item.is_digital && itemWeight != null && (
                            <span className="text-xs text-amber-700 flex items-center gap-0.5">
                              <Scale size={11} />
                              {itemWeight} كجم{item.quantity > 1 ? ` × ${item.quantity}` : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      <span className="text-sm font-bold text-gray-800 flex-shrink-0">
                        {subtotal.toLocaleString()} {currency}
                      </span>
                    </div>
                  );
                })}

                {(!order.order_items || order.order_items.length === 0) && (
                  <div className="text-center py-6 text-gray-400">
                    <Package size={24} className="text-gray-200 mx-auto mb-1" />
                    <p className="text-sm">لا توجد عناصر</p>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                  <DollarSign size={11} />
                  تكلفة الشحن
                </p>
                <p className="text-sm font-bold text-gray-800">
                  {order.shipping_cost.toLocaleString()} {currency}
                </p>
              </div>

              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">الخصم</p>
                <p className="text-sm font-bold text-red-500">
                  {order.discount_amount > 0 ? `- ${order.discount_amount.toLocaleString()} ${currency}` : '—'}
                  {order.coupons?.code && (
                    <span className="text-xs font-mono text-amber-600 mr-1">({order.coupons.code})</span>
                  )}
                </p>
              </div>

              <div className="bg-blue-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">الإجمالي</p>
                <p className="text-lg font-black text-blue-700">
                  {order.total_price.toLocaleString()} {currency}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                  <CreditCard size={11} />
                  طريقة الدفع
                </p>
                <p className="text-sm font-semibold text-gray-800">
                  {order.payment_methods?.method_name ?? '—'}
                  {order.payment_methods?.provider && (
                    <span className="text-xs text-gray-400 mr-1">({order.payment_methods.provider})</span>
                  )}
                </p>
              </div>

              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                  <Calendar size={11} />
                  تاريخ الطلب
                </p>
                <p className="text-sm font-semibold text-gray-800">{formatDateTime(order.created_at)}</p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-gray-700 mb-2">تحديث حالة الطلب</h3>
              <div className="grid grid-cols-4 gap-2">
                {ALL_STATUSES.map((s) => {
                  const cfg = statusConfig[s];
                  const active = localStatus === s;

                  return (
                    <button
                      key={s}
                      onClick={() => setLocalStatus(s)}
                      className={`px-2 py-2 rounded-xl text-xs font-semibold border-2 transition-all flex items-center justify-center gap-1 ${
                        active
                          ? `${cfg.cls} border-current`
                          : 'border-gray-100 text-gray-500 hover:border-gray-300 bg-white'
                      }`}
                    >
                      {active && <Check size={10} />}
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-gray-700 mb-2">حالة الدفع</h3>
              <div className="flex gap-2 flex-wrap">
                {['مدفوع', 'معلق', 'مرتجع', 'فاشل'].map((ps) => (
                  <button
                    key={ps}
                    onClick={() => setLocalPayStatus(ps)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all ${
                      localPayStatus === ps
                        ? `${paymentStatusConfig[ps] ?? 'bg-gray-100 text-gray-500'} border-current`
                        : 'border-gray-100 text-gray-500 hover:border-gray-200 bg-white'
                    }`}
                  >
                    {ps}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-indigo-50 rounded-2xl p-4">
              <h3 className="text-sm font-bold text-indigo-800 mb-3 flex items-center gap-2">
                <Truck size={14} />
                بيانات الشحن
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600 font-semibold block mb-1.5">شركة الشحن</label>
                  <select
                    value={shippingCoId}
                    onChange={(e) => setShippingCoId(e.target.value)}
                    className="input-field text-sm py-2 h-auto"
                  >
                    <option value="">اختر شركة الشحن</option>
                    {shippingCos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-600 font-semibold block mb-1.5">رقم التتبع</label>
                  <input
                    value={trackingNum}
                    onChange={(e) => setTrackingNum(e.target.value)}
                    className="input-field text-sm py-2 h-auto"
                    placeholder="EG123456789"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">ملاحظات</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input-field resize-none"
                rows={2}
                placeholder="ملاحظات إضافية على الطلب..."
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-3xl">
          <button
            onClick={() => toast.success('تم إرسال طلب الطباعة')}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <Printer size={14} />
            طباعة الفاتورة
          </button>

          <button
            onClick={() => toast.info('إنشاء بوليصة الشحن')}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <Truck size={14} />
            بوليصة الشحن
          </button>

          <button
            onClick={handleSave}
            disabled={updateMutation.isPending || !order}
            className="btn-primary mr-auto flex items-center gap-2 disabled:opacity-60"
          >
            {updateMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            {updateMutation.isPending ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
/* Main Page */
/* ════════════════════════════════════════════════════════════ */
export default function Orders() {
  const qc = useQueryClient();
  const { selectedCountry, currencySymbol } = useCountry();

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('الكل');
  const [filterPayStatus, setFilterPayStatus] = useState('الكل');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  /* ── Quick period helpers ── */
  const applyPeriod = (p: 'اليوم' | 'أمس' | 'هذا الأسبوع' | 'هذا الشهر' | 'يوم محدد', specificDay?: string) => {
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    if (p === 'اليوم') { setDateFrom(fmt(now)); setDateTo(fmt(now)); }
    else if (p === 'أمس') { const y = new Date(now); y.setDate(y.getDate() - 1); setDateFrom(fmt(y)); setDateTo(fmt(y)); }
    else if (p === 'هذا الأسبوع') {
      const start = new Date(now); start.setDate(now.getDate() - now.getDay());
      setDateFrom(fmt(start)); setDateTo(fmt(now));
    }
    else if (p === 'هذا الشهر') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateFrom(fmt(start)); setDateTo(fmt(now));
    }
    else if (p === 'يوم محدد' && specificDay) { setDateFrom(specificDay); setDateTo(specificDay); }
  };
  const [specificDay, setSpecificDay] = useState('');
  const [showDayPicker, setShowDayPicker] = useState(false);

  const filters: OrderFilters = {
    status: filterStatus,
    paymentStatus: filterPayStatus,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };

  const { data: orders = [], isLoading, isError } = useOrders(filters);

  const filtered = orders.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();

    return (
      o.id.toLowerCase().includes(q) ||
      (o.profiles?.full_name ?? '').toLowerCase().includes(q) ||
      (o.profiles?.phone ?? '').includes(q) ||
      (o.shipping_address?.phone ?? '').includes(q) ||
      (o.shipping_address?.city ?? '').toLowerCase().includes(q) ||
      (o.shipping_address?.governorate ?? '').toLowerCase().includes(q)
    );
  });

  // Cancelled/returned orders generated no real revenue — every other
  // revenue figure in the dashboard (Analytics, Home) already excludes
  // them; this card was the one place still summing every visible row,
  // so selecting "الكل" counted a voided order's price as a sale.
  const totalRevenue = filtered
    .filter((o) => o.status !== 'ملغي' && o.status !== 'مرتجع')
    .reduce((s, o) => s + o.total_price, 0);
  const delivered = filtered.filter((o) => o.status === 'تم التوصيل').length;
  const pending = filtered.filter((o) => ['جديد', 'قيد المراجعة', 'تم التأكيد'].includes(o.status)).length;
  const inTransit = filtered.filter((o) => o.status === 'جاري الشحن').length;

  const statusCounts = ALL_STATUSES.reduce((acc, s) => {
    acc[s] = orders.filter((o) => o.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  const currency = orders[0]?.countries?.currency_symbol ?? currencySymbol ?? 'ج.م';

  return (
    <Layout>
      <div className="fade-in">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="section-title">إدارة الطلبات</h1>
            <p className="section-subtitle">
              متابعة الطلبات وحالاتها وتفاصيلها — {selectedCountry?.name ? `طلبات ${selectedCountry.name}` : 'بيانات حقيقية من Supabase'}
            </p>
            <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-xl bg-blue-50 text-blue-700">
              <MapPin size={12} />
              {selectedCountry?.name ?? 'كل الدول'} · {currency}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => { qc.invalidateQueries({ queryKey: ['orders'] }); toast.info('جارٍ التحديث...'); }}
              className="p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 transition-colors"
              title="تحديث"
            >
              <RefreshCw size={16} />
            </button>

            {/* ── Export CSV ── */}
            <button onClick={() => exportOrdersCsv(filtered)} className="btn-secondary flex items-center gap-1.5 text-sm">
              <Download size={14} /> CSV
            </button>

            {/* ── Export Excel ── */}
            <button
              onClick={() => {
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.aoa_to_sheet([
                  ['رقم الطلب', 'العميل', 'الحالة', 'حالة الدفع', `الإجمالي (${currency})`, 'المدينة', 'التاريخ'],
                  ...filtered.map((o) => [
                    o.id.slice(0, 8),
                    o.profiles?.full_name ?? '—',
                    o.status,
                    o.payment_status,
                    o.total_price,
                    o.shipping_address?.city ?? o.shipping_address?.governorate ?? '—',
                    new Date(o.created_at).toLocaleDateString('ar-EG'),
                  ]),
                ]);
                ws['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 }];
                XLSX.utils.book_append_sheet(wb, ws, 'الطلبات');
                XLSX.writeFile(wb, `طلبات-دار-الفتح-${new Date().toISOString().slice(0, 10)}.xlsx`);
                toast.success('تم تصدير Excel');
              }}
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <Download size={14} /> Excel
            </button>

            {/* ── Export PDF ── */}
            <button
              onClick={() => {
                const pw = window.open('', '_blank', 'width=900,height=700');
                if (!pw) { toast.error('يرجى السماح بالنوافذ المنبثقة'); return; }
                const rows = filtered.map((o) => `
                  <tr>
                    <td>${o.id.slice(0, 8)}</td>
                    <td>${escapeHtml(o.profiles?.full_name ?? '—')}</td>
                    <td>${escapeHtml(o.status)}</td>
                    <td>${escapeHtml(o.payment_status)}</td>
                    <td>${o.total_price.toLocaleString()} ${currency}</td>
                    <td>${escapeHtml(o.shipping_address?.city ?? o.shipping_address?.governorate ?? '—')}</td>
                    <td>${new Date(o.created_at).toLocaleDateString('ar-EG')}</td>
                  </tr>`).join('');
                pw.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"/>
                  <title>تقرير الطلبات</title>
                  <style>
                    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
                    *{margin:0;padding:0;box-sizing:border-box}
                    body{font-family:'Cairo',Arial,sans-serif;direction:rtl;padding:24px;font-size:12px;color:#1e293b}
                    h1{font-size:18px;font-weight:900;color:#1d4ed8;margin-bottom:4px}
                    .meta{color:#64748b;font-size:11px;margin-bottom:16px}
                    table{width:100%;border-collapse:collapse}
                    th{background:#1d4ed8;color:#fff;padding:8px;text-align:right;font-size:11px}
                    td{padding:7px 8px;border-bottom:1px solid #f1f5f9;font-size:11px}
                    tr:nth-child(even) td{background:#f8fafc}
                    @media print{body{padding:12px}}
                  </style></head><body>
                  <h1>تقرير الطلبات — دار الفتح</h1>
                  <p class="meta">إجمالي الطلبات: ${filtered.length} · الإيرادات: ${totalRevenue.toLocaleString()} ${currency} · ${selectedCountry?.name ?? 'كل الدول'} · ${new Date().toLocaleDateString('ar-EG')}</p>
                  <table>
                    <tr><th>رقم الطلب</th><th>العميل</th><th>الحالة</th><th>حالة الدفع</th><th>الإجمالي</th><th>المدينة</th><th>التاريخ</th></tr>
                    ${rows}
                  </table>
                  <script>setTimeout(()=>window.print(),600);<\/script></body></html>`);
                pw.document.close();
                toast.success('جارٍ فتح نافذة الطباعة — اختر "حفظ كـ PDF"');
              }}
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <Download size={14} /> PDF
            </button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-5 flex-nowrap">
          <button
            onClick={() => setFilterStatus('الكل')}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              filterStatus === 'الكل'
                ? 'bg-blue-700 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100 shadow-sm'
            }`}
          >
            الكل ({orders.length})
          </button>

          {ALL_STATUSES.map((s) => {
            const cfg = statusConfig[s];
            const count = statusCounts[s] || 0;

            return (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  filterStatus === s
                    ? `${cfg.cls} ring-2 ${cfg.ring}`
                    : 'bg-white text-gray-600 hover:bg-gray-100 shadow-sm'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                {s}
                {count > 0 && <span className="font-bold">({count})</span>}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'إجمالي الطلبات', value: isLoading ? '—' : filtered.length.toLocaleString(), color: 'text-blue-700', bg: 'bg-blue-50' },
            { label: 'تم التوصيل', value: isLoading ? '—' : delivered.toLocaleString(), color: 'text-green-700', bg: 'bg-green-50' },
            { label: 'قيد الانتظار', value: isLoading ? '—' : pending.toLocaleString(), color: 'text-amber-700', bg: 'bg-amber-50' },
            { label: 'إجمالي المبيعات', value: isLoading ? '—' : `${totalRevenue.toLocaleString()} ${currency}`, color: 'text-indigo-700', bg: 'bg-indigo-50' },
          ].map((s, i) => (
            <div key={i} className={`${s.bg} rounded-2xl p-4 text-center`}>
              {isLoading ? (
                <div className="h-7 bg-white/50 rounded-lg animate-pulse mx-auto w-16 mb-1" />
              ) : (
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="ابحث برقم الطلب، اسم العميل، الهاتف، المحافظة..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field pr-10"
              />
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>

            <select
              value={filterPayStatus}
              onChange={(e) => setFilterPayStatus(e.target.value)}
              className="input-field md:w-40"
            >
              <option value="الكل">كل حالات الدفع</option>
              <option>مدفوع</option>
              <option>معلق</option>
              <option>مرتجع</option>
              <option>فاشل</option>
            </select>

            <button
              onClick={() => setShowFilters((f) => !f)}
              className="btn-secondary flex items-center gap-1.5 text-sm flex-shrink-0"
            >
              <Calendar size={14} />
              فلتر التاريخ
              {showFilters ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>

          {showFilters && (
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
              {/* Quick period buttons */}
              <div className="flex flex-wrap gap-2">
                {(['اليوم', 'أمس', 'هذا الأسبوع', 'هذا الشهر'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => applyPeriod(p)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setShowDayPicker((v) => !v)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-1"
                >
                  <Calendar size={11} /> يوم محدد
                </button>
                {showDayPicker && (
                  <input
                    type="date"
                    value={specificDay}
                    onChange={(e) => { setSpecificDay(e.target.value); applyPeriod('يوم محدد', e.target.value); }}
                    className="input-field text-xs py-1 h-auto w-36"
                  />
                )}
              </div>

              {/* Date range inputs */}
              <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">من تاريخ</label>
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-field" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">إلى تاريخ</label>
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-field" />
                </div>
                <button
                  onClick={() => { setDateFrom(''); setDateTo(''); setSpecificDay(''); setShowDayPicker(false); }}
                  className="btn-secondary text-sm self-end flex-shrink-0 flex items-center gap-1.5"
                >
                  <X size={13} /> إعادة تعيين
                </button>
              </div>
            </div>
          )}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
            <Loader2 size={26} className="animate-spin" />
            <span>جارٍ تحميل الطلبات...</span>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-red-400">
            <AlertCircle size={32} />
            <span>تعذّر تحميل الطلبات</span>
          </div>
        )}

        {!isLoading && !isError && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-gray-500">{filtered.length} طلب</p>
              {inTransit > 0 && (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-xl">
                  <Truck size={12} />
                  {inTransit} طلب جاري الشحن
                </span>
              )}
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Package size={40} className="text-gray-200 mx-auto mb-3" />
                <p className="font-semibold text-gray-500">لا توجد طلبات</p>
                <p className="text-sm mt-1">لم يسجل أي طلب لهذه الدولة بعد</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="table-header">
                      <th className="text-right px-4 py-3 font-semibold">رقم الطلب</th>
                      <th className="text-right px-4 py-3 font-semibold">العميل</th>
                      <th className="text-right px-4 py-3 font-semibold">العنوان</th>
                      <th className="text-right px-4 py-3 font-semibold">المنتجات</th>
                      <th className="text-right px-4 py-3 font-semibold">الإجمالي</th>
                      <th className="text-right px-4 py-3 font-semibold">الدفع</th>
                      <th className="text-right px-4 py-3 font-semibold">الشحن</th>
                      <th className="text-right px-4 py-3 font-semibold">الحالة</th>
                      <th className="text-right px-4 py-3 font-semibold">التاريخ</th>
                      <th className="text-right px-4 py-3 font-semibold">إجراء</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filtered.map((order) => {
                      const sc = statusConfig[order.status] ?? statusConfig['جديد'];
                      const psc = paymentStatusConfig[order.payment_status] ?? 'bg-gray-100 text-gray-500';
                      const customerName = order.profiles?.full_name ?? order.shipping_address?.name ?? 'زائر';
                      const customerPhone = order.shipping_address?.phone ?? order.profiles?.phone ?? '';
                      const location = [order.shipping_address?.governorate, order.shipping_address?.city]
                        .filter(Boolean)
                        .join(' — ');

                      return (
                        <tr key={order.id} className="table-row">
                          <td className="px-4 py-3">
                            <span className="text-sm font-bold text-blue-700 font-mono">{order.id}</span>
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {order.profiles?.avatar_url ? (
                                <img
                                  src={order.profiles.avatar_url}
                                  alt={customerName}
                                  className="w-8 h-8 rounded-full flex-shrink-0 object-cover"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                  <span className="text-blue-700 text-xs font-bold">{customerName.charAt(0)}</span>
                                </div>
                              )}

                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-800 truncate">{customerName}</p>
                                {customerPhone && (
                                  <p className="text-xs text-gray-400" dir="ltr">{customerPhone}</p>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3 text-sm text-gray-500">
                            {location ? (
                              <span className="flex items-center gap-1">
                                <MapPin size={11} className="flex-shrink-0 text-gray-400" />
                                {location}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>

                          <td className="px-4 py-3 text-sm text-gray-500 max-w-[240px]">
                            {(() => {
                              const items = order.order_items ?? [];
                              if (items.length === 0) {
                                return <span className="text-xs text-gray-300">—</span>;
                              }
                              const units = items.reduce((s, it) => s + (it.quantity ?? 0), 0);
                              return (
                                <button
                                  onClick={() => setSelectedOrderId(order.id)}
                                  className="text-right w-full group"
                                  title="عرض تفاصيل الطلب"
                                >
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 rounded-lg px-1.5 py-0.5 mb-1">
                                    <Package size={10} />
                                    {items.length} كتاب · {units} نسخة
                                  </span>
                                  <ul className="space-y-0.5">
                                    {items.slice(0, 3).map((it) => (
                                      <li
                                        key={it.id}
                                        className="text-xs text-gray-600 truncate group-hover:text-blue-700"
                                      >
                                        {it.products?.title ?? 'كتاب محذوف'}
                                        {it.quantity > 1 && (
                                          <span className="text-gray-400"> ×{it.quantity}</span>
                                        )}
                                      </li>
                                    ))}
                                    {items.length > 3 && (
                                      <li className="text-[11px] text-blue-600 font-semibold">
                                        + {items.length - 3} أخرى
                                      </li>
                                    )}
                                  </ul>
                                </button>
                              );
                            })()}
                          </td>

                          <td className="px-4 py-3">
                            <p className="text-sm font-bold text-gray-800">
                              {order.total_price.toLocaleString()} {order.countries?.currency_symbol ?? currency}
                            </p>
                            {order.discount_amount > 0 && (
                              <p className="text-xs text-red-400">خصم: {order.discount_amount.toLocaleString()}</p>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <div className="space-y-1">
                              <span className="text-xs text-gray-500 block truncate max-w-[100px]">
                                {order.payment_methods?.method_name ?? '—'}
                              </span>
                              <span className={`status-badge text-xs ${psc}`}>
                                {order.payment_status}
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <div className="text-xs">
                              <p className="text-gray-600 font-semibold">{order.shipping_companies?.company_name ?? '—'}</p>
                              {order.tracking_number && (
                                <p className="text-indigo-600 font-mono flex items-center gap-0.5 mt-0.5">
                                  <Hash size={9} />
                                  {order.tracking_number}
                                </p>
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sc.dot}`} />
                              <span className={`status-badge text-xs ${sc.cls}`}>{order.status}</span>
                            </div>
                          </td>

                          <td className="px-4 py-3 text-xs text-gray-400">{formatDate(order.created_at)}</td>

                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setSelectedOrderId(order.id)}
                                className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600"
                                title="عرض التفاصيل"
                              >
                                <Eye size={14} />
                              </button>

                              <button
                                onClick={() => toast.info(`إرسال واتساب لـ ${customerName}`)}
                                className="p-1.5 rounded-lg hover:bg-green-50 text-green-600"
                                title="واتساب"
                              >
                                <MessageCircle size={14} />
                              </button>

                              <button
                                onClick={() => toast.success('جارٍ إعداد الفاتورة...')}
                                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                                title="طباعة الفاتورة"
                              >
                                <Printer size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedOrderId && (
        <OrderDetailModal
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
        />
      )}
    </Layout>
  );
}