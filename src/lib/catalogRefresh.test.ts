import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { CATALOG_DEPENDENT_KEYS, refreshCatalogDependents } from './catalogRefresh';

describe('refreshCatalogDependents', () => {
  it('marks every screen that shows a book\'s places stale, and nothing else', () => {
    const qc = new QueryClient();
    const keys: unknown[][] = [...CATALOG_DEPENDENT_KEYS.map((k) => [k]), ['products', 'all'], ['series-books', 's1', 'all'], ['coupons'], ['orders', 1], ['dashboard']];
    for (const key of keys) qc.setQueryData(key, []);
    refreshCatalogDependents(qc);
    const stale = (key: unknown[]) => qc.getQueryState(key)?.isInvalidated;
    for (const key of keys.slice(0, keys.length - 3)) expect(stale(key), JSON.stringify(key)).toBe(true);
    expect(stale(['coupons'])).toBe(false);
    expect(stale(['orders', 1])).toBe(false);
    expect(stale(['dashboard'])).toBe(false);
  });

  it('includes the books list, so a move in the tree shows in «إدارة الكتب»', () => {
    expect(CATALOG_DEPENDENT_KEYS).toContain('products');
    expect(CATALOG_DEPENDENT_KEYS).toContain('catalog-links');
  });
});
