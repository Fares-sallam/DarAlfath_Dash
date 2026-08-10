import { useState } from 'react';
import Layout from '@/components/layout/Layout';
import {
  Search, Ban, Eye, X, ShoppingBag, MessageCircle, Tag, Phone,
  Mail, MapPin, Calendar, DollarSign, Users, UserCheck, UserX,
  TrendingUp, Loader2, AlertCircle, RefreshCw, Edit, Check,
  BookOpen, Package, Globe2
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCustomers, useCustomerOrders, useToggleCustomerStatus, useUpdateCustomer,
  type Customer,
} from '@/hooks/useCustomers';
import { useCountry } from '@/contexts/CountryContext';

/* ── Config ── */
/** أدوار داخلية — تظهر في القائمة (فقد يشترون فعلاً) لكن مع وسم يميّزها. */
const STAFF_ROLES = new Set(['admin', 'manager', 'support', 'owner']);

const orderStatusConfig: Record<string, string> = {
  'جديد': 'bg-cyan-100 text-cyan-700',
  'قيد المراجعة': 'bg-yellow-100 text-yellow-700',
  'تم التأكيد': 'bg-blue-100 text-blue-700',
  'جاري الشحن': 'bg-indigo-100 text-indigo-700',
  'تم التوصيل': 'bg-green-100 text-green-700',
  'ملغي': 'bg-red-100 text-red-500',
  'مرتجع': 'bg-orange-100 text-orange-600',
};

function formatDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ar-EG', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function initials(name: string | null) {
  if (!name) return '؟';
  return name.trim().charAt(0);
}

/* ════════════════════════════════════════════════════════════ */
/* Customer Profile Modal */
/* ════════════════════════════════════════════════════════════ */
interface ProfileModalProps {
  customer: Customer;
  onClose: () => void;
}

function CustomerProfileModal({ customer, onClose }: ProfileModalProps) {
  const { currencySymbol: selectedCurrencySymbol } = useCountry();
  const { data: orders = [], isLoading: ordersLoading } = useCustomerOrders(customer);
  const toggleMutation = useToggleCustomerStatus();
  const updateMutation = useUpdateCustomer();

  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState(customer.full_name ?? '');
  const [editPhone, setEditPhone] = useState(customer.phone ?? '');

  const handleToggle = async () => {
    await toggleMutation.mutateAsync({ id: customer.id, is_active: !customer.is_active });
    onClose();
  };

  const handleSave = async () => {
    await updateMutation.mutateAsync({
      id: customer.id,
      full_name: editName,
      phone: editPhone,
    });
    setEditMode(false);
  };

  const avgOrder =
    orders.length > 0
      ? Math.round(orders.reduce((s, o) => s + o.total_price, 0) / orders.length)
      : 0;

  const currency = customer.countries?.currency_symbol ?? selectedCurrencySymbol ?? 'ج.م';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-6">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <Eye size={16} className="text-blue-700" />
            الملف الشرائي للعميل
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-start gap-4 bg-gradient-to-l from-blue-50 to-indigo-50 rounded-2xl p-5">
            {customer.avatar_url ? (
              <img
                src={customer.avatar_url}
                alt={customer.full_name ?? ''}
                className="w-16 h-16 rounded-2xl object-cover border-4 border-white shadow-md flex-shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-blue-200 border-4 border-white shadow-md flex items-center justify-center flex-shrink-0">
                <span className="text-blue-800 text-2xl font-black">{initials(customer.full_name)}</span>
              </div>
            )}

            <div className="flex-1 min-w-0">
              {editMode ? (
                <div className="space-y-2">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-white/80 border border-blue-200 rounded-xl px-3 py-1.5 text-sm font-semibold"
                    placeholder="الاسم"
                  />
                  <input
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full bg-white/80 border border-blue-200 rounded-xl px-3 py-1.5 text-sm"
                    placeholder="الهاتف"
                    dir="ltr"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSave}
                      disabled={updateMutation.isPending}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-700 text-white rounded-xl text-xs font-semibold"
                    >
                      <Check size={12} />
                      حفظ
                    </button>
                    <button
                      onClick={() => setEditMode(false)}
                      className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs text-gray-500"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="text-lg font-bold text-gray-800">{customer.full_name ?? 'بدون اسم'}</h3>
                    {customer.isGuest ? (
                      <span className="status-badge bg-slate-100 text-slate-600">
                        اشترى بدون حساب
                      </span>
                    ) : (
                      <span className={`status-badge ${customer.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-500'}`}>
                        {customer.is_active ? 'نشط' : 'محظور'}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-500">
                    {customer.email && (
                      <span className="flex items-center gap-1.5 truncate">
                        <Mail size={12} className="flex-shrink-0" />
                        {customer.email}
                      </span>
                    )}
                    {customer.phone && (
                      <span className="flex items-center gap-1.5" dir="ltr">
                        <Phone size={12} className="flex-shrink-0" />
                        {customer.phone}
                      </span>
                    )}
                    {customer.countries && (
                      <span className="flex items-center gap-1.5">
                        <MapPin size={12} className="flex-shrink-0" />
                        {customer.countries.name}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <Calendar size={12} className="flex-shrink-0" />
                      انضم {formatDate(customer.created_at)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="text-center bg-blue-50 rounded-2xl p-4">
              <p className="text-2xl font-black text-blue-700">{customer.totalOrders.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">إجمالي الطلبات</p>
            </div>
            <div className="text-center bg-amber-50 rounded-2xl p-4">
              <p className="text-sm font-black text-amber-700">
                {customer.totalSpent.toLocaleString()} {currency}
              </p>
              <p className="text-xs text-gray-500 mt-1">إجمالي الإنفاق</p>
            </div>
            <div className="text-center bg-green-50 rounded-2xl p-4">
              <p className="text-sm font-black text-green-700">
                {avgOrder.toLocaleString()} {currency}
              </p>
              <p className="text-xs text-gray-500 mt-1">متوسط الطلب</p>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
              <ShoppingBag size={15} />
              سجل الطلبات
            </h3>

            {ordersLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">جارٍ التحميل...</span>
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-2xl">
                <ShoppingBag size={28} className="text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">لا توجد طلبات مسجلة في هذه الدولة</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {orders.map((order) => {
                  const sc = orderStatusConfig[order.status] ?? 'bg-gray-100 text-gray-500';
                  const books = (order.order_items ?? [])
                    .map((i) => i.products?.title)
                    .filter(Boolean)
                    .slice(0, 3)
                    .join('، ');
                  const city = order.shipping_address?.city ?? order.shipping_address?.governorate;

                  return (
                    <div key={order.id} className="flex items-start gap-3 bg-gray-50 rounded-xl px-4 py-3">
                      <Package size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
                          <span className="text-sm font-bold text-blue-700">{order.id}</span>
                          <span className={`status-badge text-xs ${sc}`}>{order.status}</span>
                        </div>

                        {books && (
                          <p className="text-xs text-gray-500 truncate flex items-center gap-1 mb-1">
                            <BookOpen size={10} className="flex-shrink-0" />
                            {books}
                          </p>
                        )}

                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <Calendar size={10} />
                            {formatDateTime(order.created_at)}
                            {city && (
                              <>
                                <MapPin size={10} className="mr-1" />
                                {city}
                              </>
                            )}
                          </span>
                          <span className="text-sm font-bold text-gray-800">
                            {order.total_price.toLocaleString()} {currency}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-3xl">
          {!customer.isGuest && (
            <button
              onClick={() => setEditMode(true)}
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <Edit size={13} />
              تعديل البيانات
            </button>
          )}

          <button
            onClick={() => toast.info(`إرسال رسالة لـ ${customer.full_name}`)}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <MessageCircle size={13} />
            إرسال رسالة
          </button>

          <button
            onClick={() => toast.info(`كوبون خاص لـ ${customer.full_name}`)}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <Tag size={13} />
            كوبون خاص
          </button>

          {!customer.isGuest && (
            <button
              onClick={handleToggle}
              disabled={toggleMutation.isPending}
              className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl border transition-colors disabled:opacity-50 ${
                customer.is_active
                  ? 'border-red-200 text-red-500 hover:bg-red-50'
                  : 'border-green-200 text-green-600 hover:bg-green-50'
              }`}
            >
              <Ban size={13} />
              {customer.is_active ? 'حظر العميل' : 'رفع الحظر'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
/* Main Page */
/* ════════════════════════════════════════════════════════════ */
export default function Customers() {
  const qc = useQueryClient();
  const { selectedCountry, currencySymbol } = useCountry();
  const { data: customers = [], isLoading, isError } = useCustomers();
  const toggleMutation = useToggleCustomerStatus();

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('الكل');
  const [sortBy, setSortBy] = useState<'latest' | 'spent' | 'orders'>('latest');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const filtered = customers
    .filter((c) => {
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        (c.full_name ?? '').toLowerCase().includes(q) ||
        (c.phone ?? '').includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.countries?.name ?? '').toLowerCase().includes(q) ||
        // البحث برقم الطلب يصل للعميل صاحبه مباشرة
        (c.orderIds ?? []).some((id) => id.toLowerCase().includes(q));

      const matchStatus =
        filterStatus === 'الكل' ||
        (filterStatus === 'نشط' && c.is_active) ||
        (filterStatus === 'محظور' && !c.is_active);

      return matchSearch && matchStatus;
    })
    .sort((a, b) => {
      if (sortBy === 'spent') return b.totalSpent - a.totalSpent;
      if (sortBy === 'orders') return b.totalOrders - a.totalOrders;
      return (b.created_at ?? '').localeCompare(a.created_at ?? '');
    });

  const totalActive = customers.filter((c) => c.is_active).length;
  const totalBanned = customers.filter((c) => !c.is_active).length;
  const totalRevenue = customers.reduce((s, c) => s + c.totalSpent, 0);

  return (
    <Layout>
      <div className="fade-in">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="section-title">إدارة العملاء</h1>
            <p className="section-subtitle">
              إدارة بيانات العملاء وملفاتهم الشرائية — {selectedCountry?.name ? `عملاء ${selectedCountry.name}` : 'بيانات حقيقية من Supabase'}
            </p>

            <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-xl bg-blue-50 text-blue-700">
              <Globe2 size={12} />
              {selectedCountry?.name ?? 'كل الدول'} · {currencySymbol}
            </div>
          </div>

          <button
            onClick={() => {
              qc.invalidateQueries({ queryKey: ['customers'] });
              toast.info('جارٍ التحديث...');
            }}
            className="p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 transition-colors"
            title="تحديث"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            {
              label: 'إجمالي العملاء',
              value: isLoading ? '—' : customers.length.toLocaleString(),
              color: 'text-blue-700',
              bg: 'bg-blue-50',
              icon: <Users size={18} className="text-blue-600" />,
            },
            {
              label: 'العملاء النشطين',
              value: isLoading ? '—' : totalActive.toLocaleString(),
              color: 'text-green-600',
              bg: 'bg-green-50',
              icon: <UserCheck size={18} className="text-green-600" />,
            },
            {
              label: 'المحظورون',
              value: isLoading ? '—' : totalBanned.toLocaleString(),
              color: 'text-red-600',
              bg: 'bg-red-50',
              icon: <UserX size={18} className="text-red-500" />,
            },
            {
              label: 'إجمالي المشتريات',
              value: isLoading ? '—' : `${totalRevenue.toLocaleString()} ${currencySymbol}`,
              color: 'text-amber-600',
              bg: 'bg-amber-50',
              icon: <TrendingUp size={18} className="text-amber-600" />,
            },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className={`w-9 h-9 ${s.bg} rounded-xl flex items-center justify-center`}>
                  {s.icon}
                </div>
              </div>
              {isLoading ? (
                <div className="h-7 bg-gray-100 rounded-lg animate-pulse w-20 mb-1" />
              ) : (
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              )}
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="ابحث بالاسم، الهاتف، البريد، أو رقم الطلب..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pr-10"
            />
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field md:w-36"
          >
            <option>الكل</option>
            <option>نشط</option>
            <option>محظور</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="input-field md:w-44"
          >
            <option value="latest">الأحدث تسجيلاً</option>
            <option value="spent">الأعلى إنفاقاً</option>
            <option value="orders">الأكثر طلبات</option>
          </select>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
            <Loader2 size={26} className="animate-spin" />
            <span>جارٍ تحميل العملاء...</span>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-red-400">
            <AlertCircle size={32} />
            <span>تعذّر تحميل بيانات العملاء</span>
          </div>
        )}

        {!isLoading && !isError && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <p className="text-sm text-gray-500">{filtered.length} عميل</p>
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Users size={40} className="text-gray-200 mx-auto mb-3" />
                <p className="font-semibold text-gray-500">لا يوجد عملاء</p>
                <p className="text-sm mt-1">لم يسجل أي عميل لهذه الدولة بعد</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="table-header">
                      <th className="text-right px-4 py-3">العميل</th>
                      <th className="text-right px-4 py-3">الهاتف</th>
                      <th className="text-right px-4 py-3">الدولة</th>
                      <th className="text-right px-4 py-3">الطلبات</th>
                      <th className="text-right px-4 py-3">إجمالي الإنفاق</th>
                      <th className="text-right px-4 py-3">آخر طلب</th>
                      <th className="text-right px-4 py-3">الحالة</th>
                      <th className="text-right px-4 py-3">الإجراءات</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filtered.map((customer) => {
                      const currency = customer.countries?.currency_symbol ?? currencySymbol ?? 'ج.م';

                      return (
                        <tr key={customer.id} className="table-row">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {customer.avatar_url ? (
                                <img
                                  src={customer.avatar_url}
                                  alt={customer.full_name ?? ''}
                                  className="w-9 h-9 rounded-full flex-shrink-0 object-cover"
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                  <span className="text-blue-700 font-bold text-sm">
                                    {initials(customer.full_name)}
                                  </span>
                                </div>
                              )}

                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="text-sm font-semibold text-gray-800 truncate">
                                    {customer.full_name ?? 'بدون اسم'}
                                  </p>
                                  {customer.isGuest ? (
                                    <span className="status-badge text-[10px] bg-slate-100 text-slate-600">
                                      بدون حساب
                                    </span>
                                  ) : STAFF_ROLES.has(customer.role) ? (
                                    <span className="status-badge text-[10px] bg-purple-100 text-purple-700">
                                      {customer.role}
                                    </span>
                                  ) : null}
                                </div>
                                {customer.email && (
                                  <p className="text-xs text-gray-400 truncate" dir="ltr">
                                    {customer.email}
                                  </p>
                                )}
                                <p className="text-xs text-gray-400">
                                  {customer.isGuest ? 'أول طلب' : 'انضم'} {formatDate(customer.created_at)}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            {customer.phone ? (
                              <span className="text-sm text-gray-600 flex items-center gap-1.5">
                                <Phone size={12} className="text-gray-400 flex-shrink-0" />
                                <span dir="ltr">{customer.phone}</span>
                              </span>
                            ) : (
                              <span className="text-sm text-gray-300">—</span>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-600 flex items-center gap-1">
                              <MapPin size={12} className="text-gray-400 flex-shrink-0" />
                              {customer.countries?.name ?? selectedCountry?.name ?? '—'}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <ShoppingBag size={13} className="text-blue-500 flex-shrink-0" />
                              <span className="text-sm font-semibold text-gray-800">
                                {customer.totalOrders.toLocaleString()}
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <span className="text-sm font-bold text-blue-700">
                              {customer.totalSpent.toLocaleString()} {currency}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            <div className="text-xs text-gray-400">
                              {customer.lastOrderAt ? (
                                <>
                                  <p>{formatDate(customer.lastOrderAt)}</p>
                                  {customer.lastOrderCity && (
                                    <p className="text-gray-300">{customer.lastOrderCity}</p>
                                  )}
                                </>
                              ) : (
                                '—'
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <span className={`status-badge ${customer.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-500'}`}>
                              {customer.is_active ? 'نشط' : 'محظور'}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setSelectedCustomer(customer)}
                                className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600"
                                title="الملف الشرائي"
                              >
                                <Eye size={14} />
                              </button>

                              <button
                                onClick={() => toast.info(`رسالة لـ ${customer.full_name}`)}
                                className="p-1.5 rounded-lg hover:bg-green-50 text-green-600"
                                title="رسالة"
                              >
                                <MessageCircle size={14} />
                              </button>

                              <button
                                onClick={() => toast.info(`كوبون خاص لـ ${customer.full_name}`)}
                                className="p-1.5 rounded-lg hover:bg-purple-50 text-purple-600"
                                title="كوبون خاص"
                              >
                                <Tag size={14} />
                              </button>

                              <button
                                onClick={() =>
                                  toggleMutation.mutate({
                                    id: customer.id,
                                    is_active: !customer.is_active,
                                  })
                                }
                                disabled={toggleMutation.isPending || customer.isGuest}
                                className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                  customer.is_active
                                    ? 'hover:bg-red-50 text-red-500'
                                    : 'hover:bg-green-50 text-green-600'
                                }`}
                                title={
                                  customer.isGuest
                                    ? 'مشترٍ بدون حساب — لا يمكن حظره'
                                    : customer.is_active ? 'حظر' : 'رفع الحظر'
                                }
                              >
                                <Ban size={14} />
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

      {selectedCustomer && (
        <CustomerProfileModal
          customer={selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
        />
      )}
    </Layout>
  );
}