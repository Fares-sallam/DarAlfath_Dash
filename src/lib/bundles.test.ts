import { describe, expect, it } from 'vitest';
import type { Product } from '@/hooks/useBooks';
import {
  buildComponentOptions,
  bundleItemsByVariant,
  computeBundleSummary,
  arabicCount,
  booksLabel,
  bundlesLabel,
  copyItemsToVariantName,
  planHideBookFromBundles,
  type BundleComponentOption,
  type BundleItemRow,
} from './bundles';

const book = (id: string, title: string, variants: Partial<NonNullable<Product['product_variants']>[number]>[], extra: Partial<Product> = {}) =>
  ({
    id,
    title,
    is_active: true,
    is_bundle: false,
    product_variants: variants.map((v, i) => ({ id: `${id}-v${i}`, product_id: id, variant_type: 'مادي', variant_name: 'ورق عادي', price: 0, ...v })),
    ...extra,
  }) as Product;

const products = [
  book('a', 'كتاب أ', [
    { id: 'a-normal', variant_name: 'ورق عادي', sale_price: 50, cost_price: 20, weight_kg: 0.2, stock: 10, reserved_stock: 1 },
    { id: 'a-24', variant_name: 'مقاس 24*17', sale_price: 70, cost_price: 30, weight_kg: 0.3, stock: 4, reserved_stock: 0 },
    { id: 'a-pdf', variant_name: 'إلكتروني', variant_type: 'رقمي', sale_price: 20 },
  ]),
  book('b', 'كتاب ب', [
    { id: 'b-normal', variant_name: 'ورق عادي', sale_price: 40, cost_price: 15, weight_kg: null, stock: 6, reserved_stock: 0 },
  ]),
  book('c', 'كتاب ج', [{ id: 'c-normal', variant_name: 'ورق عادي', sale_price: 30, cost_price: 0 }]),
  book('bundle', 'مجموعة', [{ id: 'bundle-v', variant_name: 'ورق عادي', sale_price: 80 }], { is_bundle: true }),
];

const options = buildComponentOptions(products);
const byId = new Map<string, BundleComponentOption>(options.map((o) => [o.variant_id, o]));

describe('buildComponentOptions', () => {
  it('offers paper copies of books only — no digital copies, no bundles', () => {
    expect(options.map((o) => o.variant_id)).toEqual(['a-normal', 'a-24', 'b-normal', 'c-normal']);
  });
  it('uses stock minus reserved, the 0.3kg default weight, and null for no stock row', () => {
    expect(byId.get('a-normal')!.available).toBe(9);
    expect(byId.get('b-normal')!.weight_kg).toBe(0.3);
    expect(byId.get('c-normal')!.available).toBeNull();
  });
});

describe('computeBundleSummary', () => {
  it('adds up cost, build price and weight by quantity', () => {
    const s = computeBundleSummary([{ component_variant_id: 'a-normal', quantity: 2 }, { component_variant_id: 'b-normal', quantity: 1 }], byId);
    expect(s.buildPrice).toBe(140);
    expect(s.totalCost).toBe(55);
    expect(s.weightKg).toBe(0.7);
  });
  it('can make as many bundles as its scarcest book allows, and names that book', () => {
    const s = computeBundleSummary([{ component_variant_id: 'a-normal', quantity: 2 }, { component_variant_id: 'b-normal', quantity: 1 }], byId);
    expect(s.available).toBe(4); // a: floor(9/2)=4, b: 6
    expect(s.bottleneck).toEqual({ title: 'كتاب أ', variant_name: 'ورق عادي' });
  });
  it('treats a book with no stock row as zero and flags missing cost', () => {
    const s = computeBundleSummary([{ component_variant_id: 'a-normal', quantity: 1 }, { component_variant_id: 'c-normal', quantity: 1 }], byId);
    expect(s.available).toBe(0);
    expect(s.missingCost).toEqual(['كتاب ج']);
  });
  it('counts deleted books and makes nothing from an empty bundle', () => {
    expect(computeBundleSummary([{ component_variant_id: 'gone', quantity: 1 }], byId)).toMatchObject({ unknownItems: 1, available: 0 });
    expect(computeBundleSummary([], byId).available).toBe(0);
  });
});

describe('bundleItemsByVariant', () => {
  it('groups a bundle’s books by copy, in display order', () => {
    const grouped = bundleItemsByVariant({
      bundle_items: [
        { bundle_variant_id: 'copy-24', component_variant_id: 'b-normal', component_product_id: 'b', quantity: 1, sort_order: 1 },
        { bundle_variant_id: 'copy-normal', component_variant_id: 'a-normal', component_product_id: 'a', quantity: 2, sort_order: 0 },
        { bundle_variant_id: 'copy-24', component_variant_id: 'a-24', component_product_id: 'a', quantity: 1, sort_order: 0 },
      ],
    });
    expect(grouped.get('copy-24')).toEqual([
      { component_variant_id: 'a-24', quantity: 1 },
      { component_variant_id: 'b-normal', quantity: 1 },
    ]);
    expect(grouped.get('copy-normal')).toEqual([{ component_variant_id: 'a-normal', quantity: 2 }]);
  });
});

describe('copyItemsToVariantName', () => {
  const source = [{ component_variant_id: 'a-normal', quantity: 2 }, { component_variant_id: 'b-normal', quantity: 1 }];
  it('swaps each book for its copy with the new name, keeping quantities', () => {
    const { items, unmatched } = copyItemsToVariantName(source, 'مقاس 24*17', options);
    expect(items).toEqual([{ component_variant_id: 'a-24', quantity: 2 }, { component_variant_id: 'b-normal', quantity: 1 }]);
    expect(unmatched).toBe(1); // كتاب ب has no مقاس 24*17 copy
  });
  it('keeps every book as is for a name no book has, without touching the source', () => {
    const { items, unmatched } = copyItemsToVariantName(source, '', options);
    expect(items).toEqual(source);
    expect(items[0]).not.toBe(source[0]);
    expect(unmatched).toBe(2);
  });
});

describe('planHideBookFromBundles', () => {
  const row = (bundle: string, copy: string, book: string, sort: number, quantity = 1): BundleItemRow => ({
    bundle_product_id: bundle,
    bundle_variant_id: copy,
    component_variant_id: `${book}-v`,
    component_product_id: book,
    quantity,
    sort_order: sort,
  });
  const titles = new Map([['B1', 'مجموعة كبيرة'], ['B2', 'مجموعة صغيرة'], ['B3', 'مجموعة بنسختين'], ['B4', 'مجموعة تانية']]);

  const rows = [
    // B1: four books → trims down to three
    row('B1', 'B1-c', 'x', 0, 2), row('B1', 'B1-c', 'a', 1), row('B1', 'B1-c', 'b', 2), row('B1', 'B1-c', 'c', 3),
    // B2: exactly two books → would fall below two
    row('B2', 'B2-c', 'x', 0), row('B2', 'B2-c', 'a', 1),
    // B3: two copies; the 24*17 copy is the thin one
    row('B3', 'B3-a4', 'x', 0), row('B3', 'B3-a4', 'a', 1), row('B3', 'B3-a4', 'b', 2),
    row('B3', 'B3-24', 'x', 0), row('B3', 'B3-24', 'a', 1),
    // B4: a bundle that doesn't hold the book at all
    row('B4', 'B4-c', 'a', 0), row('B4', 'B4-c', 'b', 1),
  ];
  const plan = planHideBookFromBundles('x', rows, titles);
  const bundle = (id: string) => plan.bundles.find((b) => b.id === id)!;

  it('only lists the bundles that hold the book', () => {
    expect(plan.bundles.map((b) => b.id).sort()).toEqual(['B1', 'B2', 'B3']);
  });

  it('a bundle with enough books keeps going without it, in its original order and quantities', () => {
    expect(bundle('B1')).toMatchObject({ action: 'trim', booksLeft: 3 });
    expect(bundle('B1').copies).toEqual([
      { bundle_variant_id: 'B1-c', remaining: [
        { component_variant_id: 'a-v', quantity: 1 },
        { component_variant_id: 'b-v', quantity: 1 },
        { component_variant_id: 'c-v', quantity: 1 },
      ] },
    ]);
  });

  it('a bundle that would drop below two books is hidden instead, and left untouched', () => {
    expect(bundle('B2')).toMatchObject({ action: 'hide', booksLeft: 1, copies: [] });
  });

  it('with several copies, the thinnest one decides — the whole bundle is hidden', () => {
    expect(bundle('B3')).toMatchObject({ action: 'hide', booksLeft: 1 });
  });

  it('carries the bundle titles, sorted for display, and plans nothing for a book in no bundle', () => {
    expect(plan.bundles.map((b) => b.title)).toEqual([...plan.bundles.map((b) => b.title)].sort((a, b) => a.localeCompare(b, 'ar')));
    expect(planHideBookFromBundles('nobody', rows, titles).bundles).toEqual([]);
  });

  it('a copy that does not hold the book is not rewritten', () => {
    const mixed = planHideBookFromBundles('x', [
      row('B1', 'c1', 'x', 0), row('B1', 'c1', 'a', 1), row('B1', 'c1', 'b', 2),
      row('B1', 'c2', 'a', 0), row('B1', 'c2', 'b', 1),
    ], titles);
    expect(mixed.bundles[0].copies.map((c) => c.bundle_variant_id)).toEqual(['c1']);
  });
});

describe('Arabic counts', () => {
  it('uses the right form for one, two, a few and many', () => {
    expect([1, 2, 3, 10, 11, 35].map(bundlesLabel)).toEqual(['مجموعة', 'مجموعتين', '٣ مجموعات', '١٠ مجموعات', '١١ مجموعة', '٣٥ مجموعة']);
    expect([1, 2, 5, 14].map(booksLabel)).toEqual(['كتاب واحد', 'كتابين', '٥ كتب', '١٤ كتاب']);
  });
  it('works for any noun', () => {
    expect(arabicCount(4, { one: 'أ', two: 'ب', few: 'ج', many: 'د' })).toBe('٤ ج');
  });
});
