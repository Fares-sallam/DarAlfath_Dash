/* Where a book's discount applies (product_variants.sale_channel): the website, the app, or both.
   On a channel the discount is not for, the edition sells at its price before the discount. The
   same rule runs in the database views and in the order / payment functions. */

export type SaleChannel = 'all' | 'web' | 'app';

export const SALE_CHANNEL_LABELS: Record<SaleChannel, string> = {
  all: 'الموقع والتطبيق',
  web: 'الموقع فقط',
  app: 'التطبيق فقط',
};

export const isSaleChannel = (v: unknown): v is SaleChannel => v === 'all' || v === 'web' || v === 'app';

/** The price one channel charges for an edition. */
export function channelPrice(
  v: { base_price?: number | null; sale_price?: number | null; price?: number | null; sale_channel?: string | null },
  channel: 'web' | 'app',
): number {
  const sale = Number(v.sale_price ?? v.price ?? 0);
  const base = v.base_price != null ? Number(v.base_price) : null;
  const applies = !v.sale_channel || v.sale_channel === 'all' || v.sale_channel === channel;
  return applies || base == null ? sale : Math.max(base, sale);
}
