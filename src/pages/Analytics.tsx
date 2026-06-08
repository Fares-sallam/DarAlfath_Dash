import { useMemo, useState } from 'react';
import { escapeHtml } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import Layout from '@/components/layout/Layout';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Download,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  DollarSign,
  BarChart2,
  Calendar,
  Package,
  Loader2,
  AlertCircle,
  BookOpen,
  RefreshCw,
  ArrowLeft,
  Users,
  Globe2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useCountry } from '@/contexts/CountryContext';
import {
  getPeriodRange,
  useKpiSummary,
  useRevenueTrend,
  useTopBooks,
  useOrdersByStatus,
  usePaymentMethods,
  useCitiesData,
  useTopCustomers,
  useInventoryRotation,
  type Period,
} from '@/hooks/useAnalytics';

/* ── Constants ── */
const PERIODS: Period[] = ['اليوم', 'أمس', 'هذا الأسبوع', 'هذا الشهر', 'هذا العام', 'يوم محدد', 'مخصص'];
const PIE_COLORS = ['#1D4ED8', '#16A34A', '#F59E0B', '#DC2626', '#8B5CF6', '#0891B2'];

/* ── Helpers ── */
function formatMoney(value: number, currencySymbol: string) {
  return `${Math.round(value).toLocaleString()} ${currencySymbol}`;
}

function formatCompactMoney(value: number, currencySymbol: string) {
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}K ${currencySymbol}`;
  }
  return `${Math.round(value).toLocaleString()} ${currencySymbol}`;
}

/* ── Reusable components ── */
function StatCard({
  label,
  value,
  sub,
  icon,
  color,
  trend,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  color: string;
  trend?: 'up' | 'down';
  loading?: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm card-hover relative">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
          {icon}
        </div>

        {trend &&
          (trend === 'up' ? (
            <div className="flex items-center gap-1 text-green-600 text-xs font-bold">
              <TrendingUp size={13} />
            </div>
          ) : (
            <div className="flex items-center gap-1 text-red-500 text-xs font-bold">
              <TrendingDown size={13} />
            </div>
          ))}
      </div>

      {loading ? (
        <div className="h-8 bg-gray-100 rounded-lg animate-pulse w-24 mb-1" />
      ) : (
        <p className="text-2xl font-black text-gray-800">{value}</p>
      )}

      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

const CustomTooltip = ({
  active,
  payload,
  label,
  currencySymbol = 'ج.م',
}: {
  active?: boolean;
  payload?: { color: string; name: string; value: number; dataKey?: string }[];
  label?: string;
  currencySymbol?: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3" dir="rtl">
        <p className="text-xs font-bold text-gray-700 mb-1">{label}</p>

        {payload.map((p, i) => {
          const dataKey = String(p.dataKey ?? '');
          const name = p.name ?? '';

          let renderedValue = `${Number(p.value ?? 0).toLocaleString()}`;

          if (dataKey === 'orders' || name.includes('الطلبات')) {
            renderedValue = `${Number(p.value ?? 0).toLocaleString()}`;
          } else if (dataKey === 'totalSold' || name.includes('مبيع')) {
            renderedValue = `${Number(p.value ?? 0).toLocaleString()} نسخة`;
          } else if (dataKey === 'totalStock' || name.includes('مخزون')) {
            renderedValue = `${Number(p.value ?? 0).toLocaleString()} نسخة`;
          } else {
            renderedValue = `${Number(p.value ?? 0).toLocaleString()} ${currencySymbol}`;
          }

          return (
            <p key={i} className="text-xs" style={{ color: p.color }}>
              {name}: <span className="font-bold">{renderedValue}</span>
            </p>
          );
        })}
      </div>
    );
  }
  return null;
};

/* ── Loading skeleton ── */
function ChartSkeleton({ height = 260 }: { height?: number }) {
  return (
    <div className="flex items-center justify-center bg-gray-50 rounded-xl animate-pulse" style={{ height }}>
      <Loader2 size={24} className="text-gray-300 animate-spin" />
    </div>
  );
}

/* ── Empty state ── */
function EmptyChart({
  message = 'لا توجد بيانات للفترة المحددة',
  hint,
}: {
  message?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-gray-400">
      <BarChart2 size={36} className="text-gray-200 mb-2" />
      <p className="text-sm font-medium text-gray-500">{message}</p>
      {hint && <p className="text-xs text-gray-400 mt-1 text-center max-w-xs">{hint}</p>}
    </div>
  );
}

/* ── Fallback banner ── */
/* ── No-orders empty state for full sections ── */
function NoOrdersSection({
  title,
  onNavigate,
}: {
  title: string;
  onNavigate: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-3">
      <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center">
        <ShoppingCart size={28} className="text-gray-300" />
      </div>

      <div className="text-center">
        <p className="text-sm font-semibold text-gray-600">{title}</p>
        <p className="text-xs text-gray-400 mt-1">ستظهر البيانات هنا فور تسجيل أول طلب</p>
      </div>

      <button
        onClick={onNavigate}
        className="text-xs font-semibold px-4 py-2 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-colors flex items-center gap-1.5"
      >
        <ArrowLeft size={12} /> إدارة الطلبات
      </button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
export default function Analytics() {
  const navigate = useNavigate();
  const { selectedCountry, currencySymbol: selectedCurrencySymbol } = useCountry();

  const [period, setPeriod] = useState<Period>('هذا الشهر');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [customDay, setCustomDay] = useState('');
  const [topBooksScope, setTopBooksScope] = useState<'يومياً' | 'أسبوعياً' | 'شهرياً' | 'سنوياً'>('شهرياً');

  // For 'يوم محدد' pass customDay as customFrom (single-day range)
  const [from, to] = getPeriodRange(
    period,
    period === 'يوم محدد' ? customDay : customFrom,
    period === 'يوم محدد' ? customDay : customTo
  );

  const {
    data: kpi,
    isLoading: kpiLoading,
    refetch: refetchAll,
  } = useKpiSummary(from, to);

  const { data: trend = [], isLoading: trendLoading } = useRevenueTrend(from, to, period);
  const { data: topBooks = [], isLoading: topBooksLoading } = useTopBooks(from, to, 10);
  const { data: orderStatus = [], isLoading: statusLoading } = useOrdersByStatus(from, to);
  const { data: payments = [], isLoading: paymentsLoading } = usePaymentMethods(from, to);
  const { data: cities = [], isLoading: citiesLoading } = useCitiesData(from, to);
  const { data: topCustomers = [], isLoading: customersLoading } = useTopCustomers(from, to, 5);
  const { data: inventory = [], isLoading: invLoading } = useInventoryRotation(8);

  const activeCurrencySymbol =
    kpi?.currencySymbol ||
    trend[0]?.currencySymbol ||
    selectedCurrencySymbol ||
    'ج.م';

  const todayStr = new Date().toISOString().slice(0, 10);
  const fileLabel = `دار-الفتح-${period}-${todayStr}`;
  const cur = activeCurrencySymbol;

  const handleExport = (fmt: 'CSV' | 'Excel' | 'PDF') => {
    /* ── CSV ── */
    if (fmt === 'CSV') {
      const bom = '﻿';
      const headers = ['الفترة', `الإيرادات (${cur})`, `الربح (${cur})`, 'الطلبات'];
      const rows = trend.map((d) => [d.label, d.revenue, d.profit, d.orders]);
      const csv =
        bom +
        [headers, ...rows]
          .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
          .join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileLabel}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('تم تصدير CSV');
      return;
    }

    /* ── Excel ── */
    if (fmt === 'Excel') {
      const wb = XLSX.utils.book_new();

      const ws1 = XLSX.utils.aoa_to_sheet([
        ['تقرير التحليلات — دار الفتح'],
        [`الفترة: ${period}`, `الدولة: ${selectedCountry?.name ?? 'كل الدول'}`],
        [`تاريخ التصدير: ${new Date().toLocaleDateString('ar-EG')}`],
        [],
        ['المؤشر', 'القيمة'],
        ['إجمالي الإيرادات', kpi?.totalRevenue ?? 0],
        ['صافي الربح', kpi?.totalProfit ?? 0],
        ['هامش الربح %', kpi ? +kpi.profitMargin.toFixed(1) : 0],
        ['إجمالي الطلبات', kpi?.totalOrders ?? 0],
        ['متوسط قيمة الطلب', kpi ? +kpi.avgOrderValue.toFixed(0) : 0],
      ]);
      ws1['!cols'] = [{ wch: 28 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws1, 'ملخص KPI');

      const trendRows = trend.filter((d) => d.revenue > 0 || d.orders > 0);
      const ws2 = XLSX.utils.aoa_to_sheet([
        ['الفترة', `الإيرادات (${cur})`, `الربح (${cur})`, 'الطلبات'],
        ...(trendRows.length ? trendRows : trend).map((d) => [d.label, d.revenue, d.profit, d.orders]),
      ]);
      ws2['!cols'] = [{ wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws2, 'الإيرادات والأرباح');

      if (topBooks.length > 0) {
        const ws3 = XLSX.utils.aoa_to_sheet([
          ['الكتاب', 'المؤلف', 'الكميات المبيعة', `الإيرادات (${cur})`],
          ...topBooks.map((b) => [b.title, b.author, b.totalSold, b.totalRevenue]),
        ]);
        ws3['!cols'] = [{ wch: 35 }, { wch: 20 }, { wch: 15 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(wb, ws3, 'أفضل الكتب');
      }

      if (topCustomers.length > 0) {
        const ws4 = XLSX.utils.aoa_to_sheet([
          ['العميل', 'المدينة', 'الطلبات', `الإنفاق (${cur})`],
          ...topCustomers.map((c) => [c.fullName || c.email, c.city, c.totalOrders, c.totalSpent]),
        ]);
        ws4['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 12 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(wb, ws4, 'أفضل العملاء');
      }

      if (cities.length > 0) {
        const ws5 = XLSX.utils.aoa_to_sheet([
          ['المدينة', 'الطلبات', 'النسبة %', `الإيرادات (${cur})`],
          ...cities.map((c) => [c.city, c.orders, c.percentage, c.revenue]),
        ]);
        ws5['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(wb, ws5, 'توزيع المدن');
      }

      XLSX.writeFile(wb, `${fileLabel}.xlsx`);
      toast.success('تم تصدير ملف Excel بنجاح');
      return;
    }

    /* ── PDF (browser print → Save as PDF) ── */
    if (fmt === 'PDF') {
      const pw = window.open('', '_blank', 'width=900,height=700');
      if (!pw) {
        toast.error('يرجى السماح بالنوافذ المنبثقة لتصدير PDF');
        return;
      }

      const htmlRow = (cells: string[], header = false) => {
        const tag = header ? 'th' : 'td';
        return `<tr>${cells.map((c) => `<${tag}>${escapeHtml(c)}</${tag}>`).join('')}</tr>`;
      };

      const trendActive = trend.filter((d) => d.revenue > 0 || d.orders > 0);
      const trendSection = trendActive.length > 0
        ? `<table>
            ${htmlRow(['الفترة', `الإيرادات (${cur})`, `الربح (${cur})`, 'الطلبات'], true)}
            ${trendActive.map((d) => htmlRow([d.label, d.revenue.toLocaleString(), d.profit.toLocaleString(), String(d.orders)])).join('')}
           </table>`
        : '<p class="empty">لا توجد بيانات إيرادات في هذه الفترة</p>';

      const booksSection = topBooks.length > 0
        ? `<table>
            ${htmlRow(['الكتاب', 'المؤلف', 'المبيع', `الإيرادات (${cur})`], true)}
            ${topBooks.map((b) => htmlRow([b.title, b.author, String(b.totalSold), b.totalRevenue.toLocaleString()])).join('')}
           </table>`
        : '<p class="empty">لا توجد مبيعات في هذه الفترة</p>';

      const customersSection = topCustomers.length > 0
        ? `<table>
            ${htmlRow(['العميل', 'المدينة', 'الطلبات', `الإنفاق (${cur})`], true)}
            ${topCustomers.map((c) => htmlRow([c.fullName || c.email, c.city, String(c.totalOrders), c.totalSpent.toLocaleString()])).join('')}
           </table>`
        : '<p class="empty">لا توجد بيانات عملاء</p>';

      pw.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8"/>
  <title>تقرير التحليلات — دار الفتح</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Cairo',Arial,sans-serif;direction:rtl;color:#1e293b;background:#fff;padding:32px;font-size:13px}
    h1{font-size:22px;font-weight:900;color:#1d4ed8;margin-bottom:4px}
    .meta{color:#64748b;font-size:12px;margin-bottom:24px}
    .section{margin-bottom:28px}
    h2{font-size:14px;font-weight:700;color:#334155;border-right:3px solid #1d4ed8;padding-right:8px;margin-bottom:10px}
    .kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:28px}
    .kpi-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px}
    .kpi-card .num{font-size:20px;font-weight:900;color:#1d4ed8}
    .kpi-card .lbl{font-size:11px;color:#64748b;margin-top:2px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#1d4ed8;color:#fff;padding:8px 10px;text-align:right;font-weight:600}
    td{padding:7px 10px;border-bottom:1px solid #f1f5f9}
    tr:nth-child(even) td{background:#f8fafc}
    .empty{color:#94a3b8;font-style:italic;padding:12px 0}
    .footer{margin-top:32px;font-size:11px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:12px}
    @media print{body{padding:16px}}
  </style>
</head>
<body>
  <h1>تقرير التحليلات — دار الفتح</h1>
  <p class="meta">الفترة: ${escapeHtml(period)} &nbsp;|&nbsp; الدولة: ${escapeHtml(selectedCountry?.name ?? 'كل الدول')} &nbsp;|&nbsp; تاريخ التصدير: ${new Date().toLocaleDateString('ar-EG')}</p>
  <div class="kpi-grid">
    <div class="kpi-card"><div class="num">${(kpi?.totalRevenue ?? 0).toLocaleString()} ${cur}</div><div class="lbl">إجمالي الإيرادات</div></div>
    <div class="kpi-card"><div class="num">${(kpi?.totalProfit ?? 0).toLocaleString()} ${cur}</div><div class="lbl">صافي الربح</div></div>
    <div class="kpi-card"><div class="num">${kpi?.profitMargin.toFixed(1) ?? 0}٪</div><div class="lbl">هامش الربح</div></div>
    <div class="kpi-card"><div class="num">${kpi?.totalOrders ?? 0}</div><div class="lbl">إجمالي الطلبات</div></div>
    <div class="kpi-card"><div class="num">${(kpi?.avgOrderValue ?? 0).toFixed(0)} ${cur}</div><div class="lbl">متوسط قيمة الطلب</div></div>
  </div>
  <div class="section"><h2>الإيرادات والأرباح</h2>${trendSection}</div>
  <div class="section"><h2>أفضل الكتب مبيعاً</h2>${booksSection}</div>
  <div class="section"><h2>أفضل العملاء</h2>${customersSection}</div>
  <div class="footer">دار الفتح للنشر والتوزيع &copy; ${new Date().getFullYear()}</div>
  <script>setTimeout(()=>window.print(),700);<\/script>
</body>
</html>`);
      pw.document.close();
      toast.success('جارٍ فتح نافذة الطباعة — اختر "حفظ كـ PDF"');
    }
  };

  const trendChartData = useMemo(() => trend.map((d) => ({ ...d, name: d.label })), [trend]);
return (
    <Layout>
      <div className="fade-in">
        {/* ── Header ── */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="section-title">لوحة التحليلات الكاملة</h1>
            <p className="section-subtitle">
              استعلامات حقيقية من قاعدة البيانات — تُحدَّث فور تغيير الفترة الزمنية
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-xl bg-blue-50 text-blue-700">
                <Globe2 size={12} />
                {selectedCountry?.name ?? 'كل الدول'}
              </span>

              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-xl bg-gray-100 text-gray-600">
                العملة الحالية: {activeCurrencySymbol}
              </span>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            <button
              onClick={() => {
                refetchAll();
                toast.info('جارٍ تحديث البيانات...');
              }}
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <RefreshCw size={14} /> تحديث
            </button>

            {(['CSV', 'Excel', 'PDF'] as const).map((f) => (
              <button
                key={f}
                onClick={() => handleExport(f)}
                className="btn-secondary flex items-center gap-1.5 text-sm"
              >
                <Download size={14} />
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* ── Period Filters ── */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-6 flex flex-wrap gap-2 items-center">
          <Calendar size={16} className="text-gray-400 ml-1" />

          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                period === p ? 'bg-blue-700 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {p}
            </button>
          ))}

          {period === 'يوم محدد' && (
            <div className="flex items-center gap-2 mr-2">
              <input
                type="date"
                value={customDay}
                onChange={(e) => setCustomDay(e.target.value)}
                className="input-field text-sm py-1.5 h-auto w-40"
              />
            </div>
          )}

          {period === 'مخصص' && (
            <div className="flex items-center gap-2 mr-2 flex-wrap">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="input-field text-sm py-1.5 h-auto w-36"
              />
              <span className="text-gray-400 text-sm">—</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="input-field text-sm py-1.5 h-auto w-36"
              />
            </div>
          )}
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <StatCard
            label="إجمالي الإيرادات"
            value={kpi ? formatCompactMoney(kpi.totalRevenue, activeCurrencySymbol) : '—'}
            sub={kpi?.countryName ? `الدولة: ${kpi.countryName}` : undefined}
            loading={kpiLoading}
            icon={<DollarSign size={20} className="text-blue-700" />}
            color="bg-blue-50"
            trend="up"
          />

          <StatCard
            label="صافي الربح"
            value={kpi ? formatCompactMoney(kpi.totalProfit, activeCurrencySymbol) : '—'}
            loading={kpiLoading}
            icon={<TrendingUp size={20} className="text-green-600" />}
            color="bg-green-50"
            trend={kpi && kpi.totalProfit >= 0 ? 'up' : 'down'}
          />

          <StatCard
            label="هامش الربح"
            value={kpi ? `${kpi.profitMargin.toFixed(1)}٪` : '—'}
            loading={kpiLoading}
            icon={<BarChart2 size={20} className="text-amber-600" />}
            color="bg-amber-50"
          />

          <StatCard
            label="إجمالي الطلبات"
            value={kpi ? kpi.totalOrders.toLocaleString() : '—'}
            loading={kpiLoading}
            icon={<ShoppingCart size={20} className="text-indigo-600" />}
            color="bg-indigo-50"
          />

          <StatCard
            label="متوسط قيمة الطلب"
            value={kpi ? formatMoney(kpi.avgOrderValue, activeCurrencySymbol) : '—'}
            loading={kpiLoading}
            icon={<Package size={20} className="text-purple-600" />}
            color="bg-purple-50"
          />
        </div>

        {/* ── Revenue & Profit Trend ── */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-gray-800">الإيرادات والأرباح</h3>
            </div>

            <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-xl">
              {period} · {activeCurrencySymbol}
            </span>
          </div>

          {trendLoading ? (
            <ChartSkeleton />
          ) : trendChartData.length === 0 ? (
            <NoOrdersSection title="لا توجد بيانات إيرادات" onNavigate={() => navigate('/orders')} />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trendChartData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1D4ED8" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#1D4ED8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="prof" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16A34A" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#16A34A" stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fontFamily: 'Cairo' }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip currencySymbol={activeCurrencySymbol} />} />
                <Legend wrapperStyle={{ fontFamily: 'Cairo', fontSize: 13 }} />

                <Area
                  type="monotone"
                  dataKey="revenue"
                  name={`الإيرادات (${activeCurrencySymbol})`}
                  stroke="#1D4ED8"
                  fill="url(#rev)"
                  strokeWidth={2.5}
                />
                <Area
                  type="monotone"
                  dataKey="profit"
                  name={`الربح (${activeCurrencySymbol})`}
                  stroke="#16A34A"
                  fill="url(#prof)"
                  strokeWidth={2.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Trend Bar + Orders Line ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="font-bold text-gray-800 mb-4">الإيرادات حسب الفترة</h3>
            {trendLoading ? (
              <ChartSkeleton height={220} />
            ) : trendChartData.length === 0 ? (
              <NoOrdersSection title="لا توجد بيانات" onNavigate={() => navigate('/orders')} />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={trendChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: 'Cairo' }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip currencySymbol={activeCurrencySymbol} />} />
                  <Bar
                    dataKey="revenue"
                    name={`الإيرادات (${activeCurrencySymbol})`}
                    fill="#1D4ED8"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="font-bold text-gray-800 mb-4">عدد الطلبات</h3>
            {trendLoading ? (
              <ChartSkeleton height={220} />
            ) : trendChartData.length === 0 ? (
              <NoOrdersSection title="لا توجد بيانات" onNavigate={() => navigate('/orders')} />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trendChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: 'Cairo' }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip currencySymbol={activeCurrencySymbol} />} />
                  <Line
                    type="monotone"
                    dataKey="orders"
                    name="الطلبات"
                    stroke="#D4AF37"
                    strokeWidth={2.5}
                    dot={{ fill: '#D4AF37', r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ── Top 10 Books ── */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h3 className="font-bold text-gray-800">أكثر الكتب مبيعاً (Top 10)</h3>

            <select
              value={topBooksScope}
              onChange={(e) => setTopBooksScope(e.target.value as typeof topBooksScope)}
              className="input-field text-sm py-1.5 h-auto w-36"
            >
              <option>يومياً</option>
              <option>أسبوعياً</option>
              <option>شهرياً</option>
              <option>سنوياً</option>
            </select>
          </div>

          {topBooksLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : topBooks.length === 0 ? (
            <NoOrdersSection title="لا توجد مبيعات مسجّلة في هذه الفترة" onNavigate={() => navigate('/orders')} />
          ) : (
            <div className="space-y-3">
              {topBooks.map((book, i) => {
                const pct = Math.round((book.totalSold / topBooks[0].totalSold) * 100);
                const medals = ['🥇', '🥈', '🥉'];

                return (
                  <div key={book.productId} className="flex items-center gap-3">
                    <span className="w-7 h-7 text-center text-sm flex-shrink-0 flex items-center justify-center">
                      {i < 3 ? (
                        medals[i]
                      ) : (
                        <span className="font-bold text-gray-400 text-xs">{i + 1}</span>
                      )}
                    </span>

                    {book.cover_url ? (
                      <img
                        src={book.cover_url}
                        alt={book.title}
                        className="w-8 h-11 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-11 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <BookOpen size={12} className="text-gray-300" />
                      </div>
                    )}

                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1 gap-3">
                        <div className="min-w-0">
                          <span className="font-semibold text-gray-700">{book.title}</span>
                          <span className="text-xs text-gray-400 mr-2">{book.author}</span>
                        </div>

                        <div className="text-left flex-shrink-0">
                          <span className="font-bold text-gray-800 block">
                            {book.totalSold.toLocaleString()} نسخة
                          </span>
                          <span className="text-xs text-blue-600">
                            {formatMoney(book.totalRevenue, activeCurrencySymbol)}
                          </span>
                        </div>
                      </div>

                      <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            background:
                              i === 0
                                ? '#D4AF37'
                                : i === 1
                                ? '#1D4ED8'
                                : i === 2
                                ? '#F97316'
                                : '#60A5FA',
                          }}
                        />
                      </div>
                    </div>

                    <span className="text-xs font-bold text-gray-500 w-10 text-left flex-shrink-0">
                      {pct}٪
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Donut: Order Status + Payment Methods ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Order Status */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="font-bold text-gray-800 mb-4">توزيع حالات الطلبات</h3>
            {statusLoading ? (
              <ChartSkeleton height={180} />
            ) : orderStatus.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400 gap-2">
                <ShoppingCart size={28} className="text-gray-200" />
                <p className="text-sm text-gray-500">لا توجد طلبات في هذه الفترة</p>
                <button
                  onClick={() => navigate('/orders')}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  <ArrowLeft size={11} /> انتقل لإدارة الطلبات
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie
                      data={orderStatus}
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={78}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {orderStatus.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => [`${v}٪`, '']} />
                  </PieChart>
                </ResponsiveContainer>

                <div className="space-y-2 flex-1">
                  {orderStatus.map((d, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ background: d.color }}
                        />
                        <span className="text-sm text-gray-600">{d.name}</span>
                      </div>
                      <span className="text-sm font-bold text-gray-800">{d.value}٪</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Payment Methods */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="font-bold text-gray-800 mb-4">طرق الدفع</h3>
            {paymentsLoading ? (
              <ChartSkeleton height={180} />
            ) : payments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400 gap-2">
                <DollarSign size={28} className="text-gray-200" />
                <p className="text-sm text-gray-500">لا توجد بيانات دفع في هذه الفترة</p>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie
                      data={payments}
                      cx="50%"
                      cy="50%"
                      outerRadius={78}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {payments.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => [`${v}٪`, '']} />
                  </PieChart>
                </ResponsiveContainer>

                <div className="space-y-2 flex-1">
                  {payments.map((d, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ background: d.color }}
                        />
                        <span className="text-sm text-gray-600">{d.name}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${d.value}%`, background: d.color }}
                          />
                        </div>
                        <span className="text-xs font-bold text-gray-700 w-8 text-right">
                          {d.value}٪
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Cities + Top Customers ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Cities */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-800">المحافظات الأعلى طلباً</h3>
            </div>

            <div className="p-5">
              {citiesLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-8 bg-gray-100 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : cities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-gray-400 gap-2">
                  <BarChart2 size={28} className="text-gray-200" />
                  <p className="text-sm text-gray-500">لا توجد بيانات جغرافية في هذه الفترة</p>
                  <p className="text-xs text-gray-400">ستظهر المحافظات هنا عند تسجيل أول طلب بعنوان</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cities.map((city, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-gray-700">{city.city}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-gray-500">{city.orders.toLocaleString()} طلب</span>
                          <span className="font-bold text-blue-700 w-10 text-right">
                            {city.percentage}٪
                          </span>
                        </div>
                      </div>

                      <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${city.percentage}%`,
                            background: PIE_COLORS[i % PIE_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Top Customers */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-800">أفضل العملاء إنفاقاً</h3>
            </div>

            <div className="divide-y divide-gray-50">
              {customersLoading ? (
                <div className="p-5 space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : topCustomers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
                  <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center">
                    <Users size={24} className="text-gray-300" />
                  </div>
                  <p className="text-sm font-medium text-gray-500">لا توجد بيانات عملاء</p>
                  <p className="text-xs text-gray-400 text-center max-w-[200px]">
                    بيانات أفضل العملاء تظهر تلقائياً بعد تسجيل أول طلب
                  </p>
                  <button
                    onClick={() => navigate('/customers')}
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <ArrowLeft size={11} /> عرض قائمة العملاء
                  </button>
                </div>
              ) : (
                topCustomers.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50">
                    <span
                      className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {i + 1}
                    </span>

                    {c.avatar ? (
                      <img src={c.avatar} alt={c.fullName} className="w-9 h-9 rounded-full flex-shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-blue-700 font-bold text-sm">{c.fullName.charAt(0)}</span>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{c.fullName}</p>
                      <p className="text-xs text-gray-400">
                        {c.city} · {c.totalOrders} طلب
                      </p>
                    </div>

                    <p className="text-sm font-bold text-blue-700">
                      {formatMoney(c.totalSpent, activeCurrencySymbol)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Inventory Analysis ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Fast-moving books */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <TrendingUp size={16} className="text-green-600" />
              أكثر الكتب دوراناً
            </h3>

            {invLoading ? (
              <ChartSkeleton height={200} />
            ) : inventory.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={inventory} layout="vertical" margin={{ right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis
                    dataKey="title"
                    type="category"
                    tick={{ fontSize: 11, fontFamily: 'Cairo' }}
                    width={90}
                    tickFormatter={(v) => (v.length > 10 ? v.slice(0, 10) + '…' : v)}
                  />
                  <Tooltip content={<CustomTooltip currencySymbol={activeCurrencySymbol} />} />
                  <Bar dataKey="totalSold" name="مبيع" fill="#1D4ED8" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Low stock / stagnant */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <TrendingDown size={16} className="text-amber-600" />
              الكتب الراكدة / منخفضة المخزون
            </h3>

            {invLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {inventory
                  .filter((b) => b.totalStock > 0 && b.totalSold < 20)
                  .map((b, i) => (
                    <div
                      key={`stale-${i}`}
                      className="flex items-center justify-between bg-amber-50 rounded-xl p-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{b.title}</p>
                        <p className="text-xs text-gray-500">
                          مخزون: {b.totalStock} · مباع: {b.totalSold}
                        </p>
                      </div>

                      <span className="text-xs font-semibold px-2.5 py-1 rounded-xl bg-amber-100 text-amber-700">
                        راكد
                      </span>
                    </div>
                  ))}

                {inventory
                  .filter((b) => b.totalStock > 0 && b.totalStock <= 5)
                  .map((b, i) => (
                    <div
                      key={`low-${i}`}
                      className="flex items-center justify-between bg-red-50 rounded-xl p-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{b.title}</p>
                        <p className="text-xs text-red-500 font-semibold">
                          مخزون منخفض: {b.totalStock} نسخة
                        </p>
                      </div>

                      <button
                        onClick={() => toast.success(`طلب توريد: ${b.title}`)}
                        className="text-xs font-semibold px-2.5 py-1 rounded-xl bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                      >
                        توريد
                      </button>
                    </div>
                  ))}

                {inventory.filter(
                  (b) =>
                    (b.totalStock > 0 && b.totalSold < 20) ||
                    (b.totalStock > 0 && b.totalStock <= 5)
                ).length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <AlertCircle size={28} className="text-gray-200 mx-auto mb-2" />
                    <p className="text-sm">لا توجد كتب تحتاج مراجعة</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}