import { useCallback, useState } from 'react';
import { parseDecisions, type ColumnDecisions, type ColumnGroup } from '@/lib/reports/columnChoices';

const storageKey = (key: string) => `report-columns:${key}`;

/** The owner's column choices for a report, kept in the browser (`key` names the report); nothing is kept when there is no key. */
export function useColumnDecisions(key: string | undefined, groups: readonly ColumnGroup[] | undefined): [ColumnDecisions, (next: ColumnDecisions) => void] {
  const [decisions, setDecisions] = useState<ColumnDecisions>(() => {
    if (!key || !groups) return {};
    try {
      return parseDecisions(JSON.parse(localStorage.getItem(storageKey(key)) ?? 'null'), groups);
    } catch {
      return {};
    }
  });
  const change = useCallback((next: ColumnDecisions) => {
    setDecisions(next);
    if (!key) return;
    try {
      localStorage.setItem(storageKey(key), JSON.stringify(next));
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  }, [key]);
  return [decisions, change];
}
