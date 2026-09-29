import type { CellValue, ColumnType } from './types';

// Arabic month names with Latin digits: matches how the dashboard shows
// prices and counts, and reads the same in Excel, PDF and CSV.
const longDate = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
const time = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit', hour12: true });
const numberFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const moneyFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const pad = (n: number) => String(n).padStart(2, '0');

export function toDate(value: CellValue): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' && value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export const fmtDate = (d: Date) => longDate.format(d);
export const fmtDateTime = (d: Date) => `${longDate.format(d)} — ${time.format(d)}`;
export const fmtDateOnlyIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fmtShortDate = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
export const fmtShortDateTime = (d: Date) => `${fmtShortDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const fmtNumber = (n: number) => numberFmt.format(n);
export const fmtMoney = (n: number, currency?: string) => `${moneyFmt.format(n)}${currency ? ` ${currency}` : ''}`;
export const fmtPercent = (n: number) => `${pctFmt.format(n)}%`;

/** Display text for PDF cells and summary cards. */
export function formatCell(value: CellValue, type: ColumnType = 'text', currency?: string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '—';
    if (type === 'money') return fmtMoney(value, currency);
    if (type === 'percent') return fmtPercent(value);
    return fmtNumber(value);
  }
  if (type === 'date' || type === 'datetime') {
    const d = toDate(value);
    if (!d) return String(value);
    return type === 'date' ? fmtShortDate(d) : fmtShortDateTime(d);
  }
  if (value instanceof Date) return fmtShortDateTime(value);
  return String(value);
}

/** Raw-but-readable value for CSV (numbers stay machine-readable). */
export function csvCell(value: CellValue, type: ColumnType = 'text'): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return type === 'percent' ? value.toFixed(1) : String(Math.round(value * 100) / 100);
  }
  if (type === 'date' || type === 'datetime' || value instanceof Date) {
    const d = toDate(value);
    if (!d) return String(value);
    return type === 'date' ? fmtDateOnlyIso(d) : `${fmtDateOnlyIso(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return String(value);
}

export const isNumericType = (type: ColumnType) => type === 'number' || type === 'money' || type === 'percent';
