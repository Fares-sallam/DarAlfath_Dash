import type { QueryClient } from '@tanstack/react-query';

/**
 * Every screen that shows where a book sits (its category, extra categories, series, section) or the names, order and
 * counts of those places. A move made on any one of them must show up on all of them at once, without a reload: the tree and
 * its books tabs, «إدارة الكتب» (the products list carries each book's places), the older series and category pages, the
 * category strip and the header's links.
 */
export const CATALOG_DEPENDENT_KEYS: readonly string[] = [
  'catalog-nodes', 'catalog-links', 'catalog-counts', 'catalog-node-books', 'catalog-products',
  'products', 'book_series', 'book-series', 'series-books', 'available-products',
  'settings-categories', 'category-bar-rows', 'site-header-nav', 'promo-series-options',
];

const KEYS = new Set(CATALOG_DEPENDENT_KEYS);

/** Marks all of them stale; the ones on screen are fetched again right away, the others when they are opened. */
export function refreshCatalogDependents(qc: QueryClient): void {
  void qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && KEYS.has(q.queryKey[0]) });
}
