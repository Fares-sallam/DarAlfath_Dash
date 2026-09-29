import type { Country } from '@/contexts/CountryContext';
import type { ResolvedPeriod } from '../period';

export interface ReportScope {
  period: ResolvedPeriod;
  generatedAt: Date;
  country: Country | null;
  currencySymbol: string;
}

export function scopeMeta(scope: ReportScope, extra: { label: string; value: string }[] = []) {
  return [
    { label: 'الدولة', value: scope.country?.name ?? 'كل الدول' },
    { label: 'العملة', value: scope.currencySymbol },
    ...extra,
  ];
}

export function filterMeta(applied: boolean, description?: string) {
  return applied && description ? [{ label: 'الفلاتر المطبقة', value: description }] : [];
}

export const mixedCurrencyNote = (scope: ReportScope) =>
  scope.country ? [] : ['التقرير يشمل كل الدول: المبالغ مجمّعة كما هي بعملة كل دولة، ويُفضّل اختيار دولة واحدة للمقارنة المالية الدقيقة.'];

export const countryRef = (scope: ReportScope) =>
  scope.country ? { id: scope.country.id, name: scope.country.name, code: scope.country.code } : null;

export const money = (header: string, scope: ReportScope) => `${header} (${scope.currencySymbol})`;
