import { isRealOrder, type ReportOrder } from '@/lib/reports/data';

export interface BookSales {
  id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  is_active: boolean;
  is_bundle: boolean;
  /** Copies sold (a bundle counts as itself). */
  units: number;
  revenue: number;
  orders: number;
  /** When it last sold, ISO; null if never in the window. */
  lastSoldAt: string | null;
  /** Copies on hand across countries (stock less reserved); null for a bundle, or when it couldn't be read. */
  stock: number | null;
  /** 1 for the best seller; null for a book with no sales in the window. */
  rank: number | null;
}

type ProductRow = { id: string; title: string; author: string | null; cover_url: string | null; is_active: boolean; is_bundle: boolean };

/**
 * Every book with what it sold in the given orders, best first: by copies sold, then by revenue, then by
 * how many orders, then the more recent sale. Cancelled and returned orders don't count. Books with no
 * sales follow, alphabetically. This is the order the dashboard offers books in for "الأكثر مبيعًا".
 */
export function salesRanking(orders: ReportOrder[], products: ProductRow[], stock: Map<string, number> | null): BookSales[] {
  const sold = new Map<string, { units: number; revenue: number; orders: Set<string>; last: string | null }>();
  for (const order of orders) {
    if (!isRealOrder(order)) continue;
    for (const item of order.order_items ?? []) {
      if (!item.product_id) continue;
      const entry = sold.get(item.product_id) ?? { units: 0, revenue: 0, orders: new Set<string>(), last: null };
      entry.units += item.quantity ?? 0;
      entry.revenue += (item.price_per_item ?? 0) * (item.quantity ?? 0);
      entry.orders.add(order.id);
      if (!entry.last || order.created_at > entry.last) entry.last = order.created_at;
      sold.set(item.product_id, entry);
    }
  }

  const rows: BookSales[] = products.map((p) => {
    const s = sold.get(p.id);
    return {
      ...p,
      units: s?.units ?? 0,
      revenue: Math.round((s?.revenue ?? 0) * 100) / 100,
      orders: s?.orders.size ?? 0,
      lastSoldAt: s?.last ?? null,
      stock: p.is_bundle || !stock ? null : stock.get(p.id) ?? 0,
      rank: null,
    };
  });

  rows.sort((a, b) =>
    b.units - a.units ||
    b.revenue - a.revenue ||
    b.orders - a.orders ||
    (b.lastSoldAt ?? '').localeCompare(a.lastSoldAt ?? '') ||
    a.title.localeCompare(b.title, 'ar'),
  );
  let rank = 0;
  for (const row of rows) if (row.units > 0) row.rank = ++rank;
  return rows;
}

/** The top sellers to fill the row with: books on sale that sold in the window, up to `limit`. */
export function topSellerIds(ranking: BookSales[], limit = 8): string[] {
  return ranking.filter((r) => r.rank != null && r.is_active).slice(0, limit).map((r) => r.id);
}
