import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/layout/Layout';
import {
  Truck,
  MapPin,
  Package,
  CheckCircle,
  Clock,
  Search,
  Download,
  Printer,
  Plus,
  Eye,
  X,
  RefreshCw,
  Loader2,
  AlertCircle,
  Globe2,
  CreditCard,
  Save,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useCountry } from '@/contexts/CountryContext';
import { useStoreSettings, useUpsertStoreSettings } from '@/hooks/useSettings';
import {
  useShippingStats,
  useShipmentDetail,
  useShippingCompaniesForShipping,
  usePaymentMethodsForShipping,
  useCreateShipment,
  useUpdateShipment,
  exportShippingCsv,
  type ShipmentOrder,
  type ShipmentStatus,
} from '@/hooks/useShipping';

/* ────────────────────────────────────────────── */
/* Config */
/* ────────────────────────────────────────────── */

const STATUS_STEPS = [
  { key: 'جديد', label: 'تم استلام الطلب' },
  { key: 'تم التأكيد', label: 'تم التأكيد والتجهيز' },
  { key: 'جاري الشحن', label: 'تم تسليم الشحنة' },
  { key: 'تم الشحن', label: 'في مركز الفرز' },
  { key: 'تم التوصيل', label: 'تم التوصيل' },
] as const;

const STATUS_FLOW: ShipmentStatus[] = [
  'جديد',
  'قيد المراجعة',
  'تم التأكيد',
  'جاري الشحن',
  'تم الشحن',
  'تم التوصيل',
];

const statusCfg: Record<string, string> = {
  جديد: 'bg-cyan-100 text-cyan-700',
  'قيد المراجعة': 'bg-yellow-100 text-yellow-700',
  'تم التأكيد': 'bg-blue-100 text-blue-700',
  'جاري الشحن': 'bg-indigo-100 text-indigo-700',
  'تم الشحن': 'bg-violet-100 text-violet-700',
  'تم التوصيل': 'bg-green-100 text-green-700',
  ملغي: 'bg-red-100 text-red-500',
  مرتجع: 'bg-orange-100 text-orange-600',
};

interface ShipmentFormData {
  orderId: string;
  companyId: string;
  trackingNumber: string;
  weight: string;
  dimensions: string;
  shippingCost: string;
  notes: string;
}

const emptyShipForm: ShipmentFormData = {
  orderId: '',
  companyId: '',
  trackingNumber: '',
  weight: '',
  dimensions: '',
  shippingCost: '',
  notes: '',
};

function getStepDone(order: ShipmentOrder, stepKey: string): boolean {
  const statusIndex = STATUS_FLOW.indexOf(order.status as ShipmentStatus);
  const stepIndex = STATUS_FLOW.indexOf(stepKey as ShipmentStatus);
  return stepIndex <= statusIndex && statusIndex !== -1 && stepIndex !== -1;
}

function composeNotes(notes: string, weight: string, dimensions: string) {
  const chunks = [
    notes?.trim(),
    weight?.trim() ? `الوزن: ${weight} كجم` : '',
    dimensions?.trim() ? `الأبعاد: ${dimensions}` : '',
  ].filter(Boolean);

  return chunks.join(' | ');
}

export default function Shipping() {
  const qc = useQueryClient();
  const { selectedCountry, currencySymbol } = useCountry();

  // ── Shipping settings (global) ─────────────────────────────
  const { data: storeSettings } = useStoreSettings();
  const upsertStoreSettings = useUpsertStoreSettings();
  const [shippingCost, setShippingCost] = useState<string>('');
  const [freeShipThreshold, setFreeShipThreshold] = useState<string>('');

  useEffect(() => {
    if (storeSettings) {
      setShippingCost(String(storeSettings.default_shipping_cost ?? 45));
      setFreeShipThreshold(String(storeSettings.free_shipping_threshold ?? 499));
    }
  }, [storeSettings]);

  const handleSaveShippingSettings = async () => {
    const cost = Number(shippingCost);
    const threshold = Number(freeShipThreshold);

    if (!Number.isFinite(cost) || cost < 0) {
      toast.error('سعر الشحن يجب أن يكون رقماً موجباً');
      return;
    }
    if (!Number.isFinite(threshold) || threshold < 0) {
      toast.error('الحد الأدنى للشحن المجاني يجب أن يكون رقماً موجباً');
      return;
    }

    try {
      await upsertStoreSettings.mutateAsync({
        default_shipping_cost: cost,
        free_shipping_threshold: threshold,
      });
      toast.success('تم حفظ إعدادات الشحن');
    } catch (err) {
      toast.error('فشل حفظ الإعدادات: ' + (err instanceof Error ? err.message : 'خطأ غير معروف'));
    }
  };

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('الكل');
  const [filterCompanyId, setFilterCompanyId] = useState('الكل');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [shipForm, setShipForm] = useState<ShipmentFormData>(emptyShipForm);

  const shippingFilters = {
    status: filterStatus,
    companyId: filterCompanyId,
    search,
  };

  const {
    data: orders = [],
    isLoading,
    isError,
    stats,
  } = useShippingStats(shippingFilters);

  const { data: selectedOrder, isLoading: detailLoading } = useShipmentDetail(selectedOrderId);
  const { data: shippingCompanies = [] } = useShippingCompaniesForShipping();
  const { data: paymentMethods = [] } = usePaymentMethodsForShipping();

  const createShipmentMutation = useCreateShipment();
  const updateShipmentMutation = useUpdateShipment();

  const confirmedOrders = useMemo(
    () => orders.filter((o) => o.status === 'تم التأكيد'),
    [orders]
  );

  const selectedCompanyName = useMemo(() => {
    return shippingCompanies.find((c) => c.id === filterCompanyId)?.company_name ?? 'الكل';
  }, [filterCompanyId, shippingCompanies]);

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ['shipping-orders'] });
    qc.invalidateQueries({ queryKey: ['shipment-detail'] });
    qc.invalidateQueries({ queryKey: ['orders'] });
    toast.info('جارٍ تحديث بيانات الشحن...');
  };

  const handleCreateShipment = async () => {
    if (!shipForm.orderId || !shipForm.companyId || !shipForm.trackingNumber.trim()) {
      toast.error('يرجى اختيار الطلب والشركة وكتابة رقم التتبع');
      return;
    }

    await createShipmentMutation.mutateAsync({
      orderId: shipForm.orderId,
      shipping_company_id: shipForm.companyId,
      tracking_number: shipForm.trackingNumber.trim(),
      shipping_cost: shipForm.shippingCost ? parseFloat(shipForm.shippingCost) : undefined,
      notes: composeNotes(shipForm.notes, shipForm.weight, shipForm.dimensions),
      status: 'جاري الشحن',
    });

    setSelectedOrderId(shipForm.orderId);
    setShowCreateModal(false);
    setShipForm(emptyShipForm);
  };

  const handleUpdateStatus = async (status: ShipmentStatus) => {
    if (!selectedOrder) return;

    await updateShipmentMutation.mutateAsync({
      orderId: selectedOrder.id,
      status,
    });
  };

  const handleUpdateCompany = async (shipping_company_id: string) => {
    if (!selectedOrder) return;

    await updateShipmentMutation.mutateAsync({
      orderId: selectedOrder.id,
      shipping_company_id: shipping_company_id || null,
    });
  };

  const handlePrintShipment = () => {
    if (!selectedOrder) {
      toast.error('اختر طلبًا أولًا');
      return;
    }
    toast.success(`تم تجهيز بوليصة الشحن للطلب ${selectedOrder.id}`);
  };

  return (
    <Layout>
      <div className="fade-in" dir="rtl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="section-title">إدارة الشحن</h1>
            <p className="section-subtitle">
              إدارة شركات الشحن وتتبع التوصيل — {selectedCountry?.name ? `شحن ${selectedCountry.name}` : 'البيانات الحالية'}
            </p>

            <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-xl bg-blue-50 text-blue-700">
              <Globe2 size={12} />
              {selectedCountry?.name ?? 'كل الدول'} · {currencySymbol}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleRefresh}
              className="p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 transition-colors"
              title="تحديث"
            >
              <RefreshCw size={16} />
            </button>

            <button
              onClick={() => {
                exportShippingCsv(orders);
                toast.success('تم تصدير قائمة الشحن');
              }}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <Download size={14} />
              تصدير
            </button>

            <button
              onClick={handlePrintShipment}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <Printer size={14} />
              طباعة الملصقات
            </button>

            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus size={15} />
              إنشاء شحنة
            </button>
          </div>
        </div>

        {/* ── إعدادات الشحن العامة ───────────────────────────────── */}
        <div className="bg-white rounded-2xl p-5 shadow-sm mb-6 border border-blue-100">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-xl bg-blue-50">
              <Truck size={18} className="text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-800">إعدادات الشحن العامة</h3>
              <p className="text-xs text-gray-500">هذه القيم تظهر تلقائياً للعملاء في صفحة الدفع</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                سعر الشحن الافتراضي ({currencySymbol})
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={shippingCost}
                onChange={(e) => setShippingCost(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none text-sm"
                placeholder="45"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                الحد الأدنى للشحن المجاني ({currencySymbol})
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={freeShipThreshold}
                onChange={(e) => setFreeShipThreshold(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none text-sm"
                placeholder="499"
              />
              <p className="text-[10px] text-gray-400 mt-1">ضع 0 لإلغاء الشحن المجاني التلقائي</p>
            </div>

            <div className="flex items-end">
              <button
                onClick={handleSaveShippingSettings}
                disabled={upsertStoreSettings.isPending}
                className="btn-primary flex items-center gap-2 w-full justify-center"
              >
                {upsertStoreSettings.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                حفظ
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            {
              label: 'جاهزة للشحن',
              value: stats.pending,
              icon: <Package size={18} className="text-blue-600" />,
              bg: 'bg-blue-50',
              color: 'text-blue-700',
            },
            {
              label: 'في الطريق',
              value: stats.inTransit,
              icon: <Truck size={18} className="text-indigo-600" />,
              bg: 'bg-indigo-50',
              color: 'text-indigo-700',
            },
            {
              label: 'تم التوصيل',
              value: stats.delivered,
              icon: <CheckCircle size={18} className="text-green-600" />,
              bg: 'bg-green-50',
              color: 'text-green-700',
            },
            {
              label: 'مرتجعة',
              value: stats.returned,
              icon: <RefreshCw size={18} className="text-orange-600" />,
              bg: 'bg-orange-50',
              color: 'text-orange-700',
            },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 ${s.bg} rounded-xl flex items-center justify-center`}>
                  {s.icon}
                </div>
                <div>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-sm text-gray-500">{s.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Shipping Companies */}
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-6">
          <h3 className="font-bold text-gray-800 mb-4">شركات الشحن المتاحة</h3>

          {shippingCompanies.length === 0 ? (
            <div className="text-sm text-gray-400">لا توجد شركات شحن مفعلة لهذه الدولة</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
              {shippingCompanies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setFilterCompanyId(c.id)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                    filterCompanyId === c.id
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    {c.logo_url ? (
                      <img src={c.logo_url} alt={c.company_name} className="w-6 h-6 object-contain" />
                    ) : (
                      <Truck size={18} className="text-blue-600" />
                    )}
                  </div>
                  <span className="text-xs font-semibold text-gray-700 text-center">
                    {c.company_name}
                  </span>
                </button>
              ))}
            </div>
          )}

          {paymentMethods.length > 0 && (
            <>
              <h4 className="font-semibold text-gray-700 mt-5 mb-3 flex items-center gap-2">
                <CreditCard size={14} className="text-gray-500" />
                طرق الدفع المتاحة في الدولة الحالية
              </h4>

              <div className="flex flex-wrap gap-2">
                {paymentMethods.map((m) => (
                  <span
                    key={m.id}
                    className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-100 text-gray-600"
                  >
                    {m.method_name}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="ابحث برقم الطلب، العميل، الهاتف، المدينة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pr-10"
            />
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field md:w-44"
          >
            <option>الكل</option>
            {['جديد', 'قيد المراجعة', 'تم التأكيد', 'جاري الشحن', 'تم الشحن', 'تم التوصيل', 'ملغي', 'مرتجع'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>

          <select
            value={filterCompanyId}
            onChange={(e) => setFilterCompanyId(e.target.value)}
            className="input-field md:w-44"
          >
            <option value="الكل">كل الشركات</option>
            {shippingCompanies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}
              </option>
            ))}
          </select>
        </div>

        {(filterCompanyId !== 'الكل' || filterStatus !== 'الكل' || search) && (
          <div className="mb-4 flex flex-wrap gap-2 text-xs">
            {filterCompanyId !== 'الكل' && (
              <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold">
                الشركة: {selectedCompanyName}
              </span>
            )}
            {filterStatus !== 'الكل' && (
              <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-700 font-semibold">
                الحالة: {filterStatus}
              </span>
            )}
            {search && (
              <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-600 font-semibold">
                البحث: {search}
              </span>
            )}
          </div>
        )}

        {/* Loading / Error */}
        {isLoading && (
          <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
            <Loader2 size={26} className="animate-spin" />
            <span>جارٍ تحميل بيانات الشحن...</span>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-red-400">
            <AlertCircle size={30} />
            <span>تعذّر تحميل بيانات الشحن</span>
          </div>
        )}

        {/* Main Grid */}
        {!isLoading && !isError && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Orders List */}
            <div className="lg:col-span-2 space-y-3">
              {orders.length === 0 && (
                <div className="text-center py-12 bg-white rounded-2xl shadow-sm text-gray-400">
                  لا توجد شحنات لهذه الدولة
                </div>
              )}

              {orders.map((order) => (
                <div
                  key={order.id}
                  onClick={() => setSelectedOrderId(order.id)}
                  className={`bg-white rounded-2xl p-5 shadow-sm card-hover cursor-pointer transition-all ${
                    selectedOrderId === order.id ? 'ring-2 ring-blue-500' : ''
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {order.customerAvatar ? (
                        <img
                          src={order.customerAvatar}
                          alt={order.customer}
                          className="w-10 h-10 rounded-full flex-shrink-0 object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-blue-700 text-sm font-bold">
                            {order.customer.charAt(0)}
                          </span>
                        </div>
                      )}

                      <div>
                        <p className="font-bold text-gray-800 text-sm">{order.id}</p>
                        <p className="text-xs text-gray-500">{order.customer}</p>
                        {order.customerPhone && (
                          <p className="text-[11px] text-gray-400" dir="ltr">
                            {order.customerPhone}
                          </p>
                        )}
                      </div>
                    </div>

                    <span className={`status-badge text-xs ${statusCfg[order.status] || 'bg-gray-100 text-gray-500'}`}>
                      {order.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                    <span className="flex items-center gap-1">
                      <MapPin size={12} />
                      {order.city || order.governorate || '—'}
                    </span>

                    <span className="flex items-center gap-1">
                      <Truck size={12} />
                      {order.shippingCompany || 'لم يُحدد'}
                    </span>

                    {order.tracking_number && (
                      <span className="font-mono text-indigo-600">{order.tracking_number}</span>
                    )}

                    <span className="mr-auto font-bold text-gray-800">
                      {order.total.toLocaleString()} {order.currencySymbol}
                    </span>
                  </div>

                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedOrderId(order.id);
                        toast.info(`عرض تتبع الطلب ${order.id}`);
                      }}
                      className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                    >
                      <Eye size={11} />
                      تتبع
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toast.success(`تم تجهيز بوليصة الطلب ${order.id}`);
                      }}
                      className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                    >
                      <Printer size={11} />
                      طباعة بوليصة
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Tracking Panel */}
            <div className="bg-white rounded-2xl p-6 shadow-sm h-fit sticky top-4">
              {selectedOrderId ? (
                detailLoading ? (
                  <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
                    <Loader2 size={20} className="animate-spin" />
                    <span className="text-sm">جارٍ تحميل تفاصيل الشحنة...</span>
                  </div>
                ) : selectedOrder ? (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-gray-800">تتبع الشحنة</h3>
                      <button
                        onClick={() => setSelectedOrderId(null)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <div className="bg-gray-50 rounded-xl p-3 mb-4">
                      <p className="text-xs text-gray-500">الطلب</p>
                      <p className="font-bold text-blue-700">{selectedOrder.id}</p>
                      <p className="text-sm text-gray-700 mt-0.5">{selectedOrder.customer}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {selectedOrder.countryName || selectedCountry?.name}
                      </p>
                      {selectedOrder.tracking_number && (
                        <p className="text-xs font-mono text-indigo-600 mt-1">
                          {selectedOrder.tracking_number}
                        </p>
                      )}
                    </div>

                    <div className="relative">
                      <div className="absolute right-3.5 top-3.5 bottom-3.5 w-0.5 bg-gray-100" />
                      <div className="space-y-5">
                        {STATUS_STEPS.map((step, i) => {
                          const done = getStepDone(selectedOrder, step.key);
                          const isActive = selectedOrder.status === step.key;

                          return (
                            <div key={i} className="flex items-center gap-4 relative">
                              <div
                                className={`w-7 h-7 rounded-full border-2 flex items-center justify-center z-10 flex-shrink-0 transition-all ${
                                  done
                                    ? 'bg-blue-600 border-blue-600'
                                    : isActive
                                    ? 'bg-amber-400 border-amber-400'
                                    : 'bg-white border-gray-200'
                                }`}
                              >
                                {done ? (
                                  <CheckCircle size={14} className="text-white" />
                                ) : (
                                  <Clock size={14} className={isActive ? 'text-white' : 'text-gray-300'} />
                                )}
                              </div>

                              <p
                                className={`text-sm ${
                                  done
                                    ? 'font-semibold text-gray-800'
                                    : isActive
                                    ? 'font-semibold text-amber-600'
                                    : 'text-gray-400'
                                }`}
                              >
                                {step.label}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-5 pt-4 border-t border-gray-100">
                      <label className="block text-xs font-semibold text-gray-600 mb-2">
                        تحديث الحالة
                      </label>
                      <select
                        value={selectedOrder.status}
                        onChange={(e) => handleUpdateStatus(e.target.value as ShipmentStatus)}
                        className="input-field text-sm py-2 h-auto mb-3"
                        disabled={updateShipmentMutation.isPending}
                      >
                        {['جديد', 'قيد المراجعة', 'تم التأكيد', 'جاري الشحن', 'تم الشحن', 'تم التوصيل', 'مرتجع', 'ملغي'].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>

                      <label className="block text-xs font-semibold text-gray-600 mb-2">
                        شركة الشحن
                      </label>
                      <select
                        value={selectedOrder.shipping_company_id ?? ''}
                        onChange={(e) => handleUpdateCompany(e.target.value)}
                        className="input-field text-sm py-2 h-auto mb-3"
                        disabled={updateShipmentMutation.isPending}
                      >
                        <option value="">اختر الشركة</option>
                        {shippingCompanies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.company_name}
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={() => toast.info('يمكنك تحديد تكلفة الشحن أثناء إنشاء الشحنة أو من لوحة الطلبات')}
                        className="btn-secondary w-full text-sm flex items-center justify-center gap-2 mb-2"
                      >
                        <Truck size={13} />
                        حساب سعر الشحن
                      </button>

                      <button
                        onClick={handlePrintShipment}
                        className="btn-primary w-full text-sm flex items-center justify-center gap-2"
                      >
                        <Printer size={13} />
                        طباعة بوليصة الشحن
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-12">
                    <AlertCircle size={40} className="text-gray-200 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 font-semibold">لم يتم العثور على الطلب</p>
                  </div>
                )
              ) : (
                <div className="text-center py-12">
                  <Truck size={48} className="text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 font-semibold">اختر طلبًا</p>
                  <p className="text-xs text-gray-400 mt-1">
                    لعرض تفاصيل التتبع وتحديث الحالة
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Shipment Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Truck size={18} className="text-blue-700" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-800">إنشاء شحنة جديدة</h2>
                  <p className="text-xs text-gray-400">سيتم إنشاء الشحنة داخل الدولة الحالية</p>
                </div>
              </div>

              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    رقم الطلب <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={shipForm.orderId}
                    onChange={(e) => setShipForm((f) => ({ ...f, orderId: e.target.value }))}
                    className="input-field"
                  >
                    <option value="">اختر الطلب</option>
                    {confirmedOrders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.id} — {o.customer}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    شركة الشحن
                  </label>
                  <select
                    value={shipForm.companyId}
                    onChange={(e) => setShipForm((f) => ({ ...f, companyId: e.target.value }))}
                    className="input-field"
                  >
                    <option value="">اختر الشركة</option>
                    {shippingCompanies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  رقم التتبع <span className="text-red-500">*</span>
                </label>
                <input
                  value={shipForm.trackingNumber}
                  onChange={(e) => setShipForm((f) => ({ ...f, trackingNumber: e.target.value }))}
                  className="input-field font-mono"
                  placeholder="SA123456789"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    الوزن (كجم)
                  </label>
                  <input
                    type="number"
                    value={shipForm.weight}
                    onChange={(e) => setShipForm((f) => ({ ...f, weight: e.target.value }))}
                    className="input-field text-sm py-2 h-auto"
                    placeholder="1.5"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    الأبعاد
                  </label>
                  <input
                    value={shipForm.dimensions}
                    onChange={(e) => setShipForm((f) => ({ ...f, dimensions: e.target.value }))}
                    className="input-field text-sm py-2 h-auto"
                    placeholder="30×20×5"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    تكلفة الشحن ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    value={shipForm.shippingCost}
                    onChange={(e) => setShipForm((f) => ({ ...f, shippingCost: e.target.value }))}
                    className=" e.target.value[object Object],[object Object]-field text-sm py-2 h-auto"
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  ملاحظات
                </label>
                <textarea
                  value={shipForm.notes}
                  onChange={(e) => setShipForm((f) => ({ ...f, notes: e.target.value }))}
                  className="input-field resize-none"
                  rows={2}
                  placeholder="تعليمات خاصة للشحن..."
                />
              </div>

              {paymentMethods.length > 0 && (
                <div className="bg-gray-50 rounded-2xl p-4">
                  <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
                    <CreditCard size={12} />
                    طرق الدفع المتاحة في {selectedCountry?.name}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {paymentMethods.map((m) => (
                      <span
                        key={m.id}
                        className="text-xs px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-gray-600"
                      >
                        {m.method_name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-3xl">
              <button
                onClick={() => setShowCreateModal(false)}
                className="btn-secondary"
              >
                إلغاء
              </button>

              <button
                onClick={handleCreateShipment}
                disabled={createShipmentMutation.isPending}
                className="btn-primary flex items-center gap-2 disabled:opacity-60"
              >
                {createShipmentMutation.isPending ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Plus size={15} />
                )}
                {createShipmentMutation.isPending ? 'جارٍ الإنشاء...' : 'إنشاء الشحنة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}