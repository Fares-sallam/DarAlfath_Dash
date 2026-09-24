import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useCountry } from '@/contexts/CountryContext';

/* ── Types ── */
export interface InventoryRow {
  id: string;
  product_id: string;
  variant_id?: string | null;
  country_id: string;
  stock: number;
  reserved_stock: number;
  min_stock: number;
  updated_at: string;
  isDigital?: boolean;
  isVirtual?: boolean;
  products: {
    id: string;
    title: string;
    author: string;
    cover_url?: string | null;
    type: string;
    cost_price?: number;
    base_price: number;
    sale_price?: number | null;
    is_active: boolean;
    is_bundle?: boolean;
  } | null;
  product_variants?: {
    id: string;
    variant_name: string;
    variant_type: string;
    sku?: string | null;
    price?: number;
    cost_price?: number | null;
    base_price?: number | null;
    sale_price?: number | null;
  } | null;
  countries: {
    id: string;
    name: string;
    currency_symbol: string;
  } | null;
}

export type AlertLevel = 'حرج' | 'منخفض' | 'جيد' | 'رقمي';

export interface EnrichedInventoryRow extends InventoryRow {
  availableStock: number;
  alertLevel: AlertLevel;
  stockPct: number;
}

type CountryRow = {
  id: string;
  name: string;
  currency_symbol: string;
};

type VariantRow = {
  id: string;
  product_id: string;
  variant_name: string;
  variant_type: string;
  sku?: string | null;
  price?: number;
  cost_price?: number | null;
  base_price?: number | null;
  sale_price?: number | null;
  products: InventoryRow['products'];
};

type VariantCountryPriceRow = {
  variant_id: string;
  country_id: string;
  price: number;
  cost_price?: number | null;
  base_price?: number | null;
  sale_price?: number | null;
};

function isDigitalRow(row: InventoryRow): boolean {
  return row.isDigital === true || row.product_variants?.variant_type === 'رقمي';
}

/* ── Derive alert level ── */
function getAlertLevel(row: InventoryRow): AlertLevel {
  if (isDigitalRow(row)) return 'رقمي';

  const avail = row.stock - row.reserved_stock;
  if (avail <= 0) return 'حرج';
  if (avail <= row.min_stock * 0.5) return 'حرج';
  if (avail <= row.min_stock) return 'منخفض';
  return 'جيد';
}

function enrich(row: InventoryRow): EnrichedInventoryRow {
  const digital = isDigitalRow(row);
  const availableStock = digital ? Number.POSITIVE_INFINITY : Math.max(0, row.stock - row.reserved_stock);
  const alertLevel = getAlertLevel(row);
  const maxForBar = Math.max(row.min_stock * 3, row.stock, 1);

  const stockPct = digital ? 100 : Math.round(Math.min((availableStock / maxForBar) * 100, 100));

  return { ...row, isDigital: digital, availableStock, alertLevel, stockPct };
}

async function resolveCountry(selectedCountry?: CountryRow | null): Promise<CountryRow | null> {
  if (selectedCountry?.id) return selectedCountry;

  const { data, error } = await supabase
    .from('countries')
    .select('id, name, currency_symbol')
    .eq('code', 'EG')
    .maybeSingle();

  if (error) {
    console.warn('[useInventory] failed to resolve EG country:', error.message);
    return null;
  }

  return (data as CountryRow | null) ?? null;
}

async function fetchVariantCountryPriceMap(
  variantIds: string[],
  selectedCountryId?: string | null
): Promise<Record<string, VariantCountryPriceRow>> {
  if (!selectedCountryId || variantIds.length === 0) return {};

  const { data, error } = await supabase
    .from('product_variant_country_prices')
    .select('variant_id, country_id, price, cost_price, base_price, sale_price')
    .eq('country_id', selectedCountryId)
    .in('variant_id', variantIds);

  if (error) {
    console.warn('[useInventory] product_variant_country_prices fallback:', error.message);
    return {};
  }

  const map: Record<string, VariantCountryPriceRow> = {};
  for (const row of (data ?? []) as VariantCountryPriceRow[]) {
    map[row.variant_id] = row;
  }
  return map;
}

function applyVariantPrice(
  row: VariantRow,
  override?: VariantCountryPriceRow,
  strictCountryPrice = true
): InventoryRow['product_variants'] {
  const fallbackBase = row.base_price ?? row.price ?? 0;
  const fallbackSale = row.sale_price ?? row.price ?? fallbackBase;

  // In country mode, a missing country price must be shown as 0, not copied from Egypt/global.
  const base = strictCountryPrice ? (override?.base_price ?? 0) : fallbackBase;
  const sale = strictCountryPrice
    ? (override?.sale_price ?? override?.price ?? 0)
    : fallbackSale;

  return {
    id: row.id,
    variant_name: row.variant_name,
    variant_type: row.variant_type,
    sku: row.sku,
    cost_price: strictCountryPrice ? (override?.cost_price ?? 0) : (row.cost_price ?? 0),
    base_price: base,
    sale_price: sale || null,
    price: sale || 0,
  };
}

/* ── Fetch inventory (country-aware, variant-first) ── */
export function useInventory() {
  const { selectedCountry } = useCountry();

  return useQuery({
    queryKey: ['inventory', selectedCountry?.id ?? 'EG'],
    queryFn: async (): Promise<EnrichedInventoryRow[]> => {
      const country = await resolveCountry(selectedCountry as CountryRow | null);
      if (!country?.id) return [];

      const [inventoryResult, variantsResult] = await Promise.all([
        supabase
          .from('product_inventory')
          .select(`
            id,
            product_id,
            variant_id,
            country_id,
            stock,
            reserved_stock,
            min_stock,
            updated_at,
            products(id, title, author, cover_url, type, cost_price, base_price, sale_price, is_active, is_bundle),
            product_variants(id, variant_name, variant_type, sku, price, cost_price, base_price, sale_price),
            countries(id, name, currency_symbol)
          `)
          .eq('country_id', country.id)
          .order('updated_at', { ascending: false }),
        supabase
          .from('product_variants')
          .select(`
            id,
            product_id,
            variant_name,
            variant_type,
            sku,
            price,
            cost_price,
            base_price,
            sale_price,
            products(id, title, author, cover_url, type, cost_price, base_price, sale_price, is_active, is_bundle)
          `),
      ]);

      if (inventoryResult.error) throw inventoryResult.error;
      if (variantsResult.error) throw variantsResult.error;

      // Bundles have no stock of their own — it's derived from their books
      // (see bundle_available_stock). Listing them here would offer a
      // stock field that does nothing, and flag every bundle as out of stock.
      const inventoryRows = ((inventoryResult.data ?? []) as InventoryRow[]).filter(
        (row) => row.products?.is_bundle !== true
      );
      const variants = ((variantsResult.data ?? []) as VariantRow[]).filter(
        (v) => v.products?.is_active !== false && v.products?.is_bundle !== true
      );
      const variantIds = variants.map((v) => v.id);
      const variantPriceMap = await fetchVariantCountryPriceMap(variantIds, country.id);

      const variantProductIds = new Set(variants.map((v) => v.product_id));
      const inventoryByVariant = new Map<string, InventoryRow>();
      const result: InventoryRow[] = [];

      for (const row of inventoryRows) {
        if (row.variant_id) {
          inventoryByVariant.set(row.variant_id, row);
          continue;
        }

        // Do not show the old/base inventory row if the product already has explicit variants.
        if (variantProductIds.has(row.product_id)) continue;

        result.push({ ...row, isDigital: false, isVirtual: false });
      }

      for (const variant of variants) {
        const override = variantPriceMap[variant.id];
        const pricedVariant = applyVariantPrice(variant, override);
        const isDigital = variant.variant_type === 'رقمي';
        const existingInventory = inventoryByVariant.get(variant.id);

        if (existingInventory) {
          result.push({
            ...existingInventory,
            product_variants: pricedVariant,
            products: existingInventory.products ?? variant.products,
            countries: existingInventory.countries ?? country,
            isDigital,
            isVirtual: false,
          });
          continue;
        }

        // Digital variants do not have physical inventory; show them as unlimited virtual rows.
        // Physical variants missing inventory are shown as zero rows so the admin can create/update them.
        result.push({
          id: `${isDigital ? 'digital' : 'missing'}-${variant.id}`,
          product_id: variant.product_id,
          variant_id: variant.id,
          country_id: country.id,
          stock: 0,
          reserved_stock: 0,
          min_stock: isDigital ? 0 : 5,
          updated_at: new Date().toISOString(),
          isDigital,
          isVirtual: true,
          products: variant.products,
          product_variants: pricedVariant,
          countries: country,
        });
      }

      return result.map(enrich);
    },
  });
}

/* ── Update stock quantity ── */
export interface UpdateStockInput {
  id: string;
  product_id: string;
  variant_id?: string | null;
  country_id: string;
  stock: number;
  min_stock?: number;
}

export function useUpdateStock() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateStockInput) => {
      const patch: Record<string, number> = { stock: input.stock };
      if (input.min_stock !== undefined) patch.min_stock = input.min_stock;

      if (input.id.startsWith('missing-')) {
        const { error } = await supabase
          .from('product_inventory')
          .upsert(
            {
              product_id: input.product_id,
              variant_id: input.variant_id,
              country_id: input.country_id,
              stock: input.stock,
              reserved_stock: 0,
              min_stock: input.min_stock ?? 5,
            },
            { onConflict: 'product_id,country_id,variant_id' }
          );

        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from('product_inventory')
        .update(patch)
        .eq('id', input.id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('تم تحديث الكمية بنجاح');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ── Fetch countries for inventory filter (allowed/active) ── */
export function useInventoryCountries() {
  const { allowedCountries } = useCountry();

  return useQuery({
    queryKey: ['inventory-countries', allowedCountries.map((c) => c.id).join(',')],
    queryFn: async () => {
      return allowedCountries.map((c) => ({
        id: c.id,
        name: c.name,
        currency_symbol: c.currency_symbol,
      }));
    },
    staleTime: 60_000,
  });
}

/* ── Export CSV helper ── */
export function exportInventoryCsv(rows: EnrichedInventoryRow[]) {
  const headers = [
    'الكتاب',
    'المؤلف',
    'النسخة',
    'الدولة',
    'نوع النسخة',
    'السعر',
    'المخزون الفعلي',
    'المحجوز',
    'المتاح',
    'الحد الأدنى',
    'الحالة',
    'آخر تحديث',
  ];

  const csvRows = rows.map((r) => [
    r.products?.title ?? '',
    r.products?.author ?? '',
    r.product_variants?.variant_name ?? 'أساسي',
    r.countries?.name ?? '',
    r.product_variants?.variant_type ?? r.products?.type ?? '',
    r.product_variants?.price ?? r.products?.sale_price ?? r.products?.base_price ?? '',
    r.isDigital ? 'غير محدود' : r.stock,
    r.isDigital ? '' : r.reserved_stock,
    r.isDigital ? '∞' : r.availableStock,
    r.isDigital ? '' : r.min_stock,
    r.alertLevel,
    new Date(r.updated_at).toLocaleDateString('ar-EG'),
  ]);

  const bom = '\uFEFF';
  const csv =
    bom +
    [headers, ...csvRows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
