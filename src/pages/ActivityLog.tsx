import { useState } from 'react';
import Layout from '@/components/layout/Layout';
import ReportDownloadButton from '@/components/reports/ReportDownloadButton';
import { buildActivityReport, type ActivityLogRow } from '@/lib/reports/builders/activity';
import { fmtDateOnlyIso } from '@/lib/reports/format';
import {
  Plus, Edit, Trash2, LogIn, LogOut, Filter,
  Search, Calendar, RefreshCw, Loader2, AlertCircle,
  ChevronDown, ChevronRight, Database, X, FileText,
  ArrowUpRight, ArrowDownRight, Globe2
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { useCountry } from '@/contexts/CountryContext';

interface AuditLog {
  id: string;
  user_id?: string | null;
  user_email?: string | null;
  action: string;
  table_name?: string | null;
  record_id?: string | null;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  ip_address?: string | null;
  created_at: string;
  profiles?: { full_name?: string | null; avatar_url?: string | null; role?: string } | null;
}

const actionConfig: Record<string, { cls: string; dotCls: string; label: string; icon: React.ReactNode }> = {
  INSERT: { cls: 'bg-green-100 text-green-700', dotCls: 'bg-green-500', label: 'إضافة', icon: <Plus size={12} /> },
  UPDATE: { cls: 'bg-amber-100 text-amber-700', dotCls: 'bg-amber-500', label: 'تعديل', icon: <Edit size={12} /> },
  DELETE: { cls: 'bg-red-100 text-red-600', dotCls: 'bg-red-500', label: 'حذف', icon: <Trash2 size={12} /> },
  LOGIN: { cls: 'bg-blue-100 text-blue-700', dotCls: 'bg-blue-500', label: 'دخول', icon: <LogIn size={12} /> },
  LOGOUT: { cls: 'bg-gray-100 text-gray-600', dotCls: 'bg-gray-400', label: 'خروج', icon: <LogOut size={12} /> },
};

const tableLabels: Record<string, string> = {
  products: 'الكتب',
  orders: 'الطلبات',
  profiles: 'المستخدمين',
  coupons: 'الكوبونات',
  categories: 'التصنيفات',
  book_series: 'السلاسل',
  product_inventory: 'المخزون',
  shipping_companies: 'شركات الشحن',
  payment_methods: 'طرق الدفع',
  countries: 'الدول',
  admin_settings: 'إعدادات المشرفين',
  store_settings: 'إعدادات المتجر',
  electronic_books: 'الكتب الإلكترونية',
  ebook_purchases: 'مشتريات الكتب',
  order_items: 'عناصر الطلبات',
  product_prices: 'أسعار المنتجات',
  product_variants: 'نسخ المنتجات',
  bundle_items: 'مجموعات الكتب',
};

const ALL_ACTIONS = ['INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT'];
const GLOBAL_TABLES = new Set(['products', 'book_series', 'categories', 'store_settings']);

interface LogFilters {
  action?: string;
  tableName?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
}

function useAuditLogs(filters: LogFilters) {
  return useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: async (): Promise<AuditLog[]> => {

      // ── جلب السجلات ────────────────────────────────────────────
      let query = supabase
        .from('audit_logs')
        .select(`
          id,
          user_id,
          user_email,
          action,
          table_name,
          record_id,
          old_data,
          new_data,
          ip_address,
          created_at,
          profiles!fk_audit_logs_profiles(full_name, avatar_url, role)
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (filters.action    && filters.action    !== 'الكل') query = query.eq('action',     filters.action);
      if (filters.tableName && filters.tableName !== 'الكل') query = query.eq('table_name', filters.tableName);
      if (filters.userId    && filters.userId    !== 'الكل') query = query.eq('user_id',    filters.userId);
      if (filters.dateFrom) query = query.gte('created_at', new Date(filters.dateFrom).toISOString());
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        to.setHours(23, 59, 59, 999);
        query = query.lte('created_at', to.toISOString());
      }

      const { data, error } = await query;

      // ── نجح الـ JOIN — أعد البيانات مباشرة ─────────────────────
      if (!error) return (data ?? []) as AuditLog[];

      // ── فشل الـ JOIN — نجلب السجلات بدونه ثم نجلب profiles منفصلاً
      console.warn('[ActivityLog] join failed, fetching separately:', error.message);

      let fallback = supabase
        .from('audit_logs')
        .select('id, user_id, user_email, action, table_name, record_id, old_data, new_data, ip_address, created_at')
        .order('created_at', { ascending: false })
        .limit(500);

      if (filters.action    && filters.action    !== 'الكل') fallback = fallback.eq('action',     filters.action);
      if (filters.tableName && filters.tableName !== 'الكل') fallback = fallback.eq('table_name', filters.tableName);
      if (filters.dateFrom) fallback = fallback.gte('created_at', new Date(filters.dateFrom).toISOString());
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        to.setHours(23, 59, 59, 999);
        fallback = fallback.lte('created_at', to.toISOString());
      }

      const { data: fbData, error: fbError } = await fallback;
      if (fbError) {
        console.error('[ActivityLog] fallback failed:', fbError.message, fbError.code);
        throw new Error(`${fbError.message} (${fbError.code ?? 'unknown'})`);
      }

      const logs = (fbData ?? []) as AuditLog[];

      // ── جلب بيانات profiles للـ user_ids الفريدة ────────────────
      const userIds = [...new Set(logs.map((l) => l.user_id).filter(Boolean))] as string[];

      if (userIds.length === 0) return logs;

      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, role')
        .in('id', userIds);

      const profilesMap = new Map(
        (profilesData ?? []).map((p) => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url, role: p.role }])
      );

      return logs.map((log) => ({
        ...log,
        profiles: log.user_id ? (profilesMap.get(log.user_id) ?? null) : null,
      }));
    },
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getPayloadCountryId(payload?: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const val = payload.country_id;
  return typeof val === 'string' ? val : null;
}

function getPayloadId(payload?: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const val = payload.id;
  return typeof val === 'string' ? val : null;
}

function logMatchesSelectedCountry(log: AuditLog, selectedCountryId?: string | null) {
  if (!selectedCountryId) return true;

  const table = log.table_name ?? '';

  if (GLOBAL_TABLES.has(table)) return true;

  if (table === 'countries') {
    const ids = [
      log.record_id ?? null,
      getPayloadId(log.old_data),
      getPayloadId(log.new_data),
    ].filter(Boolean);
    return ids.includes(selectedCountryId);
  }

  const oldCountryId = getPayloadCountryId(log.old_data);
  const newCountryId = getPayloadCountryId(log.new_data);

  if (oldCountryId || newCountryId) {
    return oldCountryId === selectedCountryId || newCountryId === selectedCountryId;
  }

  return true;
}

function DataDiff({
  oldData,
  newData,
}: {
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
}) {
  if (!oldData && !newData) return null;

  const allKeys = new Set([...Object.keys(oldData ?? {}), ...Object.keys(newData ?? {})]);
  const isUpdate = !!oldData && !!newData;
  const relevantKeys = isUpdate
    ? [...allKeys].filter(
        (k) => JSON.stringify((oldData ?? {})[k]) !== JSON.stringify((newData ?? {})[k])
      )
    : [...allKeys];

  if (relevantKeys.length === 0) {
    return <p className="text-xs text-gray-400 py-2">لا توجد تغييرات</p>;
  }

  const renderValue = (val: unknown): string => {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean') return val ? 'نعم' : 'لا';
    if (typeof val === 'object') return JSON.stringify(val).slice(0, 80);
    return String(val).slice(0, 100);
  };

  return (
    <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
      {relevantKeys.slice(0, 20).map((key) => {
        const oldVal = renderValue((oldData ?? {})[key]);
        const newVal = renderValue((newData ?? {})[key]);

        return (
          <div key={key} className="grid grid-cols-[120px_1fr] gap-2 items-start">
            <span className="text-xs font-mono text-gray-500 font-semibold truncate">{key}</span>
            <div className="flex items-start gap-1.5 min-w-0 flex-wrap">
              {oldData && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded-lg break-all">
                  <ArrowDownRight size={9} />
                  {oldVal}
                </span>
              )}
              {newData && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-lg break-all">
                  <ArrowUpRight size={9} />
                  {newVal}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {relevantKeys.length > 20 && (
        <p className="text-xs text-gray-400">...و {relevantKeys.length - 20} حقل آخر</p>
      )}
    </div>
  );
}

function LogRow({ log }: { log: AuditLog }) {
  const [expanded, setExpanded] = useState(false);

  const ac = actionConfig[log.action] ?? {
    cls: 'bg-gray-100 text-gray-600',
    dotCls: 'bg-gray-400',
    label: log.action,
    icon: <FileText size={12} />,
  };

  const tableName = tableLabels[log.table_name ?? ''] ?? log.table_name ?? '—';
  const userName = log.profiles?.full_name ?? log.user_email ?? 'النظام';
  const userSub  = log.profiles?.full_name && log.user_email ? log.user_email
                 : log.profiles?.role ?? null;
  const hasData = !!(log.old_data || log.new_data);

  return (
    <>
      <tr className="table-row">
        <td className="px-4 py-3">
          <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-xl ${ac.cls}`}>
            {ac.icon} {ac.label}
          </span>
        </td>

        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {log.profiles?.avatar_url ? (
              <img
                src={log.profiles.avatar_url}
                alt={userName}
                className="w-7 h-7 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <span className="text-indigo-700 font-bold text-xs">{userName.charAt(0)}</span>
              </div>
            )}

            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{userName}</p>
              {userSub && <p className="text-xs text-gray-400 truncate">{userSub}</p>}
            </div>
          </div>
        </td>

        <td className="px-4 py-3">
          <span className="text-sm font-semibold text-blue-700">{tableName}</span>
        </td>

        <td className="px-4 py-3">
          {log.record_id ? (
            <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded-lg">
              #{log.record_id.slice(0, 8)}
            </span>
          ) : (
            '—'
          )}
        </td>

        <td className="px-4 py-3 text-xs font-mono text-gray-400">
          {String(log.ip_address ?? '—')}
        </td>

        <td className="px-4 py-3">
          <p className="text-sm font-semibold text-gray-700">{formatDate(log.created_at)}</p>
          <p className="text-xs text-gray-400">{formatTime(log.created_at)}</p>
        </td>

        <td className="px-4 py-3">
          {hasData && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className={`p-1.5 rounded-xl transition-colors ${
                expanded ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-400'
              }`}
              title="عرض التفاصيل"
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          )}
        </td>
      </tr>

      {expanded && hasData && (
        <tr className="bg-blue-50/40">
          <td colSpan={7} className="px-6 py-4">
            <div className="flex items-center gap-2 mb-2">
              <Database size={13} className="text-blue-600" />
              <span className="text-xs font-bold text-blue-800">تفاصيل التغيير</span>
            </div>
            <DataDiff oldData={log.old_data} newData={log.new_data} />
          </td>
        </tr>
      )}
    </>
  );
}

export default function ActivityLog() {
  const qc = useQueryClient();
  const { selectedCountry } = useCountry();

  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('الكل');
  const [filterTable, setFilterTable] = useState('الكل');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const filters: LogFilters = {
    action: filterAction,
    tableName: filterTable,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };

  const { data: logs = [], isLoading, isError, error: queryError, refetch } = useAuditLogs(filters);

  const filtered = logs.filter((l) => {
    const matchCountry = logMatchesSelectedCountry(l, selectedCountry?.id);

    if (!matchCountry) return false;

    if (!search) return true;
    const q = search.toLowerCase();

    return (
      (l.profiles?.full_name ?? '').toLowerCase().includes(q) ||
      (l.user_email ?? '').toLowerCase().includes(q) ||
      (tableLabels[l.table_name ?? ''] ?? l.table_name ?? '').includes(q) ||
      (l.record_id ?? '').includes(q) ||
      String(l.ip_address ?? '').includes(q)
    );
  });

  const actionCounts = ALL_ACTIONS.reduce((acc, a) => {
    acc[a] = filtered.filter((l) => l.action === a).length;
    return acc;
  }, {} as Record<string, number>);

  const uniqueTables = [...new Set(filtered.map((l) => l.table_name).filter(Boolean))];

  const resetFilters = () => {
    setSearch('');
    setFilterAction('الكل');
    setFilterTable('الكل');
    setDateFrom('');
    setDateTo('');
  };

  const hasFilters = filterAction !== 'الكل' || filterTable !== 'الكل' || dateFrom || dateTo || search;

  // The report takes its dates from its own period picker.
  const activityFiltersActive = filterAction !== 'الكل' || filterTable !== 'الكل' || !!search;
  const activityFiltersLabel = [
    filterAction !== 'الكل' && `الإجراء: ${actionConfig[filterAction]?.label ?? filterAction}`,
    filterTable !== 'الكل' && `القسم: ${tableLabels[filterTable] ?? filterTable}`,
    search && `بحث: ${search}`,
  ].filter(Boolean).join(' · ');
  const matchesActivityFilters = (l: ActivityLogRow) => {
    if (filterAction !== 'الكل' && l.action !== filterAction) return false;
    if (filterTable !== 'الكل' && l.table_name !== filterTable) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (l.profiles?.full_name ?? '').toLowerCase().includes(q) ||
      (l.user_email ?? '').toLowerCase().includes(q) ||
      (tableLabels[l.table_name ?? ''] ?? l.table_name ?? '').includes(q) ||
      (l.record_id ?? '').includes(q) ||
      String(l.ip_address ?? '').includes(q)
    );
  };

  return (
    <Layout>
      <div className="fade-in" dir="rtl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="section-title">سجل النشاط</h1>
            <p className="section-subtitle">
              متابعة العمليات في النظام — السجلات العامة + السجلات المرتبطة بـ {selectedCountry?.name ?? 'الدولة الحالية'} عند توفر country_id
            </p>

            <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-xl bg-blue-50 text-blue-700">
              <Globe2 size={12} />
              {selectedCountry?.name ?? 'كل الدول'}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                refetch();
                toast.info('جارٍ التحديث...');
              }}
              className="p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 transition-colors"
              title="تحديث"
            >
              <RefreshCw size={16} />
            </button>

            <button
              onClick={() => setShowFilters((f) => !f)}
              className={`btn-secondary flex items-center gap-2 text-sm ${showFilters ? 'bg-blue-50 text-blue-700 border-blue-200' : ''}`}
            >
              <Filter size={14} />
              فلترة
              {hasFilters && (
                <span className="w-4 h-4 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center">!</span>
              )}
            </button>

            <ReportDownloadButton
              title="تقرير سجل النشاط"
              periodHint="كل العمليات المسجلة خلال الفترة، مع ملخص نشاط كل مستخدم وكل قسم."
              defaultPeriod={
                dateFrom
                  ? { preset: 'custom', from: dateFrom, to: dateTo || fmtDateOnlyIso(new Date()) }
                  : { preset: 'last7' }
              }
              filters={{ active: activityFiltersActive, label: activityFiltersLabel }}
              build={({ period, generatedAt, applyFilters }) =>
                buildActivityReport(
                  { period, generatedAt, country: selectedCountry, currencySymbol: '' },
                  {
                    actionLabel: (a) => actionConfig[a]?.label ?? a,
                    tableLabel: (t) => tableLabels[t ?? ''] ?? t ?? '—',
                    predicate: (l) => logMatchesSelectedCountry(l, selectedCountry?.id) && (!applyFilters || matchesActivityFilters(l)),
                    applyFilters,
                    filtersLabel: activityFiltersLabel,
                  }
                )
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mb-6">
          {ALL_ACTIONS.map((action) => {
            const ac = actionConfig[action];
            const isActive = filterAction === action;

            return (
              <button
                key={action}
                onClick={() => setFilterAction(isActive ? 'الكل' : action)}
                className={`bg-white rounded-2xl p-3 shadow-sm text-center transition-all hover:shadow-md ${
                  isActive ? `ring-2 ring-current ${ac.cls}` : ''
                }`}
              >
                <div className={`w-9 h-9 ${ac.cls} rounded-xl mx-auto flex items-center justify-center mb-1.5`}>
                  {ac.icon}
                </div>
                <p className="text-lg font-bold text-gray-800">
                  {isLoading ? '—' : actionCounts[action] ?? 0}
                </p>
                <p className="text-xs text-gray-500">{ac.label}</p>
              </button>
            );
          })}
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <div className="relative">
            <input
              type="text"
              placeholder="ابحث بالمستخدم، الجدول، رقم السجل، أو IP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pr-10"
            />
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>

          {showFilters && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3 pt-3 border-t border-gray-100">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">نوع العملية</label>
                <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} className="input-field text-sm py-2 h-auto">
                  <option value="الكل">الكل</option>
                  {ALL_ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {actionConfig[a]?.label ?? a}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">الجدول</label>
                <select value={filterTable} onChange={(e) => setFilterTable(e.target.value)} className="input-field text-sm py-2 h-auto">
                  <option value="الكل">الكل</option>
                  {uniqueTables.map((t) => (
                    <option key={t!} value={t!}>
                      {tableLabels[t!] ?? t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">من تاريخ</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-field text-sm py-2 h-auto" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">إلى تاريخ</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-field text-sm py-2 h-auto" />
              </div>

              <div className="flex items-end">
                <button onClick={resetFilters} className="btn-secondary w-full text-sm flex items-center justify-center gap-1.5">
                  <X size={13} /> إعادة تعيين
                </button>
              </div>
            </div>
          )}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
            <Loader2 size={26} className="animate-spin" />
            <span>جارٍ تحميل سجل النشاط...</span>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-amber-500">
            <AlertCircle size={32} />
            <span className="font-semibold">لا يمكن تحميل سجل النشاط</span>
            {queryError instanceof Error && (
              <p className="text-xs font-mono bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-2 max-w-md text-center break-all">
                {queryError.message}
              </p>
            )}
            <div className="text-sm text-gray-400 text-center max-w-sm space-y-1 mt-1">
              <p>إذا ظهر خطأ <strong className="text-gray-600">PGRST200</strong> أو <strong className="text-gray-600">relation not found</strong>:</p>
              <p>اذهب إلى لوحة Supabase ← <strong className="text-gray-600">Project Settings → API</strong> ← اضغط <strong className="text-gray-600">Reload Schema Cache</strong></p>
            </div>
            <button
              onClick={() => refetch()}
              className="mt-2 btn-secondary text-sm flex items-center gap-2"
            >
              <RefreshCw size={14} /> إعادة المحاولة
            </button>
          </div>
        )}

        {!isLoading && !isError && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-gray-500">
                {filtered.length} سجل{hasFilters && ' (مفلتر)'}
              </p>

              {hasFilters && (
                <button
                  onClick={resetFilters}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  <X size={11} /> إلغاء الفلاتر
                </button>
              )}
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <FileText size={40} className="text-gray-200 mx-auto mb-3" />
                <p className="font-semibold text-gray-500">لا توجد سجلات</p>
                <p className="text-sm mt-1">لا توجد سجلات مطابقة للدولة الحالية أو الفلاتر</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="table-header">
                      <th className="text-right px-4 py-3 font-semibold">العملية</th>
                      <th className="text-right px-4 py-3 font-semibold">المستخدم</th>
                      <th className="text-right px-4 py-3 font-semibold">الجدول</th>
                      <th className="text-right px-4 py-3 font-semibold">رقم السجل</th>
                      <th className="text-right px-4 py-3 font-semibold">عنوان IP</th>
                      <th className="text-right px-4 py-3 font-semibold">التاريخ والوقت</th>
                      <th className="text-right px-4 py-3 font-semibold">تفاصيل</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filtered.map((log) => (
                      <LogRow key={log.id} log={log} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
