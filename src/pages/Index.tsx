import { useNavigate } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import ChartsSection from '@/components/features/ChartsSection';
import {
  BookOpen,
  ShoppingCart,
  Users,
  Clock,
  TrendingUp,
  Package,
  Edit,
  Trash2,
  FileText,
  LogIn,
  LogOut,
  Plus,
  BarChart2,
  Loader2,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  Globe2,
} from 'lucide-react';
import {
  useBookStats,
  useTopSellingBooks,
  useRecentAuditLogs,
  useRecentOrders,
  useDashboardKpi,
} from '@/hooks/useDashboard';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useCountry } from '@/contexts/CountryContext';
import { useAuth } from '@/contexts/AuthContext';

/* ── Status config ── */
const statusConfig: Record<string, { label: string; cls: string }> = {
  جديد: { label: 'جديد', cls: 'bg-cyan-100 text-cyan-700' },
  'قيد المراجعة': { label: 'قيد المراجعة', cls: 'bg-yellow-100 text-yellow-700' },
  'قيد المعالجة': { label: 'قيد المعالجة', cls: 'bg-blue-100 text-blue-700' },
  'تم التأكيد': { label: 'تم التأكيد', cls: 'bg-blue-100 text-blue-700' },
  'جاري الشحن': { label: 'جاري الشحن', cls: 'bg-indigo-100 text-indigo-700' },
  'تم التوصيل': { label: 'تم التوصيل', cls: 'bg-green-100 text-green-700' },
  ملغي: { label: 'ملغي', cls: 'bg-red-100 text-red-500' },
  مرتجع: { label: 'مرتجع', cls: 'bg-orange-100 text-orange-600' },
};

/* ── Action config for audit log ── */
const actionConfig: Record<string, { icon: React.ReactNode; cls: string }> = {
  INSERT: { icon: <Plus size={13} />, cls: 'bg-green-100 text-green-700' },
  UPDATE: { icon: <Edit size={13} />, cls: 'bg-amber-100 text-amber-700' },
  DELETE: { icon: <Trash2 size={13} />, cls: 'bg-red-100 text-red-600' },
  LOGIN: { icon: <LogIn size={13} />, cls: 'bg-blue-100 text-blue-700' },
  LOGOUT: { icon: <LogOut size={13} />, cls: 'bg-gray-100 text-gray-600' },
};

const tableArabic: Record<string, string> = {
  products: 'الكتب',
  orders: 'الطلبات',
  profiles: 'المستخدمين',
  coupons: 'الكوبونات',
  categories: 'التصنيفات',
  book_series: 'السلاسل',
  product_inventory: 'المخزون',
  shipping_companies: 'شركات الشحن',
  payment_methods: 'طرق الدفع',
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('ar-EG', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrencyCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

/* ════════════════════════════════════════════════ */
/* ── KPI Cards (live from Supabase) ── */
function KpiCards() {
  const navigate = useNavigate();
  const { currencySymbol } = useCountry();
  const { data: kpi, isLoading } = useDashboardKpi();
  const { data: books, isLoading: booksLoading } = useBookStats();

  const activeCurrencySymbol = kpi?.currencySymbol ?? currencySymbol;

  const cards = [
    {
      label: 'إيرادات الشهر',
      value: kpi ? `${formatCurrencyCompact(kpi.totalRevenue)} ${activeCurrencySymbol}` : '—',
      icon: <TrendingUp size={20} className="text-green-600" />,
      bg: 'bg-green-50',
      sub: kpi?.countryName ? `الدولة: ${kpi.countryName}` : 'الطلبات المكتملة',
      route: '/analytics',
      hoverRing: 'hover:ring-green-300',
    },
    {
      label: 'طلبات الشهر',
      value: kpi ? kpi.totalOrders.toLocaleString() : '—',
      icon: <ShoppingCart size={20} className="text-blue-700" />,
      bg: 'bg-blue-50',
      sub: kpi ? `${kpi.pendingOrders} بانتظار المعالجة` : '',
      route: '/orders',
      hoverRing: 'hover:ring-blue-300',
    },
    {
      label: 'إجمالي العملاء',
      value: kpi ? kpi.totalCustomers.toLocaleString() : '—',
      icon: <Users size={20} className="text-purple-600" />,
      bg: 'bg-purple-50',
      sub: 'عملاء الدولة الحالية',
      route: '/customers',
      hoverRing: 'hover:ring-purple-300',
    },
    {
      label: 'إجمالي الكتب',
      value: books ? books.total.toLocaleString() : '—',
      icon: <BookOpen size={20} className="text-amber-600" />,
      bg: 'bg-amber-50',
      sub: books ? `${books.active} نشط · ${books.digital} رقمي` : '',
      route: '/books',
      hoverRing: 'hover:ring-amber-300',
    },
  ];

  const loading = isLoading || booksLoading;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((c, i) => (
        <button
          key={i}
          onClick={() => navigate(c.route)}
          className={`bg-white rounded-2xl p-5 shadow-sm text-right w-full transition-all hover:shadow-md hover:ring-2 ${c.hoverRing} group cursor-pointer`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className={`w-10 h-10 ${c.bg} rounded-xl flex items-center justify-center transition-transform group-hover:scale-110`}>
              {c.icon}
            </div>
            <ArrowLeft size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
          </div>

          {loading ? (
            <div className="h-8 bg-gray-100 rounded-lg animate-pulse w-28 mb-1" />
          ) : (
            <p className="text-2xl font-black text-gray-800">{c.value}</p>
          )}

          <p className="text-sm text-gray-500 mt-0.5">{c.label}</p>
          {c.sub && <p className="text-xs text-blue-600 font-semibold mt-1">{c.sub}</p>}
        </button>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════ */
/* ── Recent Orders (live) ── */
function RecentOrders() {
  const navigate = useNavigate();
  const { currencySymbol } = useCountry();
  const { data: orders = [], isLoading, isError } = useRecentOrders(6);

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-gray-800">آخر الطلبات</h3>
          <p className="text-xs text-gray-400 mt-0.5">أحدث طلبات الدولة الحالية من قاعدة البيانات</p>
        </div>
        <button onClick={() => navigate('/orders')} className="btn-primary text-xs flex items-center gap-1.5">
          عرض الكل <ArrowLeft size={12} />
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm">جارٍ التحميل...</span>
        </div>
      )}

      {isError && (
        <div className="flex items-center justify-center py-12 gap-2 text-red-400">
          <AlertCircle size={18} />
          <span className="text-sm">تعذّر تحميل الطلبات</span>
        </div>
      )}

      {!isLoading && !isError && orders.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <ShoppingCart size={32} className="text-gray-200 mx-auto mb-2" />
          <p className="text-sm">لا توجد طلبات لهذه الدولة بعد</p>
        </div>
      )}

      {!isLoading && !isError && orders.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="table-header">
                <th className="text-right px-6 py-3 font-semibold">رقم الطلب</th>
                <th className="text-right px-6 py-3 font-semibold">العميل</th>
                <th className="text-right px-6 py-3 font-semibold">المدينة</th>
                <th className="text-right px-6 py-3 font-semibold">المبلغ</th>
                <th className="text-right px-6 py-3 font-semibold">الحالة</th>
                <th className="text-right px-6 py-3 font-semibold">التاريخ</th>
              </tr>
            </thead>

            <tbody>
              {orders.map((order) => {
                const status = statusConfig[order.status];
                const name = order.profiles?.full_name ?? 'زائر';
                const city = order.shipping_address?.city ?? '—';
                const activeCurrencySymbol = order.currencySymbol ?? currencySymbol;

                return (
                  <tr key={order.id} className="table-row">
                    <td className="px-6 py-3 text-sm font-bold text-blue-700">{order.id}</td>

                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        {order.profiles?.avatar_url ? (
                          <img src={order.profiles.avatar_url} alt={name} className="w-8 h-8 rounded-full" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <span className="text-blue-700 font-bold text-xs">{name.charAt(0)}</span>
                          </div>
                        )}
                        <span className="text-sm font-semibold text-gray-800">{name}</span>
                      </div>
                    </td>

                    <td className="px-6 py-3 text-sm text-gray-500">{city}</td>
                    <td className="px-6 py-3 text-sm font-bold text-gray-800">
                      {order.total_price.toLocaleString()} {activeCurrencySymbol}
                    </td>

                    <td className="px-6 py-3">
                      <span className={`status-badge ${status?.cls ?? 'bg-gray-100 text-gray-500'}`}>
                        {status?.label ?? order.status}
                      </span>
                    </td>

                    <td className="px-6 py-3 text-xs text-gray-400">{formatDate(order.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════ */
/* ── Books Management Panel ── */
function BooksPanel() {
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading } = useBookStats();
  const { data: topBooks = [], isLoading: booksLoading } = useTopSellingBooks(5);

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <BookOpen size={16} className="text-blue-700" />
            لوحة إدارة الكتب
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">إحصائيات الكتب والأكثر مبيعاً في الدولة الحالية</p>
        </div>
        <button onClick={() => navigate('/books')} className="btn-primary text-xs flex items-center gap-1.5">
          إدارة الكتب <ArrowLeft size={12} />
        </button>
      </div>

      <div className="grid grid-cols-3 divide-x divide-x-reverse divide-gray-100 border-b border-gray-100">
        {[
          { label: 'إجمالي الكتب', value: stats?.total ?? '—', color: 'text-blue-700', route: '/books' },
          { label: 'نشط', value: stats?.active ?? '—', color: 'text-green-600', route: '/books' },
          { label: 'رقمي', value: stats?.digital ?? '—', color: 'text-purple-600', route: '/books' },
        ].map((s, i) => (
          <button
            key={i}
            onClick={() => navigate(s.route)}
            className="flex flex-col items-center py-4 px-3 gap-1 hover:bg-gray-50 transition-colors w-full group"
          >
            <span className={`text-xl font-black ${s.color} group-hover:scale-105 transition-transform`}>
              {statsLoading ? <span className="w-10 h-6 bg-gray-100 rounded animate-pulse block" /> : s.value}
            </span>
            <span className="text-xs text-gray-400">{s.label}</span>
          </button>
        ))}
      </div>

      <div className="p-5">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">الأكثر مبيعاً هذا الشهر</p>

        {booksLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : topBooks.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <BarChart2 size={28} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm">لا توجد مبيعات لهذا الشهر في الدولة الحالية</p>
          </div>
        ) : (
          <div className="space-y-3">
            {topBooks.map((book, i) => {
              const pct = Math.round((book.totalSold / (topBooks[0]?.totalSold || 1)) * 100);
              const medals = ['🥇', '🥈', '🥉'];
              const barColors = ['#D4AF37', '#1D4ED8', '#F97316', '#60A5FA', '#a78bfa'];

              return (
                <div key={book.productId} className="flex items-center gap-3">
                  <span className="w-7 text-sm flex-shrink-0 text-center">
                    {i < 3 ? medals[i] : <span className="font-bold text-gray-400 text-xs">{i + 1}</span>}
                  </span>

                  {book.cover_url ? (
                    <img
                      src={book.cover_url}
                      alt={book.title}
                      className="w-8 h-11 rounded-lg object-cover flex-shrink-0 shadow-sm"
                    />
                  ) : (
                    <div className="w-8 h-11 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <BookOpen size={12} className="text-gray-300" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <p className="text-sm font-semibold text-gray-800 truncate">{book.title}</p>
                      <span className="text-xs font-bold text-gray-600 flex-shrink-0 mr-2">
                        {book.totalSold} نسخة
                      </span>
                    </div>

                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: barColors[i] }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-5 pb-5 flex gap-2 flex-wrap">
        <button
          onClick={() => navigate('/books')}
          className="flex items-center gap-1.5 text-xs px-3 py-2 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-colors font-semibold"
        >
          <Plus size={12} /> إضافة كتاب
        </button>

        <button
          onClick={() => navigate('/inventory')}
          className="flex items-center gap-1.5 text-xs px-3 py-2 bg-amber-50 text-amber-700 rounded-xl hover:bg-amber-100 transition-colors font-semibold"
        >
          <Package size={12} /> إدارة المخزون
        </button>

        <button
          onClick={() => navigate('/analytics')}
          className="flex items-center gap-1.5 text-xs px-3 py-2 bg-green-50 text-green-700 rounded-xl hover:bg-green-100 transition-colors font-semibold"
        >
          <BarChart2 size={12} /> تقارير المبيعات
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════ */
/* ── Activity Log Panel ── */
function ActivityPanel() {
  const { data: logs = [], isLoading, isError, refetch } = useRecentAuditLogs(12);
  const navigate = useNavigate();

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <Clock size={16} className="text-indigo-600" />
            سجل التعديلات
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">آخر العمليات المسجّلة في النظام</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            title="تحديث"
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <RefreshCw size={14} />
          </button>
          <button onClick={() => navigate('/activity')} className="btn-primary text-xs flex items-center gap-1.5">
            عرض الكل <ArrowLeft size={12} />
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm">جارٍ التحميل...</span>
        </div>
      )}

      {isError && (
        <div className="flex items-center justify-center py-12 gap-2 text-amber-500">
          <AlertCircle size={18} />
          <span className="text-sm">لا توجد بيانات أو لا تمتلك صلاحية العرض</span>
        </div>
      )}

      {!isLoading && !isError && logs.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <FileText size={32} className="text-gray-200 mx-auto mb-2" />
          <p className="text-sm">لا توجد سجلات تعديلات بعد</p>
          <p className="text-xs mt-1">ستظهر العمليات هنا عند تنفيذ أي تعديل</p>
        </div>
      )}

      {!isLoading && !isError && logs.length > 0 && (
        <div className="divide-y divide-gray-50 max-h-[480px] overflow-y-auto">
          {logs.map((log) => {
            const ac =
              actionConfig[log.action] ?? {
                icon: <FileText size={13} />,
                cls: 'bg-gray-100 text-gray-600',
              };

            const tableName = tableArabic[log.table_name ?? ''] ?? log.table_name ?? 'النظام';
            const userName = log.profiles?.full_name ?? log.user_email ?? 'النظام';

            return (
              <div
                key={log.id}
                className="flex items-start gap-3 px-5 py-3.5 hover:bg-gray-50/60 transition-colors cursor-pointer"
                onClick={() => navigate('/activity')}
                title="عرض سجل النشاط الكامل"
              >
                <div className="flex-shrink-0 mt-0.5">
                  {log.profiles?.avatar_url ? (
                    <img src={log.profiles.avatar_url} alt={userName} className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                      <span className="text-indigo-700 font-bold text-xs">{userName.charAt(0)}</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-800">{userName}</span>
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${ac.cls}`}>
                      {ac.icon}
                      {log.action}
                    </span>
                    <span className="text-xs text-gray-500">في</span>
                    <span className="text-xs font-semibold text-blue-600">{tableName}</span>
                    {log.record_id && (
                      <span className="text-xs text-gray-400 font-mono">#{log.record_id.slice(0, 8)}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(log.created_at)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════ */
/* ── Main Dashboard ── */
export default function Index() {
  const qc = useQueryClient();
  const { selectedCountry, currencySymbol } = useCountry();
  const { user } = useAuth();
  // Staff without the matching permission still land here after login (this
  // is the post-login route for everyone), but the orders/audit-log panels
  // carry the same customer PII and change-history data as the dedicated
  // /orders and /activity pages — which DO require these permissions. Gate
  // just these two panels rather than the whole route.
  const canViewOrders = user?.isSystemOwner || user?.permissions.can_manage_orders;
  const canViewActivity = user?.isSystemOwner || user?.permissions.can_view_activity_log;

  const handleRefreshAll = () => {
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['analytics'] });
    toast.info('جارٍ تحديث البيانات...');
  };

  return (
    <Layout>
      <div className="fade-in">
        {/* Page Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-gray-800">دار الفتح للنشر والتوزيع</h1>
            <p className="text-gray-500 text-sm mt-1">
              لوحة التحكم الرئيسية — نظرة شاملة على أداء {selectedCountry?.name ?? 'النظام'}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-xl bg-blue-50 text-blue-700">
                <Globe2 size={12} />
                {selectedCountry?.name ?? 'كل الدول'}
              </span>

              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-xl bg-gray-100 text-gray-600">
                العملة الحالية: {currencySymbol}
              </span>
            </div>
          </div>

          <button
            onClick={handleRefreshAll}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 bg-white px-3 py-2 rounded-xl shadow-sm hover:shadow transition-all border border-gray-100"
          >
            <RefreshCw size={14} /> تحديث
          </button>
        </div>

        <KpiCards />
        <ChartsSection />

        {canViewOrders && (
          <div className="mb-6">
            <RecentOrders />
          </div>
        )}

        <div className={`grid grid-cols-1 ${canViewActivity ? 'xl:grid-cols-2' : ''} gap-6`}>
          <BooksPanel />
          {canViewActivity && <ActivityPanel />}
        </div>
      </div>
    </Layout>
  );
}