import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useState } from 'react';
import { Loader2, BarChart2 } from 'lucide-react';
import { useCountry } from '@/contexts/CountryContext';
import {
  getPeriodRange,
  useRevenueTrend,
  useTopBooks,
  useCitiesData,
} from '@/hooks/useAnalytics';

const COLORS = ['#1D4ED8', '#D4AF37', '#16A34A', '#F59E0B', '#DC2626', '#8B5CF6'];

function EmptyMini({ text }: { text: string }) {
  return (
    <div className="h-[220px] flex flex-col items-center justify-center text-gray-400">
      <BarChart2 size={28} className="text-gray-200 mb-2" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

function SalesChart() {
  const [period, setPeriod] = useState<'weekly' | 'monthly'>('weekly');
  const { currencySymbol } = useCountry();

  const [from, to] =
    period === 'weekly'
      ? getPeriodRange('هذا الأسبوع')
      : getPeriodRange('هذا الشهر');

  const { data = [], isLoading } = useRevenueTrend(
    from,
    to,
    period === 'weekly' ? 'هذا الأسبوع' : 'هذا الشهر'
  );

  const key = 'label';

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-gray-800">تحليل المبيعات</h3>
          <p className="text-xs text-gray-400 mt-0.5">إجمالي المبيعات والطلبات حسب الدولة المختارة</p>
        </div>

        <div className="flex items-center bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setPeriod('weekly')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
              period === 'weekly' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500'
            }`}
          >
            أسبوعي
          </button>
          <button
            onClick={() => setPeriod('monthly')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
              period === 'monthly' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500'
            }`}
          >
            شهري
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-[220px] flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-gray-300" />
        </div>
      ) : data.length === 0 ? (
        <EmptyMini text="لا توجد مبيعات لهذه الدولة في هذه الفترة" />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="salesGradientLive" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#1D4ED8" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#1D4ED8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey={key} tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: 'none',
                borderRadius: '12px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                fontSize: '13px',
              }}
              formatter={(value: number, name: string) => {
                if (name === 'الطلبات') return [`${value.toLocaleString('ar-SA')} طلب`, name];
                return [`${value.toLocaleString('ar-SA')} ${currencySymbol}`, name];
              }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              name="المبيعات"
              stroke="#1D4ED8"
              strokeWidth={2.5}
              fill="url(#salesGradientLive)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function TopBooksChart() {
  const { currencySymbol } = useCountry();
  const [from, to] = getPeriodRange('هذا الشهر');
  const { data = [], isLoading } = useTopBooks(from, to, 5);

  const chartData = data.map((book) => ({
    name: book.title.length > 10 ? `${book.title.slice(0, 10)}…` : book.title,
    value: book.totalSold,
    revenue: book.totalRevenue,
  }));

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <div className="mb-4">
        <h3 className="font-bold text-gray-800">أكثر الكتب مبيعاً</h3>
        <p className="text-xs text-gray-400 mt-0.5">إجمالي المبيعات لكل كتاب في الدولة الحالية</p>
      </div>

      {isLoading ? (
        <div className="h-[220px] flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-gray-300" />
        </div>
      ) : chartData.length === 0 ? (
        <EmptyMini text="لا توجد بيانات مبيعات كتب" />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={80} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: 'none',
                borderRadius: '12px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                fontSize: '13px',
              }}
              formatter={(value: number, name: string, props: { dataKey?: unknown }) => {
                if (props?.dataKey === 'value') return [`${value.toLocaleString('ar-SA')} نسخة`, 'المبيعات'];
                if (props?.dataKey === 'revenue') return [`${value.toLocaleString('ar-SA')} ${currencySymbol}`, 'الإيراد'];
                return [value, name];
              }}
            />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} fill="#1D4ED8">
              {chartData.map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function CitiesChart() {
  const [from, to] = getPeriodRange('هذا الشهر');
  const { data = [], isLoading } = useCitiesData(from, to);

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <div className="mb-4">
        <h3 className="font-bold text-gray-800">المحافظات / المدن الأعلى طلباً</h3>
        <p className="text-xs text-gray-400 mt-0.5">التوزيع حسب الدولة الحالية</p>
      </div>

      {isLoading ? (
        <div className="h-[160px] flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-gray-300" />
        </div>
      ) : data.length === 0 ? (
        <EmptyMini text="لا توجد مدن أو محافظات لهذه الدولة" />
      ) : (
        <div className="flex items-center gap-4">
          <ResponsiveContainer width="40%" height={160}>
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="orders" paddingAngle={2}>
                {data.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: 'none',
                  borderRadius: '12px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                  fontSize: '12px',
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="flex-1 space-y-2">
            {data.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <span className="text-xs text-gray-600 flex-1">{item.city}</span>
                <div className="flex items-center gap-1">
                  <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${item.percentage}%`, backgroundColor: COLORS[i % COLORS.length] }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-gray-700 w-8">{item.percentage}٪</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OrdersBarChart() {
  const [from, to] = getPeriodRange('هذا الأسبوع');
  const { data = [], isLoading } = useRevenueTrend(from, to, 'هذا الأسبوع');

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <div className="mb-4">
        <h3 className="font-bold text-gray-800">الطلبات الأسبوعية</h3>
        <p className="text-xs text-gray-400 mt-0.5">عدد الطلبات في الدولة الحالية</p>
      </div>

      {isLoading ? (
        <div className="h-[160px] flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-gray-300" />
        </div>
      ) : data.length === 0 ? (
        <EmptyMini text="لا توجد طلبات هذا الأسبوع" />
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: 'none',
                borderRadius: '12px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                fontSize: '13px',
              }}
              formatter={(value: number) => [`${value} طلب`, 'الطلبات']}
            />
            <Bar dataKey="orders" fill="#D4AF37" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default function ChartsSection() {
  return (
    <div className="mt-6 space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <SalesChart />
        </div>
        <TopBooksChart />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CitiesChart />
        <OrdersBarChart />
      </div>
    </div>
  );
}