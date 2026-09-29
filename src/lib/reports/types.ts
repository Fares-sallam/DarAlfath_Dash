import type { ResolvedPeriod } from './period';

export type CellValue = string | number | Date | null | undefined;
export type ColumnType = 'text' | 'number' | 'money' | 'percent' | 'date' | 'datetime';
export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'muted' | 'accent';

export interface ReportColumn<R> {
  header: string;
  type?: ColumnType;
  /** Excel width in characters; auto-sized when omitted. */
  width?: number;
  /** Include this column in the totals row. */
  total?: 'sum';
  value: (row: R) => CellValue;
  tone?: (row: R) => Tone | undefined;
}

export interface SectionColumn {
  header: string;
  type: ColumnType;
  width?: number;
}

export interface ReportSection {
  title: string;
  description?: string;
  columns: SectionColumn[];
  rows: { cells: CellValue[]; tones: (Tone | undefined)[] }[];
  /** Same length as columns; null when the section has no totals. */
  totals: CellValue[] | null;
  emptyText: string;
}

export interface SummaryItem {
  label: string;
  value: CellValue;
  type?: ColumnType;
  tone?: Tone;
}

export interface ReportDocument {
  title: string;
  /** File-name base, e.g. "تقرير-المخزون". */
  fileBase: string;
  period: ResolvedPeriod;
  generatedAt: Date;
  currencySymbol: string;
  meta: { label: string; value: string }[];
  summary: SummaryItem[];
  sections: ReportSection[];
  notes: string[];
  /** Wide tables print better in landscape. */
  landscape?: boolean;
}

export function makeSection<R>(
  title: string,
  columns: ReportColumn<R>[],
  rows: R[],
  opts: { description?: string; emptyText?: string } = {}
): ReportSection {
  const hasTotals = columns.some((c) => c.total === 'sum') && rows.length > 0;

  let totals: CellValue[] | null = null;
  if (hasTotals) {
    totals = columns.map((col) => {
      if (col.total !== 'sum') return null;
      return rows.reduce((sum, row) => {
        const v = col.value(row);
        return typeof v === 'number' && Number.isFinite(v) ? sum + v : sum;
      }, 0);
    });
    const labelIndex = columns.findIndex((c) => c.total !== 'sum');
    if (labelIndex >= 0) totals[labelIndex] = `الإجمالي (${rows.length.toLocaleString('en-US')})`;
  }

  return {
    title,
    description: opts.description,
    columns: columns.map((c) => ({ header: c.header, type: c.type ?? 'text', width: c.width })),
    rows: rows.map((row) => ({
      cells: columns.map((c) => {
        const v = c.value(row);
        return typeof v === 'number' && !Number.isFinite(v) ? null : v;
      }),
      tones: columns.map((c) => c.tone?.(row)),
    })),
    totals,
    emptyText: opts.emptyText ?? 'لا توجد بيانات في هذه الفترة',
  };
}

/** Share of a total as 0–100, safe for a zero total. */
export const share = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);
