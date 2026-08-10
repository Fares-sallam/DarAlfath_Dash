import { useMemo, useState } from 'react';
import Layout from '@/components/layout/Layout';
import {
  CreditCard, Search, AlertTriangle, CheckCircle2, Clock, XCircle,
  Loader2, RefreshCw, Copy, ExternalLink, TrendingDown, Hash,
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import {
  usePendingPayments,
  summarizePendingPayments,
  type PendingPayment,
} from '@/hooks/usePendingPayments';
import { useQueryClient } from '@tanstack/react-query';
import { useCountry } from '@/contexts/CountryContext';

/* ── حالات محاولة الدفع ── */
const statusConfig: Record<string, { label: string; cls: string; dot: string; icon: React.ReactNode }> = {
  pending:   { label: 'معلّقة',  cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500', icon: <Clock size={12} /> },
  completed: { label: 'ناجحة',   cls: 'bg-green-100 text-green-700', dot: 'bg-green-500', icon: <CheckCircle2 size={12} /> },
  failed:    { label: 'فاشلة',   cls: 'bg-red-100 text-red-600',     dot: 'bg-red-500',   icon: <XCircle size={12} /> },
  cancelled: { label: 'ملغاة',   cls: 'bg-gray-100 text-gray-500',   dot: 'bg-gray-400',  icon: <XCircle size={12} /> },
  expired:   { label: 'منتهية',  cls: 'bg-orange-100 text-orange-600', dot: 'bg-orange-400', icon: <Clock size={12} /> },
};

const STATUS_TABS = ['الكل', 'pending', 'failed', 'cancelled', 'expired', 'completed'] as const;

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ar-EG', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** كم مضى على المحاولة — يُبرز المحاولات العالقة من زمن. */
function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `منذ ${mins} د`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `منذ ${hrs} س`;
  return `منذ ${Math.floor(hrs / 24)} ي`;
}

export default function PendingPayments() {
  const [statusFilter, setStatusFilter] = useState<string>('الكل');
  const [search, setSearch] = useState('');
  const { data: rows = [], isLoading, isError, error } = usePendingPayments({ status: statusFilter });
  const qc = useQueryClient();
  const { selectedCountry } = useCountry();
  const currency = selectedCountry?.currency_symbol ?? 'ج.م';

  const stats = useMemo(() => summarizePendingPayments(rows), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [
        r.merchant_order_id,
        r.paymob_transaction_id,
        r.paymob_order_id,
        r.resulting_order_id,
        r.shipping_address?.name,
        r.shipping_address?.email,
        r.shipping_address?.phone,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const copy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    toast.success(`تم نسخ ${label}`);
  };

  return (
    <Layout>
      <div className="space-y-5">
        {/* ── العنوان ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <CreditCard className="text-indigo-600" size={24} />
              محاولات الدفع
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              كل عميل ضغط «ادفع» يظهر هنا — بما فيهم من لم يكتمل دفعه ولم يتحوّل إلى طلب.
            </p>
          </div>

          <button
            onClick={() => {
              void qc.invalidateQueries({ queryKey: ['pending-payments'] });
              toast.success('تم التحديث');
            }}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={14} />
            تحديث
          </button>
        </div>

        {/* ── بطاقات الإحصاء ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            title="معلّقة الآن"
            value={stats.stuck}
            hint="تحتاج متابعة"
            icon={<Clock size={18} />}
            tone={stats.stuck > 0 ? 'amber' : 'gray'}
          />
          <StatCard
            title="فشلت خلال 24 ساعة"
            value={stats.failedToday}
            hint="محاولات شراء ضائعة"
            icon={<AlertTriangle size={18} />}
            tone={stats.failedToday > 0 ? 'red' : 'gray'}
          />
          <StatCard
            title="إيراد لم يكتمل"
            value={`${stats.lostRevenue.toLocaleString()} ${currency}`}
            hint="قيمة كل ما لم ينجح"
            icon={<TrendingDown size={18} />}
            tone="red"
          />
          <StatCard
            title="ناجحة"
            value={stats.completed}
            hint="تحوّلت إلى طلبات"
            icon={<CheckCircle2 size={18} />}
            tone="green"
          />
        </div>

        {/* ── الفلاتر ── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <div className="relative">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث برقم المحاولة، رقم معاملة Paymob، اسم العميل، بريده، أو هاتفه..."
              className="w-full pr-10 pl-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {STATUS_TABS.map((s) => {
              const active = statusFilter === s;
              const label = s === 'الكل' ? 'الكل' : statusConfig[s]?.label ?? s;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── الجدول ── */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center gap-3 text-gray-400">
              <Loader2 className="animate-spin" size={28} />
              <p className="text-sm">جارٍ التحميل...</p>
            </div>
          ) : isError ? (
            <div className="py-16 flex flex-col items-center gap-2 text-red-500">
              <AlertTriangle size={28} />
              <p className="text-sm font-semibold">تعذّر تحميل محاولات الدفع</p>
              <p className="text-xs text-gray-400">
                {error instanceof Error ? error.message : 'خطأ غير معروف'}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-2 text-gray-400">
              <CheckCircle2 size={28} className="text-green-400" />
              <p className="text-sm font-semibold text-gray-600">
                {search || statusFilter !== 'الكل'
                  ? 'لا توجد نتائج مطابقة'
                  : 'لا توجد محاولات دفع بعد'}
              </p>
              {!search && statusFilter === 'الكل' && (
                <p className="text-xs">ستظهر هنا تلقائيًا فور أول محاولة دفع أونلاين.</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr className="text-xs text-gray-500">
                    <th className="text-right px-4 py-3 font-semibold">الحالة</th>
                    <th className="text-right px-4 py-3 font-semibold">العميل</th>
                    <th className="text-right px-4 py-3 font-semibold">المبلغ</th>
                    <th className="text-right px-4 py-3 font-semibold">السبب / النتيجة</th>
                    <th className="text-right px-4 py-3 font-semibold">مراجع Paymob</th>
                    <th className="text-right px-4 py-3 font-semibold">التوقيت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((r) => (
                    <PaymentRow key={r.id} row={r} currency={currency} onCopy={copy} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {filtered.length > 0 && (
          <p className="text-xs text-gray-400 text-center">
            {filtered.length} محاولة معروضة
            {rows.length !== filtered.length && ` من ${rows.length}`}
          </p>
        )}
      </div>
    </Layout>
  );
}

/* ── بطاقة إحصاء ── */
function StatCard({
  title, value, hint, icon, tone,
}: {
  title: string;
  value: number | string;
  hint: string;
  icon: React.ReactNode;
  tone: 'amber' | 'red' | 'green' | 'gray';
}) {
  const tones = {
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    red:   'bg-red-50 text-red-600 border-red-100',
    green: 'bg-green-50 text-green-600 border-green-100',
    gray:  'bg-gray-50 text-gray-400 border-gray-100',
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center border mb-3 ${tones[tone]}`}>
        {icon}
      </div>
      <p className="text-xl font-bold text-gray-800">{value}</p>
      <p className="text-xs font-semibold text-gray-600 mt-0.5">{title}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>
    </div>
  );
}

/* ── صف واحد ── */
function PaymentRow({
  row, currency, onCopy,
}: {
  row: PendingPayment;
  currency: string;
  onCopy: (text: string, label: string) => void;
}) {
  const cfg = statusConfig[row.status] ?? {
    label: row.status, cls: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400', icon: <Clock size={12} />,
  };
  const addr = row.shipping_address;
  const amount = (row.amount_cents / 100).toLocaleString();

  return (
    <tr className="hover:bg-gray-50/60 transition-colors">
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${cfg.cls}`}>
          {cfg.icon}
          {cfg.label}
        </span>
      </td>

      <td className="px-4 py-3">
        <p className="text-sm font-semibold text-gray-800 truncate max-w-[160px]">
          {addr?.name ?? '—'}
        </p>
        {addr?.email && (
          <p className="text-xs text-gray-400 truncate max-w-[160px]" dir="ltr">{addr.email}</p>
        )}
        {addr?.phone && (
          <p className="text-xs text-gray-400" dir="ltr">{addr.phone}</p>
        )}
        {!row.user_id && (
          <span className="inline-block mt-1 text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">
            زائر
          </span>
        )}
      </td>

      <td className="px-4 py-3">
        <p className="text-sm font-bold text-gray-800">{amount} {currency}</p>
        {row.coupon_code && (
          <p className="text-[11px] text-purple-600 font-semibold">كوبون: {row.coupon_code}</p>
        )}
      </td>

      <td className="px-4 py-3 max-w-[220px]">
        {row.status === 'completed' && row.resulting_order_id ? (
          <Link
            to="/orders"
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
          >
            <ExternalLink size={11} />
            {row.resulting_order_id}
          </Link>
        ) : row.failure_reason ? (
          <p className="text-xs text-gray-600 leading-relaxed">{row.failure_reason}</p>
        ) : row.status === 'pending' ? (
          <p className="text-xs text-amber-600">في انتظار إتمام العميل للدفع</p>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>

      <td className="px-4 py-3">
        <div className="space-y-1">
          {row.paymob_transaction_id ? (
            <button
              onClick={() => onCopy(row.paymob_transaction_id!, 'رقم المعاملة')}
              className="flex items-center gap-1 text-[11px] text-gray-600 hover:text-indigo-600 font-mono"
              title="نسخ رقم معاملة Paymob"
            >
              <Copy size={9} />
              {row.paymob_transaction_id}
            </button>
          ) : (
            <span className="text-[11px] text-gray-300">لا توجد معاملة</span>
          )}
          <button
            onClick={() => onCopy(row.merchant_order_id, 'رقم المحاولة')}
            className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-indigo-600 font-mono"
            title="نسخ الرقم المرجعي للمحاولة"
          >
            <Hash size={9} />
            {row.merchant_order_id.slice(-12)}
          </button>
        </div>
      </td>

      <td className="px-4 py-3">
        <p className="text-xs text-gray-600">{formatDateTime(row.created_at)}</p>
        <p className="text-[11px] text-gray-400">{timeAgo(row.created_at)}</p>
      </td>
    </tr>
  );
}
