import { useState } from 'react';
import { escapeHtml } from '@/lib/utils';
import * as XLSX from 'xlsx';
import Layout from '@/components/layout/Layout';
import {
  AlertTriangle, Package, TrendingDown, RefreshCw, Search,
  Download, Bell, BookOpen, BarChart2, ChevronUp, ChevronDown,
  X, Loader2, AlertCircle, Edit2, Check, Minus, Plus, Layers, Globe2
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  useInventory, useUpdateStock,
  exportInventoryCsv,
  type EnrichedInventoryRow, type AlertLevel,
} from '@/hooks/useInventory';
import { useCountry } from '@/contexts/CountryContext';

/* ── Alert config ── */
const alertConfig: Record<AlertLevel, { cls: string; bar: string; dot: string }> = {
  'حرج': { cls: 'bg-red-100 text-red-600', bar: 'bg-red-500', dot: 'bg-red-500' },
  'منخفض': { cls: 'bg-amber-100 text-amber-700', bar: 'bg-amber-500', dot: 'bg-amber-500' },
  'جيد': { cls: 'bg-green-100 text-green-700', bar: 'bg-green-500', dot: 'bg-green-500' },
  'رقمي': { cls: 'bg-purple-100 text-purple-700', bar: 'bg-purple-500', dot: 'bg-purple-500' },
};

type SortKey = 'title' | 'stock' | 'available' | 'reserved' | 'min_stock';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
}

interface StockEditorProps {
  row: EnrichedInventoryRow;
  onClose: () => void;
}

function StockEditor({ row, onClose }: StockEditorProps) {
  const updateMutation = useUpdateStock();
  const [stock, setStock] = useState(row.stock);
  const [minStock, setMinStock] = useState(row.min_stock);
  const isDigital = row.isDigital || row.product_variants?.variant_type === 'رقمي';

  const handleSave = async () => {
    if (stock < 0) {
      toast.error('الكمية لا يمكن أن تكون سالبة');
      return;
    }
    if (minStock < 0) {
      toast.error('الحد الأدنى لا يمكن أن يكون سالباً');
      return;
    }

    await updateMutation.mutateAsync({
      id: row.id,
      product_id: row.product_id,
      variant_id: row.variant_id ?? null,
      country_id: row.country_id,
      stock,
      min_stock: minStock,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-gray-800 text-base">تعديل المخزون</h3>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-3 mb-5 bg-gray-50 rounded-xl p-3">
          {row.products?.cover_url ? (
            <img
              src={row.products.cover_url}
              alt={row.products.title}
              className="w-10 h-14 rounded-lg object-cover flex-shrink-0 shadow-sm"
            />
          ) : (
            <div className="w-10 h-14 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
              <BookOpen size={14} className="text-gray-400" />
            </div>
          )}

          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-800 truncate">{row.products?.title}</p>
            <p className="text-xs text-gray-500">{row.products?.author}</p>
            {row.product_variants?.variant_name && (
              <p className="text-xs text-blue-600 font-semibold mt-0.5">{row.product_variants.variant_name}</p>
            )}
            <p className="text-xs text-gray-400">{row.countries?.name}</p>
          </div>
        </div>

        {isDigital ? (
          <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4 text-sm text-purple-700 font-semibold">
            هذه نسخة رقمية، لذلك لا يوجد لها مخزون فعلي. تظهر في إدارة المخزون كـ "غير محدود" فقط.
          </div>
        ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">المخزون الفعلي</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setStock((s) => Math.max(0, s - 1))}
                className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
              >
                <Minus size={16} className="text-gray-600" />
              </button>

              <input
                type="number"
                value={stock}
                onChange={(e) => setStock(Math.max(0, parseInt(e.target.value) || 0))}
                className="input-field text-center text-lg font-bold flex-1"
                min={0}
              />

              <button
                onClick={() => setStock((s) => s + 1)}
                className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
              >
                <Plus size={16} className="text-gray-600" />
              </button>
            </div>

            <p className="text-xs text-gray-400 mt-1">
              محجوز: {row.reserved_stock} · متاح: {Math.max(0, stock - row.reserved_stock)}
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">الحد الأدنى للتنبيه</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMinStock((s) => Math.max(0, s - 1))}
                className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
              >
                <Minus size={16} className="text-gray-600" />
              </button>

              <input
                type="number"
                value={minStock}
                onChange={(e) => setMinStock(Math.max(0, parseInt(e.target.value) || 0))}
                className="input-field text-center flex-1"
                min={0}
              />

              <button
                onClick={() => setMinStock((s) => s + 1)}
                className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
              >
                <Plus size={16} className="text-gray-600" />
              </button>
            </div>
          </div>
        </div>

        )}

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">إلغاء</button>
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending || isDigital}
            className="btn-primary flex-1 flex items-center justify-center gap-1.5"
          >
            {updateMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            {updateMutation.isPending ? 'جارٍ الحفظ...' : 'حفظ'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Inventory() {
  const qc = useQueryClient();
  const { selectedCountry, currencySymbol } = useCountry();
  const { data: rows = [], isLoading, isError } = useInventory();

  const [search, setSearch] = useState('');
  const [filterAlert, setFilterAlert] = useState('الكل');
  const [filterType, setFilterType] = useState('الكل');
  const [sortKey, setSortKey] = useState<SortKey>('available');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showAlertBanner, setShowAlertBanner] = useState(true);
  const [editingRow, setEditingRow] = useState<EnrichedInventoryRow | null>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortBtn = ({ col }: { col: SortKey }) => (
    <span
      className="inline-flex flex-col items-center mr-0.5 opacity-50 hover:opacity-100 cursor-pointer"
      onClick={() => handleSort(col)}
    >
      <ChevronUp size={10} className={sortKey === col && sortDir === 'asc' ? 'text-blue-600 opacity-100' : ''} />
      <ChevronDown size={10} className={sortKey === col && sortDir === 'desc' ? 'text-blue-600 opacity-100' : ''} />
    </span>
  );

  const filtered = rows
    .filter((r) => {
      const q = search.trim().toLowerCase();
      const matchQ =
        !q ||
        (r.products?.title ?? '').toLowerCase().includes(q) ||
        (r.products?.author ?? '').toLowerCase().includes(q) ||
        (r.product_variants?.variant_name ?? '').toLowerCase().includes(q);

      const matchAlert = filterAlert === 'الكل' || r.alertLevel === filterAlert;
      const rowType = r.product_variants?.variant_type ?? r.products?.type;
      const matchType = filterType === 'الكل' || rowType === filterType;

      return matchQ && matchAlert && matchType;
    })
    .sort((a, b) => {
      let diff = 0;
      if (sortKey === 'title') diff = (a.products?.title ?? '').localeCompare(b.products?.title ?? '');
      else if (sortKey === 'stock') diff = a.stock - b.stock;
      else if (sortKey === 'available') diff = a.availableStock - b.availableStock;
      else if (sortKey === 'reserved') diff = a.reserved_stock - b.reserved_stock;
      else if (sortKey === 'min_stock') diff = a.min_stock - b.min_stock;

      return sortDir === 'asc' ? diff : -diff;
    });

  const critical = rows.filter((r) => r.alertLevel === 'حرج');
  const low = rows.filter((r) => r.alertLevel === 'منخفض');
  const digital = rows.filter((r) => r.alertLevel === 'رقمي');

  const handleExport = (fmt: 'CSV' | 'Excel' | 'PDF') => {
    if (fmt === 'CSV') {
      exportInventoryCsv(filtered);
      toast.success('تم تصدير CSV');
      return;
    }

    if (fmt === 'Excel') {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ['الكتاب', 'المؤلف', 'النوع', 'الدولة', 'المخزون الكلي', 'المتاح', 'المحجوز', 'الحد الأدنى', 'التنبيه'],
        ...filtered.map((r) => [
          r.products?.title ?? '—',
          r.products?.author ?? '—',
          r.product_variants?.variant_type ?? r.products?.type ?? '—',
          r.countries?.name ?? '—',
          r.stock,
          r.availableStock,
          r.reserved_stock,
          r.min_stock,
          r.alertLevel,
        ]),
      ]);
      ws['!cols'] = [{ wch: 35 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws, 'المخزون');
      XLSX.writeFile(wb, `مخزون-دار-الفتح-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('تم تصدير Excel');
      return;
    }

    if (fmt === 'PDF') {
      const pw = window.open('', '_blank', 'width=900,height=700');
      if (!pw) { toast.error('يرجى السماح بالنوافذ المنبثقة'); return; }
      const rows = filtered.map((r) => `
        <tr>
          <td>${escapeHtml(r.products?.title ?? '—')}</td>
          <td>${escapeHtml(r.products?.author ?? '—')}</td>
          <td>${escapeHtml(r.product_variants?.variant_type ?? r.products?.type ?? '—')}</td>
          <td>${r.stock}</td>
          <td>${r.availableStock}</td>
          <td>${r.reserved_stock}</td>
          <td>${r.min_stock}</td>
          <td class="alert-${r.alertLevel}">${r.alertLevel}</td>
        </tr>`).join('');
      pw.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"/>
        <title>تقرير المخزون</title>
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
          .alert-حرج{color:#dc2626;font-weight:700}
          .alert-منخفض{color:#d97706;font-weight:700}
          .alert-جيد{color:#16a34a}
          .alert-رقمي{color:#7c3aed}
          @media print{body{padding:12px}}
        </style></head><body>
        <h1>تقرير المخزون — دار الفتح</h1>
        <p class="meta">إجمالي السجلات: ${filtered.length} · ${selectedCountry?.name ?? 'كل الدول'} · ${new Date().toLocaleDateString('ar-EG')}</p>
        <table>
          <tr><th>الكتاب</th><th>المؤلف</th><th>النوع</th><th>الكلي</th><th>المتاح</th><th>المحجوز</th><th>الحد الأدنى</th><th>التنبيه</th></tr>
          ${rows}
        </table>
        <script>setTimeout(()=>window.print(),600);<\/script></body></html>`);
      pw.document.close();
      toast.success('جارٍ فتح نافذة الطباعة — اختر "حفظ كـ PDF"');
    }
  };

  return (
    <Layout>
      <div className="fade-in" dir="rtl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="section-title">إدارة المخزون</h1>
            <p className="section-subtitle">
              متابعة كميات المخزون والمحجوز والتنبيهات — {selectedCountry?.name ? `مخزون ${selectedCountry.name}` : 'بيانات حقيقية من Supabase'}
            </p>

            <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-xl bg-blue-50 text-blue-700">
              <Globe2 size={12} />
              {selectedCountry?.name ?? 'كل الدول'} · {currencySymbol}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                qc.invalidateQueries({ queryKey: ['inventory'] });
                toast.info('جارٍ التحديث...');
              }}
              className="p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 transition-colors"
              title="تحديث"
            >
              <RefreshCw size={16} />
            </button>

            <button onClick={() => handleExport('CSV')} className="btn-secondary flex items-center gap-1.5 text-sm">
              <Download size={14} /> CSV
            </button>
            <button onClick={() => handleExport('Excel')} className="btn-secondary flex items-center gap-1.5 text-sm">
              <Download size={14} /> Excel
            </button>
            <button onClick={() => handleExport('PDF')} className="btn-secondary flex items-center gap-1.5 text-sm">
              <Download size={14} /> PDF
            </button>

            <button
              onClick={() => toast.success('تم إرسال طلب التوريد الجماعي')}
              className="btn-primary flex items-center gap-2"
            >
              <RefreshCw size={15} />
              طلب توريد
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {[
            {
              label: 'إجمالي السجلات',
              value: rows.length,
              color: 'text-blue-700',
              bg: 'bg-blue-50',
              icon: <Package size={18} className="text-blue-600" />,
              filter: 'الكل',
            },
            {
              label: 'منخفض المخزون',
              value: low.length,
              color: 'text-amber-700',
              bg: 'bg-amber-50',
              icon: <TrendingDown size={18} className="text-amber-600" />,
              filter: 'منخفض',
            },
            {
              label: 'نافد / حرج',
              value: critical.length,
              color: 'text-red-600',
              bg: 'bg-red-50',
              icon: <AlertTriangle size={18} className="text-red-500" />,
              filter: 'حرج',
            },
            {
              label: 'الكتب الرقمية',
              value: digital.length,
              color: 'text-purple-700',
              bg: 'bg-purple-50',
              icon: <BookOpen size={18} className="text-purple-600" />,
              filter: 'رقمي',
            },
            {
              label: 'الكتب الجيدة',
              value: rows.filter((r) => r.alertLevel === 'جيد').length,
              color: 'text-green-700',
              bg: 'bg-green-50',
              icon: <BarChart2 size={18} className="text-green-600" />,
              filter: 'جيد',
            },
          ].map((s, i) => (
            <button
              key={i}
              onClick={() => setFilterAlert(s.filter)}
              className={`bg-white rounded-2xl p-4 shadow-sm text-center transition-all hover:shadow-md ${
                filterAlert === s.filter ? 'ring-2 ring-blue-400' : ''
              }`}
            >
              {isLoading ? (
                <div className="w-10 h-10 bg-gray-100 rounded-xl mx-auto animate-pulse mb-2" />
              ) : (
                <div className={`w-10 h-10 ${s.bg} rounded-xl mx-auto flex items-center justify-center mb-2`}>
                  {s.icon}
                </div>
              )}

              {isLoading ? (
                <div className="h-7 bg-gray-100 rounded-lg animate-pulse mx-auto w-12 mb-1" />
              ) : (
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              )}

              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </button>
          ))}
        </div>

        {!isLoading && showAlertBanner && critical.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bell size={18} className="text-red-500" />
                <h3 className="font-bold text-red-700">
                  تنبيه: {critical.length} سجل يحتاج توريد فوري
                </h3>
              </div>

              <button
                onClick={() => setShowAlertBanner(false)}
                className="p-1 rounded-lg hover:bg-red-100 text-red-400"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {critical.slice(0, 6).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between bg-white rounded-xl p-3 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    {r.products?.cover_url ? (
                      <img
                        src={r.products.cover_url}
                        alt={r.products.title}
                        className="w-8 h-11 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-11 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                        <BookOpen size={12} className="text-red-400" />
                      </div>
                    )}

                    <div>
                      <p className="text-sm font-semibold text-gray-800 truncate max-w-[160px]">
                        {r.products?.title}
                      </p>
                      <p className="text-xs text-red-500 font-semibold">
                        متاح: {r.availableStock} · محجوز: {r.reserved_stock}
                      </p>
                      <p className="text-xs text-gray-400">{r.countries?.name}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => setEditingRow(r)}
                    className="text-xs btn-primary py-1.5 px-3 flex-shrink-0"
                  >
                    تحديث
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isLoading && low.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown size={16} className="text-amber-600" />
              <h3 className="font-semibold text-amber-700">
                {low.length} سجل بمخزون منخفض (أقل من الحد الأدنى)
              </h3>
            </div>

            <div className="flex flex-wrap gap-2">
              {low.slice(0, 10).map((r) => (
                <button
                  key={r.id}
                  onClick={() => setEditingRow(r)}
                  className="flex items-center gap-1.5 bg-white border border-amber-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                  {r.products?.title} ({r.availableStock}) — {r.countries?.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="ابحث باسم الكتاب أو المؤلف أو النسخة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pr-10"
            />
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>

          <select value={filterAlert} onChange={(e) => setFilterAlert(e.target.value)} className="input-field md:w-36">
            <option value="الكل">كل الحالات</option>
            <option value="حرج">حرج</option>
            <option value="منخفض">منخفض</option>
            <option value="جيد">جيد</option>
            <option value="رقمي">رقمي</option>
          </select>

          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input-field md:w-40">
            <option>الكل</option>
            <option>مادي</option>
            <option>رقمي</option>
          </select>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
            <Loader2 size={26} className="animate-spin" />
            <span>جارٍ تحميل بيانات المخزون...</span>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-red-400">
            <AlertCircle size={32} />
            <span>تعذّر تحميل بيانات المخزون</span>
          </div>
        )}

        {!isLoading && !isError && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-gray-500">{filtered.length} سجل مخزون</p>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                {(['حرج', 'منخفض', 'جيد', 'رقمي'] as AlertLevel[]).map((a) => (
                  <span key={a} className="flex items-center gap-1">
                    <span className={`w-2.5 h-2.5 rounded-full ${alertConfig[a].dot}`} />
                    {a}
                  </span>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Package size={40} className="text-gray-200 mx-auto mb-3" />
                <p className="font-semibold text-gray-500">لا توجد سجلات مخزون</p>
                <p className="text-sm mt-1">لا يوجد مخزون لهذه الدولة بعد</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="table-header">
                      <th className="text-right px-4 py-3">
                        <button onClick={() => handleSort('title')} className="flex items-center gap-1 hover:text-blue-700">
                          الكتاب <SortBtn col="title" />
                        </button>
                      </th>
                      <th className="text-right px-4 py-3">النسخة / الدولة</th>
                      <th className="text-right px-4 py-3">النوع</th>
                      <th className="text-right px-4 py-3">
                        <button onClick={() => handleSort('stock')} className="flex items-center gap-1 hover:text-blue-700">
                          المخزون الفعلي <SortBtn col="stock" />
                        </button>
                      </th>
                      <th className="text-right px-4 py-3">
                        <button onClick={() => handleSort('reserved')} className="flex items-center gap-1 hover:text-blue-700">
                          المحجوز <SortBtn col="reserved" />
                        </button>
                      </th>
                      <th className="text-right px-4 py-3">
                        <button onClick={() => handleSort('available')} className="flex items-center gap-1 hover:text-blue-700">
                          المتاح <SortBtn col="available" />
                        </button>
                      </th>
                      <th className="text-right px-4 py-3">
                        <button onClick={() => handleSort('min_stock')} className="flex items-center gap-1 hover:text-blue-700">
                          الحد الأدنى <SortBtn col="min_stock" />
                        </button>
                      </th>
                      <th className="text-right px-4 py-3">شريط المخزون</th>
                      <th className="text-right px-4 py-3">الحالة</th>
                      <th className="text-right px-4 py-3">آخر تحديث</th>
                      <th className="text-right px-4 py-3">إجراء</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filtered.map((row) => {
                      const cfg = alertConfig[row.alertLevel];
                      const isDigital = row.isDigital || row.product_variants?.variant_type === 'رقمي';
                      const currency = row.countries?.currency_symbol ?? currencySymbol ?? 'ج.م';
                      const price =
                        row.product_variants?.price ??
                        row.products?.sale_price ??
                        row.products?.base_price ??
                        0;

                      return (
                        <tr key={row.id} className="table-row">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {row.products?.cover_url ? (
                                <img
                                  src={row.products.cover_url}
                                  alt={row.products.title}
                                  className="w-9 h-12 rounded-lg object-cover flex-shrink-0 shadow-sm"
                                />
                              ) : (
                                <div className="w-9 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                                  <BookOpen size={12} className="text-gray-300" />
                                </div>
                              )}

                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-800 truncate max-w-[180px]">
                                  {row.products?.title ?? '—'}
                                </p>
                                <p className="text-xs text-gray-400 truncate">{row.products?.author}</p>
                                <p className="text-xs font-bold text-blue-700 mt-0.5">
                                  {price.toLocaleString()} {currency}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <div className="text-xs">
                              {row.product_variants?.variant_name ? (
                                <span className="flex items-center gap-1 font-semibold text-indigo-700 mb-0.5">
                                  <Layers size={10} />
                                  {row.product_variants.variant_name}
                                </span>
                              ) : (
                                <span className="text-gray-400 mb-0.5 block">نسخة أساسية</span>
                              )}
                              <span className="text-gray-500">{row.countries?.name ?? selectedCountry?.name ?? '—'}</span>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <span className={`status-badge text-xs ${
                              isDigital
                                ? 'bg-purple-100 text-purple-700'
                                : row.product_variants?.variant_type === 'مادي'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {row.product_variants?.variant_type ?? row.products?.type ?? '—'}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            {isDigital ? (
                              <span className="text-purple-600 text-sm font-semibold">غير محدود</span>
                            ) : (
                              <span className={`text-lg font-bold ${
                                row.stock === 0
                                  ? 'text-red-500'
                                  : row.alertLevel === 'حرج'
                                  ? 'text-red-500'
                                  : row.alertLevel === 'منخفض'
                                  ? 'text-amber-600'
                                  : 'text-gray-800'
                              }`}>
                                {row.stock}
                                <span className="text-xs text-gray-400 font-normal mr-1">نسخة</span>
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            {isDigital ? (
                              <span className="text-gray-300 text-sm">—</span>
                            ) : (
                              <span className={`text-sm font-semibold ${
                                row.reserved_stock > 0 ? 'text-orange-600' : 'text-gray-400'
                              }`}>
                                {row.reserved_stock}
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            {isDigital ? (
                              <span className="text-purple-600 text-sm font-bold">∞</span>
                            ) : (
                              <span className={`text-base font-bold ${
                                row.availableStock === 0
                                  ? 'text-red-500'
                                  : row.alertLevel === 'حرج'
                                  ? 'text-red-500'
                                  : row.alertLevel === 'منخفض'
                                  ? 'text-amber-600'
                                  : 'text-green-600'
                              }`}>
                                {row.availableStock}
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-sm text-gray-500">
                            {isDigital ? '—' : `${row.min_stock}`}
                          </td>

                          <td className="px-4 py-3 w-28">
                            <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${cfg.bar}`}
                                style={{ width: `${row.stockPct}%` }}
                              />
                            </div>
                            <p className="text-xs text-gray-400 mt-1">{row.stockPct}٪</p>
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                              <span className={`status-badge ${cfg.cls} text-xs`}>{row.alertLevel}</span>
                            </div>
                          </td>

                          <td className="px-4 py-3 text-xs text-gray-400">
                            {formatDate(row.updated_at)}
                          </td>

                          <td className="px-4 py-3">
                            {!isDigital ? (
                              <button
                                onClick={() => setEditingRow(row)}
                                className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                              >
                                <Edit2 size={11} />
                                تعديل
                              </button>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
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

      {editingRow && (
        <StockEditor row={editingRow} onClose={() => setEditingRow(null)} />
      )}
    </Layout>
  );
}