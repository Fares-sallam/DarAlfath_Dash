import { fmtDate, fmtDateOnlyIso } from './format';

export type PeriodPreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'custom';

export interface PeriodSelection {
  preset: PeriodPreset;
  /** yyyy-mm-dd, custom only */
  from?: string;
  /** yyyy-mm-dd, custom only */
  to?: string;
}

export interface ResolvedPeriod {
  preset: PeriodPreset;
  /** null = open-ended (the comprehensive report) */
  from: Date | null;
  to: Date | null;
  label: string;
  rangeLabel: string;
  /** File-name fragment */
  slug: string;
}

export const PERIOD_OPTIONS: { preset: PeriodPreset; label: string }[] = [
  { preset: 'all', label: 'شامل' },
  { preset: 'today', label: 'اليوم' },
  { preset: 'yesterday', label: 'أمس' },
  { preset: 'last7', label: 'آخر 7 أيام' },
  { preset: 'thisMonth', label: 'هذا الشهر' },
  { preset: 'lastMonth', label: 'الشهر الماضي' },
  { preset: 'thisYear', label: 'هذا العام' },
  { preset: 'custom', label: 'فترة مخصصة' },
];

const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Parses yyyy-mm-dd as a local calendar day (new Date('yyyy-mm-dd') would be UTC midnight). */
export function parseDay(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function validatePeriod(sel: PeriodSelection, now = new Date()): string | null {
  if (sel.preset !== 'custom') return null;
  const from = parseDay(sel.from);
  const to = parseDay(sel.to);
  if (!from || !to) return 'اختر تاريخ البداية وتاريخ النهاية';
  if (from > to) return 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية';
  if (from > endOfDay(now)) return 'تاريخ البداية في المستقبل';
  return null;
}

export function resolvePeriod(sel: PeriodSelection, now = new Date()): ResolvedPeriod {
  const today = startOfDay(now);
  const range = (from: Date, to: Date) => {
    const a = fmtDate(from);
    const b = fmtDate(to);
    return a === b ? a : `من ${a} إلى ${b}`;
  };

  switch (sel.preset) {
    case 'today':
      return { preset: 'today', from: today, to: endOfDay(now), label: 'اليوم', rangeLabel: fmtDate(today), slug: `يوم-${fmtDateOnlyIso(today)}` };

    case 'yesterday': {
      const y = addDays(today, -1);
      return { preset: 'yesterday', from: y, to: endOfDay(y), label: 'أمس', rangeLabel: fmtDate(y), slug: `يوم-${fmtDateOnlyIso(y)}` };
    }

    case 'last7': {
      const from = addDays(today, -6);
      return { preset: 'last7', from, to: endOfDay(now), label: 'آخر 7 أيام', rangeLabel: range(from, today), slug: 'آخر-7-أيام' };
    }

    case 'thisMonth': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        preset: 'thisMonth', from, to: endOfDay(now),
        label: `هذا الشهر (${MONTHS[now.getMonth()]} ${now.getFullYear()})`,
        rangeLabel: range(from, today),
        slug: `شهر-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      };
    }

    case 'lastMonth': {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
      return {
        preset: 'lastMonth', from, to,
        label: `الشهر الماضي (${MONTHS[from.getMonth()]} ${from.getFullYear()})`,
        rangeLabel: range(from, to),
        slug: `شهر-${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`,
      };
    }

    case 'thisYear': {
      const from = new Date(now.getFullYear(), 0, 1);
      return { preset: 'thisYear', from, to: endOfDay(now), label: `هذا العام (${now.getFullYear()})`, rangeLabel: range(from, today), slug: `عام-${now.getFullYear()}` };
    }

    case 'custom': {
      const from = parseDay(sel.from) ?? today;
      const to = parseDay(sel.to) ?? today;
      return {
        preset: 'custom', from: startOfDay(from), to: endOfDay(to),
        label: 'فترة مخصصة',
        rangeLabel: range(from, to),
        slug: `من-${fmtDateOnlyIso(from)}-إلى-${fmtDateOnlyIso(to)}`,
      };
    }

    case 'all':
    default:
      return { preset: 'all', from: null, to: null, label: 'تقرير شامل (كل الفترات)', rangeLabel: `كل البيانات حتى ${fmtDate(today)}`, slug: 'شامل' };
  }
}

export function isInPeriod(value: string | Date | null | undefined, period: ResolvedPeriod): boolean {
  if (!period.from && !period.to) return true;
  if (!value) return false;
  const t = (value instanceof Date ? value : new Date(value)).getTime();
  if (Number.isNaN(t)) return false;
  if (period.from && t < period.from.getTime()) return false;
  if (period.to && t > period.to.getTime()) return false;
  return true;
}

/** Days spanned by the period, or null for the comprehensive report. */
export function periodDays(period: ResolvedPeriod): number | null {
  if (!period.from || !period.to) return null;
  return Math.round((startOfDay(period.to).getTime() - startOfDay(period.from).getTime()) / 86_400_000) + 1;
}
