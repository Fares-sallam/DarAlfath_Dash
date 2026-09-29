import { useMemo, useState } from 'react';
import { CalendarRange, Download, FileSpreadsheet, FileText, Loader2, Lock, Sheet } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/contexts/AuthContext';
import { useLogo } from '@/contexts/LogoContext';
import fallbackLogo from '@/assets/logo.png';
import {
  PERIOD_OPTIONS,
  resolvePeriod,
  validatePeriod,
  type PeriodSelection,
  type ResolvedPeriod,
} from '@/lib/reports/period';
import { fmtDateOnlyIso } from '@/lib/reports/format';
import { buildExcel } from '@/lib/reports/excel';
import { buildCsv } from '@/lib/reports/csv';
import { printReport } from '@/lib/reports/pdf';
import { reportFileBase, saveBlob } from '@/lib/reports/download';
import type { ReportDocument } from '@/lib/reports/types';

type Format = 'excel' | 'pdf' | 'csv';

export interface ReportBuildContext {
  period: ResolvedPeriod;
  applyFilters: boolean;
  generatedAt: Date;
}

interface Props {
  /** e.g. "تقرير المخزون" */
  title: string;
  /** What the chosen period controls in this report. */
  periodHint: string;
  build: (ctx: ReportBuildContext) => Promise<ReportDocument> | ReportDocument;
  defaultPeriod?: PeriodSelection;
  /** Shown only while the page has filters or a search applied. */
  filters?: { active: boolean; label?: string };
}

const FORMATS: { id: Format; label: string; caption: string; icon: typeof Sheet }[] = [
  { id: 'excel', label: 'Excel', caption: 'جداول منسقة', icon: FileSpreadsheet },
  { id: 'pdf', label: 'PDF', caption: 'جاهز للطباعة', icon: FileText },
  { id: 'csv', label: 'CSV', caption: 'بيانات خام', icon: Sheet },
];

const FORMAT_KEY = 'report-download-format';

function readFormat(): Format {
  try {
    const v = localStorage.getItem(FORMAT_KEY);
    return v === 'pdf' || v === 'csv' ? v : 'excel';
  } catch {
    return 'excel';
  }
}

export default function ReportDownloadButton({ title, periodHint, build, defaultPeriod, filters }: Props) {
  const { user } = useAuth();
  const { logoUrl } = useLogo();
  const allowed = !!user && (user.isSystemOwner || !!user.permissions?.can_export);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState<Format>(readFormat);
  const [selection, setSelection] = useState<PeriodSelection>(defaultPeriod ?? { preset: 'thisMonth' });
  const [applyFilters, setApplyFilters] = useState(true);

  const today = fmtDateOnlyIso(new Date());
  const error = validatePeriod(selection);
  const resolved = useMemo(() => resolvePeriod(selection), [selection]);

  const handleOpenChange = (next: boolean) => {
    if (busy) return;
    if (next) {
      setSelection(defaultPeriod ?? { preset: 'thisMonth' });
      setApplyFilters(true);
    }
    setOpen(next);
  };

  const pickPreset = (preset: PeriodSelection['preset']) => {
    if (preset === 'custom') {
      const now = new Date();
      setSelection((s) => ({
        preset: 'custom',
        from: s.from ?? fmtDateOnlyIso(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: s.to ?? fmtDateOnlyIso(now),
      }));
    } else {
      setSelection({ preset });
    }
  };

  const pickFormat = (f: Format) => {
    setFormat(f);
    try {
      localStorage.setItem(FORMAT_KEY, f);
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  };

  const run = async () => {
    if (error) return;
    setBusy(true);
    try {
      const generatedAt = new Date();
      const period = resolvePeriod(selection, generatedAt);
      const doc = await build({ period, applyFilters: !!filters?.active && applyFilters, generatedAt });
      const base = reportFileBase(doc);
      // The file name mixes Arabic and digits and renders scrambled inside an RTL toast.
      const description = `${doc.title} — ${period.label}`;

      if (format === 'excel') {
        saveBlob(await buildExcel(doc), `${base}.xlsx`);
        toast.success('تم تنزيل ملف Excel', { description });
      } else if (format === 'csv') {
        saveBlob(buildCsv(doc), `${base}.csv`);
        toast.success('تم تنزيل ملف CSV', { description });
      } else {
        setOpen(false);
        toast.info('اختر «حفظ كـ PDF» من نافذة الطباعة');
        await printReport(doc, {
          logoUrl: logoUrl ?? new URL(fallbackLogo, window.location.href).href,
          fileTitle: base,
        });
      }
      setOpen(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error('تعذر إنشاء التقرير', { description: message });
    } finally {
      setBusy(false);
    }
  };

  if (!allowed) {
    return (
      <button
        type="button"
        disabled
        title="ليس لديك صلاحية تصدير البيانات"
        className="btn-secondary flex items-center gap-1.5 text-sm opacity-60 cursor-not-allowed"
      >
        <Lock size={14} /> تنزيل تقرير
      </button>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button type="button" className="btn-secondary flex items-center gap-1.5 text-sm" aria-haspopup="dialog">
          <Download size={14} /> تنزيل تقرير
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        dir="rtl"
        collisionPadding={12}
        className="w-[380px] max-w-[calc(100vw-24px)] p-0 rounded-2xl border-gray-100 shadow-xl"
      >
        <div className="px-5 pt-4 pb-3 border-b border-gray-100">
          <p className="text-sm font-bold text-gray-800">{title}</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{periodHint}</p>
        </div>

        <div className="px-5 py-4 space-y-5">
          <fieldset>
            <legend className="text-xs font-bold text-gray-600 mb-2">الفترة</legend>
            <div className="grid grid-cols-4 gap-1.5">
              {PERIOD_OPTIONS.map((opt) => {
                const active = selection.preset === opt.preset;
                return (
                  <button
                    key={opt.preset}
                    type="button"
                    aria-pressed={active}
                    onClick={() => pickPreset(opt.preset)}
                    className={`px-1.5 py-2 rounded-xl text-xs font-semibold leading-tight transition-colors ${
                      active ? 'bg-blue-700 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {selection.preset === 'custom' && (
              <div className="grid grid-cols-2 gap-2 mt-3">
                <label className="text-xs text-gray-500">
                  من
                  <input
                    type="date"
                    value={selection.from ?? ''}
                    max={selection.to || today}
                    onChange={(e) => setSelection((s) => ({ ...s, from: e.target.value }))}
                    className="input-field h-9 mt-1 text-sm"
                  />
                </label>
                <label className="text-xs text-gray-500">
                  إلى
                  <input
                    type="date"
                    value={selection.to ?? ''}
                    min={selection.from}
                    max={today}
                    onChange={(e) => setSelection((s) => ({ ...s, to: e.target.value }))}
                    className="input-field h-9 mt-1 text-sm"
                  />
                </label>
              </div>
            )}

            <p className={`text-xs mt-2.5 flex items-center gap-1.5 ${error ? 'text-red-500' : 'text-gray-500'}`}>
              <CalendarRange size={13} className="flex-shrink-0" />
              {error ?? resolved.rangeLabel}
            </p>
          </fieldset>

          {filters?.active && (
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-50/60 cursor-pointer">
              <input
                type="checkbox"
                checked={applyFilters}
                onChange={(e) => setApplyFilters(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-blue-700"
              />
              <span className="text-xs text-gray-700 leading-relaxed">
                <span className="font-semibold block">تطبيق الفلاتر والبحث الحاليين</span>
                {filters.label ?? 'بدونها يشمل التقرير كل السجلات في الفترة'}
              </span>
            </label>
          )}

          <fieldset>
            <legend className="text-xs font-bold text-gray-600 mb-2">صيغة الملف</legend>
            <div className="grid grid-cols-3 gap-2" role="radiogroup">
              {FORMATS.map(({ id, label, caption, icon: Icon }) => {
                const active = format === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => pickFormat(id)}
                    className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-colors ${
                      active
                        ? 'border-blue-700 bg-blue-50 text-blue-800'
                        : 'border-gray-100 text-gray-600 hover:border-gray-200'
                    }`}
                  >
                    <Icon size={18} />
                    <span className="text-sm font-bold">{label}</span>
                    <span className="text-[11px] text-gray-500">{caption}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        <div className="px-5 pb-5">
          <button
            type="button"
            onClick={run}
            disabled={busy || !!error}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {busy ? 'جارٍ تجهيز التقرير…' : 'تنزيل التقرير'}
          </button>
          {format === 'pdf' && !busy && (
            <p className="text-[11px] text-gray-400 mt-2 text-center">
              ستفتح نافذة الطباعة، اختر منها «حفظ كـ PDF»
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
