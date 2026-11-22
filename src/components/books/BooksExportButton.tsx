import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/contexts/AuthContext';
import { useLogo } from '@/contexts/LogoContext';
import fallbackLogo from '@/assets/logo.png';
import ColumnPicker from '@/components/reports/ColumnPicker';
import { useColumnDecisions } from '@/hooks/useColumnDecisions';
import { resolveSelection, type ColumnGroup } from '@/lib/reports/columnChoices';
import { catalogColumns, catalogFileBase, catalogRows, CATALOG_COLUMNS, type ExportBook } from '@/lib/booksExport/rows';
import { buildCatalogExcel } from '@/lib/booksExport/excel';
import { buildCatalogHtml } from '@/lib/booksExport/pdf';
import { fetchBooksForExport } from '@/lib/booksExport/fetch';
import { printHtml } from '@/lib/reports/pdf';
import { saveBlob } from '@/lib/reports/download';

/** Every column of the export as a button (the nine the owner asked for are on until he turns them off). */
const EXPORT_GROUPS: readonly ColumnGroup[] = [
  {
    id: 'cols',
    title: 'أعمدة الملف',
    choices: CATALOG_COLUMNS.map((c) => ({ id: c.key, label: c.header, defaultOn: c.defaultOn, hint: c.hint })),
  },
];

type Format = 'excel' | 'pdf';
type Scope = 'all' | 'filtered';

const FORMATS: { id: Format; label: string; caption: string; icon: typeof FileText }[] = [
  { id: 'excel', label: 'Excel', caption: 'ملف واحد، شيت واحد', icon: FileSpreadsheet },
  { id: 'pdf', label: 'PDF', caption: 'نفس الجدول للطباعة', icon: FileText },
];

interface Props {
  /** the books the list shows right now (after the filters) */
  filtered: ExportBook[];
  filtersActive: boolean;
  filtersLabel?: string;
}

/**
 * «تصدير الكتب»: the books list as one table (SKU, name, author, description, weight, cost price, ISBN, series, category),
 * one row per copy of a book, as an Excel file with a single sheet or as the same table in a PDF.
 */
export default function BooksExportButton({ filtered, filtersActive, filtersLabel }: Props) {
  const { user } = useAuth();
  const { logoUrl } = useLogo();
  const allowed = !!user && (user.isSystemOwner || !!user.permissions?.can_export);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState<Format>('excel');
  const [scope, setScope] = useState<Scope>('all');
  const useFilters = filtersActive && scope === 'filtered';
  const [decisions, changeDecisions] = useColumnDecisions('books-export', EXPORT_GROUPS);
  const columns = catalogColumns(resolveSelection(EXPORT_GROUPS, decisions).cols.ids);

  const run = async () => {
    if (columns.length === 0) return;
    setBusy(true);
    try {
      const generatedAt = new Date();
      const books = useFilters ? filtered : await fetchBooksForExport();
      if (books.length === 0) {
        toast.error('مفيش كتب للتصدير');
        return;
      }
      const rows = catalogRows(books, { keepOrder: useFilters });
      const base = catalogFileBase(generatedAt);
      const description = `${books.length.toLocaleString('en-US')} كتاب · ${rows.length.toLocaleString('en-US')} سطر`;
      if (format === 'excel') {
        saveBlob(await buildCatalogExcel(rows, generatedAt, columns), `${base}.xlsx`);
        toast.success('تم تنزيل ملف Excel', { description });
      } else {
        setOpen(false);
        toast.info('اختر «حفظ كـ PDF» من نافذة الطباعة');
        await printHtml(
          buildCatalogHtml(rows, {
            generatedAt,
            fileTitle: base,
            bookCount: books.length,
            columns,
            scopeLabel: useFilters ? 'حسب الفلاتر الحالية' : undefined,
            logoUrl: logoUrl ?? new URL(fallbackLogo, window.location.href).href,
          }),
          base,
        );
      }
      setOpen(false);
    } catch (e) {
      toast.error('تعذر تصدير الكتب', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  if (!allowed) {
    return (
      <button type="button" disabled title="ليس لديك صلاحية تصدير البيانات" className="btn-secondary flex items-center gap-1.5 text-sm opacity-60 cursor-not-allowed">
        <Lock size={14} /> تصدير الكتب
      </button>
    );
  }

  return (
    <Popover open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}>
      <PopoverTrigger asChild>
        <button type="button" className="btn-secondary flex items-center gap-1.5 text-sm" aria-haspopup="dialog" data-testid="books-export">
          <FileSpreadsheet size={14} /> تصدير الكتب
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        dir="rtl"
        collisionPadding={12}
        className="w-[420px] max-w-[calc(100vw-24px)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto p-0 rounded-2xl border-gray-100 shadow-xl"
        data-testid="books-export-panel"
      >
        <div className="px-5 pt-4 pb-3 border-b border-gray-100">
          <p className="text-sm font-bold text-gray-800">تصدير قائمة الكتب</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            جدول واحد، وإنت اللي بتختار أعمدته. صف لكل نسخة من الكتاب (لأن الـSKU والوزن وسعر التكلفة على مستوى النسخة).
          </p>
        </div>

        <div className="px-5 py-4 space-y-5">
          {filtersActive && (
            <fieldset>
              <legend className="text-xs font-bold text-gray-600 mb-2">أنهي كتب؟</legend>
              <div className="grid grid-cols-2 gap-2" role="radiogroup">
                {([['all', 'كل الكتب'], ['filtered', 'الظاهرة بعد الفلترة']] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={scope === id}
                    onClick={() => setScope(id)}
                    data-testid={`export-scope-${id}`}
                    className={`py-2.5 rounded-xl border-2 text-sm font-semibold transition-colors ${scope === id ? 'border-blue-700 bg-blue-50 text-blue-800' : 'border-gray-100 text-gray-600 hover:border-gray-200'}`}
                  >{label}</button>
                ))}
              </div>
              {scope === 'filtered' && filtersLabel && <p className="text-[11px] text-gray-400 mt-1.5">{filtersLabel}</p>}
            </fieldset>
          )}

          <div>
            <p className="text-xs font-bold text-gray-600 mb-1">الأعمدة اللي تظهر في الملف</p>
            <p className="text-[11px] text-gray-400 mb-3">اللي تقفله مش بيتعمل له عمود خالص.</p>
            <ColumnPicker groups={EXPORT_GROUPS} decisions={decisions} onChange={changeDecisions} />
            {columns.length === 0 && <p className="text-xs text-red-500 mt-2" data-testid="export-no-columns">اختار عمود واحد على الأقل.</p>}
          </div>

          <fieldset>
            <legend className="text-xs font-bold text-gray-600 mb-2">صيغة الملف</legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              {FORMATS.map(({ id, label, caption, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={format === id}
                  onClick={() => setFormat(id)}
                  data-testid={`export-format-${id}`}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-colors ${format === id ? 'border-blue-700 bg-blue-50 text-blue-800' : 'border-gray-100 text-gray-600 hover:border-gray-200'}`}
                >
                  <Icon size={18} />
                  <span className="text-sm font-bold">{label}</span>
                  <span className="text-[11px] text-gray-500">{caption}</span>
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="px-5 pb-5">
          <button type="button" onClick={run} disabled={busy || columns.length === 0} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60" data-testid="export-run">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {busy ? 'جارٍ التجهيز…' : 'تنزيل'}
          </button>
          {format === 'pdf' && !busy && <p className="text-[11px] text-gray-400 mt-2 text-center">ستفتح نافذة الطباعة، اختر منها «حفظ كـ PDF»</p>}
          <p className="text-[11px] text-gray-400 mt-2 text-center">الوزن بالكيلوجرام</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
