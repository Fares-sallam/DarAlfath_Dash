import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useCountry } from '@/contexts/CountryContext';

export interface Category {
  id: string;
  name: string;
  slug?: string;
}

export interface BookSeries {
  id: string;
  name: string;
  author?: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  variant_name: string;
  variant_type: 'مادي' | 'رقمي';
  sku?: string | null;
  /** Final/current selling price. Kept for compatibility with old code. */
  price: number;
  cost_price?: number;
  base_price?: number;
  sale_price?: number | null;
  stock?: number | null;
  reserved_stock?: number | null;
  min_stock?: number | null;
  country_id?: string | null;
  /** Shipping weight in kg — feeds the weight+governorate shipping-rate
   *  lookup at checkout (see create-storefront-order / initiate-paymob-
   *  payment). Defaults to 0.3kg in the DB for variants that predate this
   *  column. */
  weight_kg?: number | null;
}

export interface ProductImage {
  id: string;
  product_id: string;
  url: string;
  alt_text?: string;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
}

export interface ElectronicBook {
  id: string;
  product_id: string;
  file_path?: string;
  file_format?: string;
  is_sold_once: boolean;
  file_size_mb?: number;
  protected: boolean;
  watermark: boolean;
}

export interface Product {
  id: string;
  title: string;
  author: string;
  description?: string;
  cover_url?: string;
  category_id?: string;
  isbn?: string;
  keywords?: string[];
  type: 'ورقي' | 'رقمي' | 'ورقي ورقمي';
  cost_price: number;
  base_price: number;
  sale_price?: number;
  profit?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  categories?: Category;
  product_variants?: ProductVariant[];
  electronic_books?: ElectronicBook[];
  product_series?: { series_id: string; book_series: BookSeries }[];
  product_images?: ProductImage[];
}

export interface ProductVariantInput {
  id?: string;
  variant_name: string;
  variant_type: 'مادي' | 'رقمي';
  sku?: string | null;
  price?: number;
  cost_price?: number;
  base_price?: number;
  sale_price?: number | null;
  stock?: number | null;
  reserved_stock?: number | null;
  min_stock?: number | null;
  weight_kg?: number | null;
}

export interface UpsertProductInput {
  id?: string;
  title: string;
  author: string;
  description?: string;
  cover_url?: string;
  category_id?: string;
  isbn?: string;
  keywords?: string[];
  type: 'ورقي' | 'رقمي' | 'ورقي ورقمي';
  /** These are now summary/fallback values. Real prices come from variants. */
  cost_price: number;
  base_price: number;
  sale_price?: number;
  is_active?: boolean;
  variants: ProductVariantInput[];
  ebookFilePath?: string;
  seriesIds?: string[];
  additionalImages?: { url: string; alt_text?: string; is_primary?: boolean }[];
}

type CountryPriceRow = {
  product_id: string;
  country_id: string;
  cost_price: number;
  base_price: number;
  sale_price?: number | null;
};

type VariantCountryPriceRow = {
  variant_id: string;
  country_id: string;
  price: number;
  cost_price?: number | null;
  base_price?: number | null;
  sale_price?: number | null;
};

type VariantInventoryRow = {
  id: string;
  product_id: string;
  variant_id: string | null;
  country_id: string;
  stock: number;
  reserved_stock: number;
  min_stock: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value?: string | null) {
  return !!value && UUID_RE.test(value);
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeSale(basePrice: number, salePrice?: number | null) {
  const sale = num(salePrice, basePrice);
  return sale > 0 ? sale : basePrice;
}

function normalizeVariant(v: ProductVariantInput): ProductVariantInput & { price: number; cost_price: number; base_price: number; sale_price: number; min_stock: number; stock: number; reserved_stock: number; weight_kg: number } {
  const base_price = Math.max(0, num(v.base_price ?? v.price, 0));
  const sale_price = normalizeSale(base_price, v.sale_price ?? v.price ?? base_price);
  const cost_price = Math.max(0, num(v.cost_price, 0));
  const stock = Math.max(0, Math.trunc(num(v.stock, 0)));
  const reserved_stock = Math.max(0, Math.trunc(num(v.reserved_stock, 0)));
  const min_stock = Math.max(0, Math.trunc(num(v.min_stock, 5)));
  const weight_kg = Math.max(0, num(v.weight_kg, 0.3)) || 0.3;

  return {
    ...v,
    variant_name: v.variant_name?.trim() || 'نسخة',
    sku: v.sku?.trim() || null,
    cost_price,
    base_price,
    sale_price,
    price: sale_price,
    stock,
    reserved_stock,
    min_stock,
    weight_kg,
  };
}

function summarizeVariants(variants: ReturnType<typeof normalizeVariant>[]) {
  const salePrices = variants.map((v) => v.sale_price).filter((p) => p > 0);
  const basePrices = variants.map((v) => v.base_price).filter((p) => p > 0);
  const costPrices = variants.map((v) => v.cost_price).filter((p) => p >= 0);

  const minSale = salePrices.length ? Math.min(...salePrices) : 0;
  const minBase = basePrices.length ? Math.min(...basePrices) : minSale;
  const minCost = costPrices.length ? Math.min(...costPrices) : 0;

  return {
    cost_price: minCost,
    base_price: minBase,
    sale_price: minSale || undefined,
  };
}

async function resolveCountryId(selectedCountryId?: string | null): Promise<string | null> {
  if (selectedCountryId) return selectedCountryId;

  const { data, error } = await supabase
    .from('countries')
    .select('id')
    .eq('code', 'EG')
    .maybeSingle();

  if (error) {
    console.warn('[useBooks] failed to resolve EG country:', error.message);
    return null;
  }

  return data?.id ?? null;
}

async function fetchCountryPriceMap(
  productIds: string[],
  selectedCountryId?: string | null
): Promise<Record<string, CountryPriceRow>> {
  if (!selectedCountryId || productIds.length === 0) return {};

  const { data, error } = await supabase
    .from('product_country_prices')
    .select('product_id, country_id, cost_price, base_price, sale_price')
    .eq('country_id', selectedCountryId)
    .in('product_id', productIds);

  if (error) {
    console.warn('[useBooks] product_country_prices fallback:', error.message);
    return {};
  }

  const map: Record<string, CountryPriceRow> = {};
  for (const row of (data ?? []) as CountryPriceRow[]) {
    map[row.product_id] = row;
  }
  return map;
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
    console.warn('[useBooks] product_variant_country_prices fallback:', error.message);
    return {};
  }

  const map: Record<string, VariantCountryPriceRow> = {};
  for (const row of (data ?? []) as VariantCountryPriceRow[]) {
    map[row.variant_id] = row;
  }
  return map;
}

async function fetchVariantInventoryMap(
  variantIds: string[],
  selectedCountryId?: string | null
): Promise<Record<string, VariantInventoryRow>> {
  if (!selectedCountryId || variantIds.length === 0) return {};

  const { data, error } = await supabase
    .from('product_inventory')
    .select('id, product_id, variant_id, country_id, stock, reserved_stock, min_stock')
    .eq('country_id', selectedCountryId)
    .in('variant_id', variantIds);

  if (error) {
    console.warn('[useBooks] product_inventory variant map fallback:', error.message);
    return {};
  }

  const map: Record<string, VariantInventoryRow> = {};
  for (const row of (data ?? []) as VariantInventoryRow[]) {
    if (row.variant_id) map[row.variant_id] = row;
  }
  return map;
}

/* ── Fetch all products (global book data + selected-country prices) ── */
export function useProducts() {
  const { selectedCountry } = useCountry();

  return useQuery({
    queryKey: ['products', selectedCountry?.id ?? 'all'],
    staleTime: 60_000,
    queryFn: async (): Promise<Product[]> => {
      const selectedCountryId = selectedCountry?.id ?? null;

      const { data, error } = await supabase
        .from('products')
        .select(`
          id, title, author, description, cover_url, category_id, isbn, keywords,
          type, cost_price, base_price, sale_price, profit, is_active, created_at, updated_at,
          categories(id, name, slug),
          product_variants(id, product_id, variant_name, variant_type, sku, price, cost_price, base_price, sale_price, weight_kg),
          electronic_books(id, product_id, file_path, file_format, is_sold_once, file_size_mb, protected, watermark),
          product_series(series_id, book_series(id, name, author))
        `)
        .order('created_at', { ascending: false })
        .limit(300);

      if (error) throw error;

      const products = (data ?? []) as Product[];
      if (products.length === 0) return [];

      const productIds = products.map((p) => p.id);
      const allVariantIds = products.flatMap((p) => (p.product_variants ?? []).map((v) => v.id));

      const [imagesResult, variantPriceMap, variantInventoryMap] = await Promise.all([
        supabase
          .from('product_images')
          .select('id, product_id, url, alt_text, sort_order, is_primary, created_at')
          .in('product_id', productIds)
          .order('sort_order'),
        fetchVariantCountryPriceMap(allVariantIds, selectedCountryId),
        fetchVariantInventoryMap(allVariantIds, selectedCountryId),
      ]);

      const imagesByProduct: Record<string, ProductImage[]> = {};
      for (const img of (imagesResult.data ?? []) as (ProductImage & { product_id: string })[]) {
        if (!imagesByProduct[img.product_id]) imagesByProduct[img.product_id] = [];
        imagesByProduct[img.product_id].push(img);
      }

      return products.map((p) => {
        const scopedVariants = (p.product_variants ?? []).map((v) => {
          const override = selectedCountryId ? variantPriceMap[v.id] : undefined;
          const inv = selectedCountryId ? variantInventoryMap[v.id] : undefined;

          const fallbackCost = num(v.cost_price, 0);
          const fallbackBase = num(v.base_price ?? v.price, 0);
          const fallbackSale = normalizeSale(fallbackBase, v.sale_price ?? v.price ?? fallbackBase);

          // When a country is selected, do NOT fall back to another country's/global price.
          // Missing country price should appear as 0 so the admin knows this country needs pricing.
          const cost = selectedCountryId ? num(override?.cost_price, 0) : fallbackCost;
          const base = selectedCountryId ? num(override?.base_price, 0) : fallbackBase;
          const sale = selectedCountryId
            ? num(override?.sale_price ?? override?.price, 0)
            : fallbackSale;

          return {
            ...v,
            cost_price: cost,
            base_price: base,
            sale_price: sale > 0 ? sale : null,
            price: sale > 0 ? sale : 0,
            stock: inv?.stock ?? null,
            reserved_stock: inv?.reserved_stock ?? null,
            min_stock: inv?.min_stock ?? null,
            country_id: selectedCountryId,
          };
        });

        const pricedVariants = scopedVariants.filter(
          (v) => num(v.sale_price ?? v.price, 0) > 0
        );

        const finalCost = pricedVariants.length
          ? Math.min(...pricedVariants.map((v) => num(v.cost_price, 0)))
          : selectedCountryId
            ? 0
            : p.cost_price;

        const finalBase = pricedVariants.length
          ? Math.max(...pricedVariants.map((v) => num(v.base_price ?? v.price, 0)))
          : selectedCountryId
            ? 0
            : p.base_price;

        const finalSale = pricedVariants.length
          ? Math.min(...pricedVariants.map((v) => num(v.sale_price ?? v.price, 0)))
          : selectedCountryId
            ? undefined
            : p.sale_price ?? undefined;

        const finalProfit = finalSale ? finalSale - finalCost : 0;

        return {
          ...p,
          cost_price: finalCost,
          base_price: finalBase,
          sale_price: finalSale,
          profit: finalProfit,
          product_variants: scopedVariants,
          product_images: imagesByProduct[p.id] ?? [],
        };
      });
    },
  });
}

/* ── Fetch categories ── */
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, slug')
        .order('name');

      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });
}

/* ── Fetch series ── */
export function useBookSeries() {
  return useQuery({
    queryKey: ['book_series'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('book_series')
        .select('id, name, author')
        .order('name');

      if (error) throw error;
      return (data ?? []) as BookSeries[];
    },
  });
}

/* ── Upsert (add/edit) product with variants as the source of truth ── */
export function useUpsertProduct() {
  const qc = useQueryClient();
  const { selectedCountry } = useCountry();

  return useMutation({
    mutationFn: async (input: UpsertProductInput) => {
      if (!input.variants || input.variants.length === 0) {
        throw new Error('يجب إضافة نسخة واحدة على الأقل للكتاب');
      }

      const normalizedVariants = input.variants.map(normalizeVariant);

      for (const variant of normalizedVariants) {
        if (!variant.variant_name) throw new Error('اسم النسخة مطلوب');
        if (variant.base_price <= 0) throw new Error(`السعر الأساسي مطلوب للنسخة: ${variant.variant_name}`);
        if (variant.sale_price <= 0) throw new Error(`سعر البيع مطلوب للنسخة: ${variant.variant_name}`);
        if (variant.sale_price > variant.base_price) {
          throw new Error(`سعر البيع لا يجب أن يكون أكبر من السعر الأساسي في النسخة: ${variant.variant_name}`);
        }
      }

      const isEdit = !!input.id;
      let productId = input.id ?? '';
      const countryId = await resolveCountryId(selectedCountry?.id);
      const summary = summarizeVariants(normalizedVariants);

      if (isEdit) {
        const { data: updated, error: updateErr } = await supabase
          .from('products')
          .update({
            title: input.title,
            author: input.author,
            description: input.description,
            cover_url: input.cover_url,
            category_id: input.category_id || null,
            isbn: input.isbn || null,
            keywords: input.keywords,
            type: input.type,
            cost_price: summary.cost_price,
            base_price: summary.base_price,
            sale_price: summary.sale_price ?? null,
            is_active: input.is_active ?? true,
          })
          .eq('id', input.id!)
          .select()
          .single();

        if (updateErr) throw updateErr;
        productId = updated.id;
      } else {
        const { data: created, error: createErr } = await supabase
          .from('products')
          .insert({
            title: input.title,
            author: input.author,
            description: input.description,
            cover_url: input.cover_url,
            category_id: input.category_id || null,
            isbn: input.isbn || null,
            keywords: input.keywords,
            type: input.type,
            cost_price: summary.cost_price,
            base_price: summary.base_price,
            sale_price: summary.sale_price ?? null,
            is_active: input.is_active ?? true,
          })
          .select()
          .single();

        if (createErr) throw createErr;
        productId = created.id;
      }

      if (countryId) {
        await supabase
          .from('product_country_prices')
          .upsert(
            {
              product_id: productId,
              country_id: countryId,
              cost_price: summary.cost_price,
              base_price: summary.base_price,
              sale_price: summary.sale_price ?? null,
            },
            { onConflict: 'product_id,country_id' }
          )
          .then(({ error }) => {
            if (error) console.warn('[useBooks] product_country_prices summary fallback:', error.message);
          });
      }

      const { data: oldVariantsData } = await supabase
        .from('product_variants')
        .select('id')
        .eq('product_id', productId);

      const oldVariantIds = ((oldVariantsData ?? []) as { id: string }[]).map((v) => v.id);
      const keptVariantIds: string[] = [];

      for (const variant of normalizedVariants) {
        const payload = {
          product_id: productId,
          variant_name: variant.variant_name,
          variant_type: variant.variant_type,
          sku: variant.sku || null,
          cost_price: variant.cost_price,
          base_price: variant.base_price,
          sale_price: variant.sale_price,
          price: variant.sale_price,
          weight_kg: variant.weight_kg,
        };

        let savedVariant: ProductVariant;
        if (isUuid(variant.id)) {
          const { data: updatedVariant, error: updateVariantErr } = await supabase
            .from('product_variants')
            .update(payload)
            .eq('id', variant.id!)
            .select()
            .single();

          if (updateVariantErr) throw updateVariantErr;
          savedVariant = updatedVariant as ProductVariant;
        } else {
          const { data: insertedVariant, error: insertVariantErr } = await supabase
            .from('product_variants')
            .insert(payload)
            .select()
            .single();

          if (insertVariantErr) throw insertVariantErr;
          savedVariant = insertedVariant as ProductVariant;
        }

        keptVariantIds.push(savedVariant.id);

        if (countryId) {
          await supabase
            .from('product_variant_country_prices')
            .upsert(
              {
                variant_id: savedVariant.id,
                country_id: countryId,
                cost_price: variant.cost_price,
                base_price: variant.base_price,
                sale_price: variant.sale_price,
                price: variant.sale_price,
              },
              { onConflict: 'variant_id,country_id' }
            )
            .then(({ error }) => {
              if (error) console.warn('[useBooks] product_variant_country_prices fallback:', error.message);
            });
        }

        if (variant.variant_type === 'مادي') {
          if (!countryId) throw new Error('يجب اختيار دولة قبل حفظ مخزون النسخة المادية');

          const { error: invErr } = await supabase
            .from('product_inventory')
            .upsert(
              {
                product_id: productId,
                variant_id: savedVariant.id,
                country_id: countryId,
                stock: variant.stock,
                reserved_stock: variant.reserved_stock,
                min_stock: variant.min_stock,
              },
              { onConflict: 'product_id,country_id,variant_id' }
            );

          if (invErr) throw invErr;
        } else if (countryId) {
          // Digital variants are shown in inventory as unlimited virtual rows, not stored as physical stock.
          await supabase
            .from('product_inventory')
            .delete()
            .eq('variant_id', savedVariant.id)
            .eq('country_id', countryId)
            .then(() => {})
            .catch(() => {});
        }
      }

      const removedVariantIds = oldVariantIds.filter((id) => !keptVariantIds.includes(id));
      if (removedVariantIds.length > 0) {
        await supabase.from('product_inventory').delete().in('variant_id', removedVariantIds).then(() => {}).catch(() => {});
        await supabase.from('product_variant_country_prices').delete().in('variant_id', removedVariantIds).then(() => {}).catch(() => {});
        await supabase.from('product_variants').delete().in('id', removedVariantIds);
      }

      // A product that has variants must not keep a base inventory row; it causes duplicate inventory display.
      await supabase
        .from('product_inventory')
        .delete()
        .eq('product_id', productId)
        .is('variant_id', null)
        .then(() => {})
        .catch(() => {});

      // Electronic book entry
      const hasDigital = normalizedVariants.some((v) => v.variant_type === 'رقمي');
      if (hasDigital) {
        const ebookPayload = {
          product_id: productId,
          file_path: input.ebookFilePath || null,
          file_format: 'PDF',
          is_sold_once: true,
          protected: true,
          watermark: true,
        };

        await supabase
          .from('electronic_books')
          .upsert(ebookPayload, { onConflict: 'product_id' });
      } else if (isEdit) {
        await supabase.from('electronic_books').delete().eq('product_id', productId);
      }

      // Sync series
      if (isEdit) {
        await supabase.from('product_series').delete().eq('product_id', productId);
      }

      if (input.seriesIds && input.seriesIds.length > 0) {
        const seriesData = input.seriesIds.map((sid, idx) => ({
          product_id: productId,
          series_id: sid,
          sort_order: idx,
        }));
        await supabase.from('product_series').insert(seriesData);
      }

      // Additional images
      if (input.additionalImages && input.additionalImages.length > 0) {
        const imgData = input.additionalImages.map((img, idx) => ({
          product_id: productId,
          url: img.url,
          alt_text: img.alt_text || null,
          sort_order: idx,
          is_primary: img.is_primary ?? false,
        }));
        await supabase.from('product_images').insert(imgData);
      }

      return { id: productId };
    },
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      toast.success(input.id ? 'تم تحديث الكتاب بنجاح' : 'تم إضافة الكتاب بنجاح');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ── Delete product ── */
export function useDeleteProduct() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('product_country_prices').delete().eq('product_id', id).then(() => {}).catch(() => {});
      await supabase.from('product_inventory').delete().eq('product_id', id).then(() => {}).catch(() => {});
      await supabase.from('product_variants').select('id').eq('product_id', id).then(async ({ data }) => {
        const variantIds = (data ?? []).map((v: any) => v.id);
        if (variantIds.length > 0) {
          await supabase.from('product_variant_country_prices').delete().in('variant_id', variantIds).then(() => {}).catch(() => {});
        }
      }).catch(() => {});

      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('تم حذف الكتاب');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ── Toggle active status ── */
export function useToggleProductStatus() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('products')
        .update({ is_active })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('تم تحديث حالة الكتاب');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ── Upload cover image ── */
export async function uploadCoverImage(file: File, productId: string): Promise<string> {
  const ext = file.name.split('.').pop();
  const path = `covers/${productId}.${ext}`;
  const { error } = await supabase.storage
    .from('book-covers')
    .upload(path, file, { upsert: true });

  if (error) throw error;

  const { data } = supabase.storage.from('book-covers').getPublicUrl(path);
  return data.publicUrl;
}

/* ── Upload ebook PDF ── */
export async function uploadEbookFile(file: File, productId: string): Promise<string> {
  const ext = file.name.split('.').pop();
  const path = `ebooks/${productId}.${ext}`;
  const { error } = await supabase.storage
    .from('ebooks')
    .upload(path, file, { upsert: true });

  if (error) throw error;
  return path;
}

/* ── Product images hooks ── */
export function useProductImages(productId: string) {
  return useQuery({
    queryKey: ['product-images', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_images')
        .select('*')
        .eq('product_id', productId)
        .order('sort_order');

      if (error) throw error;
      return (data ?? []) as ProductImage[];
    },
    enabled: !!productId,
  });
}

export function useDeleteProductImage() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, url }: { id: string; url: string }) => {
      if (url.includes('product-images')) {
        const parts = url.split('/product-images/');
        if (parts[1]) {
          await supabase.storage.from('product-images').remove([parts[1]]);
        }
      }

      const { error } = await supabase.from('product_images').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-images'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success('تم حذف الصورة');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useSetPrimaryImage() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      imageId,
      productId,
      imageUrl,
    }: {
      imageId: string;
      productId: string;
      imageUrl: string;
    }) => {
      await supabase.from('product_images').update({ is_primary: false }).eq('product_id', productId);
      await supabase.from('product_images').update({ is_primary: true }).eq('id', imageId);
      await supabase.from('products').update({ cover_url: imageUrl }).eq('id', productId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-images'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success('تم تعيين الصورة الرئيسية');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ── Upload additional product image ── */
export async function uploadProductImage(file: File, productId: string): Promise<string> {
  const ext = file.name.split('.').pop();
  const path = `${productId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('product-images')
    .upload(path, file, { upsert: false });

  if (error) throw error;

  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  return data.publicUrl;
}

/* ── Get signed URL for ebook download ── */
export async function getEbookSignedUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('ebooks')
    .createSignedUrl(filePath, 60 * 60 * 24);

  if (error) throw error;
  return data.signedUrl;
}
