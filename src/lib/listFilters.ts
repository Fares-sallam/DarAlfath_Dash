/**
 * Shared by the list pages whose counters above the table double as filter
 * buttons (customers, coupons; books has its own two-filter version in
 * bookFilters.ts). A counter and its list use the same matcher, so the
 * number on a card is always exactly the rows its click shows.
 */

export const ALL = 'الكل';

/** Clicking the selected value again clears the filter. */
export const toggleFilter = (current: string, value: string) => (current === value ? ALL : value);

/* ── Customers ── */

export type CustomerStatusFilter = typeof ALL | 'نشط' | 'محظور';

export interface CustomerStatCard {
  key: 'all' | 'active' | 'banned';
  label: string;
  status: CustomerStatusFilter;
}

/** The three counters above the customers list that filter it. */
export const CUSTOMER_STAT_CARDS: CustomerStatCard[] = [
  { key: 'all', label: 'إجمالي العملاء', status: ALL },
  { key: 'active', label: 'العملاء النشطين', status: 'نشط' },
  { key: 'banned', label: 'المحظورون', status: 'محظور' },
];

export function customerMatchesStatus(c: { is_active: boolean }, status: string): boolean {
  if (status === ALL) return true;
  return status === 'نشط' ? c.is_active : status === 'محظور' ? !c.is_active : true;
}

/* ── Coupons ── */

export const COUPON_STATUSES = ['نشط', 'منتهي', 'معطل', 'لم يبدأ'] as const;

export function couponMatchesStatus(c: { _status: string }, status: string): boolean {
  return status === ALL || c._status === status;
}

export const countByStatus = <T>(items: T[], matches: (item: T, status: string) => boolean, status: string) =>
  items.filter((item) => matches(item, status)).length;
