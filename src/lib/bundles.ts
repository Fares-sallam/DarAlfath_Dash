import type { Product } from '@/hooks/useBooks';

/**
 * Book bundles (مجموعات): a product made of other books that are also sold
 * on their own. The bundle has no stock of its own — the database derives
 * it from its books (bundle_available_stock) and reserves/deducts the
 * books' own inventory when a bundle is ordered. Everything here is the
 * same math, done client-side, so the form can show it live while the
 * admin is still picking books.
 */

/** A physical book copy that can be put inside a bundle. */
export interface BundleComponentOption {
  variant_id: string;
  product_id: string;
  title: string;
  variant_name: string;
  cover_url?: string | null;
  /** Current selling price in the selected country (0 = not priced there). */
  price: number;
  cost: number;
  weight_kg: number;
  /** stock − reserved, never negative. null = no inventory row in this country. */
  available: number | null;
  is_active: boolean;
}

export interface BundleItemDraft {
  component_variant_id: string;
  quantity: number;
}

export interface BundleSummary {
  totalCost: number;
  /** "سعر البناء": what the same books cost when bought one by one. */
  buildPrice: number;
  weightKg: number;
  /** Whole bundles the current stock can make — the same number the store shows. */
  available: number;
  /** The book that caps `available` (lowest stock relative to its quantity). */
  bottleneck: { title: string; variant_name: string } | null;
  missingCost: string[];
  missingPrice: string[];
  /** Items whose book no longer exists (deleted) or isn't a physical copy anymore. */
  unknownItems: number;
}

const round = (n: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

/** Physical copies of non-bundle products — a bundle can't contain another bundle. */
export function buildComponentOptions(products: Product[]): BundleComponentOption[] {
  const options: BundleComponentOption[] = [];
  for (const p of products) {
    if (p.is_bundle) continue;
    for (const v of p.product_variants ?? []) {
      if (v.variant_type !== 'مادي') continue;
      options.push({
        variant_id: v.id,
        product_id: p.id,
        title: p.title,
        variant_name: v.variant_name,
        cover_url: p.cover_url,
        price: Number(v.sale_price ?? v.price ?? 0) || 0,
        cost: Number(v.cost_price ?? 0) || 0,
        // Same 0.3kg fallback the DB default and the checkout edge
        // functions use for a copy with no weight set.
        weight_kg: Number(v.weight_kg ?? 0) || 0.3,
        available: v.stock == null ? null : Math.max(0, (v.stock ?? 0) - (v.reserved_stock ?? 0)),
        is_active: p.is_active,
      });
    }
  }
  return options;
}

/** A bundle's books grouped by the copy (bundle variant) they belong to, in display order. */
export function bundleItemsByVariant(p: Pick<Product, 'bundle_items'>): Map<string, BundleItemDraft[]> {
  const byVariant = new Map<string, BundleItemDraft[]>();
  for (const bi of [...(p.bundle_items ?? [])].sort((a, b) => a.sort_order - b.sort_order)) {
    const list = byVariant.get(bi.bundle_variant_id) ?? [];
    list.push({ component_variant_id: bi.component_variant_id, quantity: bi.quantity });
    byVariant.set(bi.bundle_variant_id, list);
  }
  return byVariant;
}

/**
 * The same books for a new bundle copy: each book swapped for its own copy
 * named `name` (e.g. its مقاس 24*17 copy) when it has one, else kept as is.
 * `unmatched` counts the books that had no such copy.
 */
export function copyItemsToVariantName(
  items: BundleItemDraft[],
  name: string,
  options: BundleComponentOption[]
): { items: BundleItemDraft[]; unmatched: number } {
  const byId = new Map(options.map((o) => [o.variant_id, o]));
  let unmatched = 0;
  const copied = items.map((item) => {
    const current = byId.get(item.component_variant_id);
    const twin = name && current
      ? options.find((o) => o.product_id === current.product_id && o.variant_name === name)
      : undefined;
    if (!twin) unmatched += 1;
    return twin ? { ...item, component_variant_id: twin.variant_id } : { ...item };
  });
  return { items: copied, unmatched };
}

export function computeBundleSummary(
  items: BundleItemDraft[],
  byVariantId: Map<string, BundleComponentOption>
): BundleSummary {
  let totalCost = 0;
  let buildPrice = 0;
  let weightKg = 0;
  let available = Number.POSITIVE_INFINITY;
  let bottleneck: BundleSummary['bottleneck'] = null;
  const missingCost: string[] = [];
  const missingPrice: string[] = [];
  let unknownItems = 0;

  for (const item of items) {
    const option = byVariantId.get(item.component_variant_id);
    const qty = Math.max(1, Math.floor(item.quantity || 1));
    if (!option) {
      unknownItems += 1;
      available = 0;
      continue;
    }

    totalCost += option.cost * qty;
    buildPrice += option.price * qty;
    weightKg += option.weight_kg * qty;
    if (option.cost <= 0) missingCost.push(option.title);
    if (option.price <= 0) missingPrice.push(option.title);

    // A copy with no inventory row in this country counts as zero — same
    // rule as the database, so the form never promises stock the store
    // won't actually sell.
    const canMake = Math.floor((option.available ?? 0) / qty);
    if (canMake < available) {
      available = canMake;
      bottleneck = { title: option.title, variant_name: option.variant_name };
    }
  }

  return {
    totalCost: round(totalCost, 2),
    buildPrice: round(buildPrice, 2),
    weightKg: round(weightKg, 3),
    available: items.length === 0 || !Number.isFinite(available) ? 0 : available,
    bottleneck,
    missingCost,
    missingPrice,
    unknownItems,
  };
}
