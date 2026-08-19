import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useCountry } from '@/contexts/CountryContext';

/* ── Upload a cover image file, return its public URL (bucket is public) ── */
export async function uploadSeriesCover(file: File): Promise<string> {
  const ext = file.name.split('.').pop();
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from('series-images')
    .upload(path, file, { upsert: false });

  if (error) throw error;

  const { data } = supabase.storage.from('series-images').getPublicUrl(path);
  return data.publicUrl;
}

/* ── Types ── */
export interface BookSeries {
  id: string;
  name: string;
  description?: string | null;
  cover_url?: string | null;
  author?: string | null;
  year?: number | null;
  sort_order: number;
  is_active: boolean;
  total_sales: number;
  created_at: string;
  books_count?: number;
}

export interface SeriesBook {
  product_id: string;
  series_id: string;
  sort_order: number;
  products: {
    id: string;
    title: string;
    author: string;
    cover_url?: string | null;
    type: string;
    is_active: boolean;
    base_price: number;
    sale_price?: number | null;
  } | null;
}

type CountryPriceRow = {
  product_id: string;
  country_id: string;
  base_price: number;
  sale_price?: number | null;
};

async function fetchScopedProductIds(selectedCountryId?: string | null): Promise<string[] | null> {
  if (!selectedCountryId) return null;

  const { data, error } = await supabase
    .from('product_inventory')
    .select('product_id')
    .eq('country_id', selectedCountryId);

  if (error) {
    console.warn('[useSeries] product_inventory fallback:', error.message);
    return null;
  }

  return Array.from(
    new Set(
      ((data ?? []) as { product_id: string }[])
        .map((row) => row.product_id)
        .filter(Boolean)
    )
  );
}

async function fetchCountryPriceMap(
  productIds: string[],
  selectedCountryId?: string | null
): Promise<Record<string, CountryPriceRow>> {
  if (!selectedCountryId || productIds.length === 0) return {};

  const { data, error } = await supabase
    .from('product_country_prices')
    .select('product_id, country_id, base_price, sale_price')
    .eq('country_id', selectedCountryId)
    .in('product_id', productIds);

  if (error) {
    console.warn('[useSeries] product_country_prices fallback:', error.message);
    return {};
  }

  const map: Record<string, CountryPriceRow> = {};
  for (const row of (data ?? []) as CountryPriceRow[]) {
    map[row.product_id] = row;
  }
  return map;
}

/* ── Fetch all series with country-aware book count ── */
export function useSeriesList() {
  const { selectedCountry } = useCountry();

  return useQuery({
    queryKey: ['book-series', selectedCountry?.id ?? 'all'],
    queryFn: async (): Promise<BookSeries[]> => {
      const scopedIds = await fetchScopedProductIds(selectedCountry?.id);

      const { data, error } = await supabase
        .from('book_series')
        .select(`
          id,
          name,
          description,
          cover_url,
          author,
          year,
          sort_order,
          is_active,
          total_sales,
          created_at,
          product_series(product_id)
        `)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;

      return ((data ?? []) as (BookSeries & { product_series: { product_id: string }[] })[]).map((s) => {
        const productIds = (s.product_series ?? []).map((p) => p.product_id);
        const booksCount =
          Array.isArray(scopedIds)
            ? productIds.filter((id) => scopedIds.includes(id)).length
            : productIds.length;

        return {
          ...s,
          books_count: booksCount,
        };
      });
    },
  });
}

/* ── Fetch books in a specific series (country-aware display) ── */
export function useSeriesBooks(seriesId: string | null) {
  const { selectedCountry } = useCountry();

  return useQuery({
    queryKey: ['series-books', seriesId, selectedCountry?.id ?? 'all'],
    enabled: !!seriesId,
    queryFn: async (): Promise<SeriesBook[]> => {
      const scopedIds = await fetchScopedProductIds(selectedCountry?.id);

      if (Array.isArray(scopedIds) && scopedIds.length === 0) {
        return [];
      }

      let query = supabase
        .from('product_series')
        .select(`
          product_id,
          series_id,
          sort_order,
          products(id, title, author, cover_url, type, is_active, base_price, sale_price)
        `)
        .eq('series_id', seriesId!)
        .order('sort_order', { ascending: true });

      if (Array.isArray(scopedIds) && scopedIds.length > 0) {
        query = query.in('product_id', scopedIds);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []) as SeriesBook[];
      const productIds = rows.map((r) => r.product_id).filter(Boolean);
      const priceMap = await fetchCountryPriceMap(productIds, selectedCountry?.id);

      return rows.map((row) => ({
        ...row,
        products: row.products
          ? {
              ...row.products,
              base_price: priceMap[row.product_id]?.base_price ?? row.products.base_price,
              sale_price: priceMap[row.product_id]?.sale_price ?? row.products.sale_price,
            }
          : null,
      }));
    },
  });
}

/* ── Fetch products not in a specific series (country-aware availability) ── */
export function useAvailableProducts(seriesId: string | null) {
  const { selectedCountry } = useCountry();

  return useQuery({
    queryKey: ['available-products', seriesId, selectedCountry?.id ?? 'all'],
    enabled: !!seriesId,
    queryFn: async () => {
      const scopedIds = await fetchScopedProductIds(selectedCountry?.id);

      if (Array.isArray(scopedIds) && scopedIds.length === 0) {
        return [];
      }

      const { data: existing, error: existingErr } = await supabase
        .from('product_series')
        .select('product_id')
        .eq('series_id', seriesId!);

      if (existingErr) throw existingErr;

      const existingIds = new Set(((existing ?? []) as { product_id: string }[]).map((e) => e.product_id));
      const allowedIds = Array.isArray(scopedIds)
        ? scopedIds.filter((id) => !existingIds.has(id))
        : null;

      if (Array.isArray(allowedIds) && allowedIds.length === 0) {
        return [];
      }

      let query = supabase
        .from('products')
        .select('id, title, author, cover_url, type, base_price, sale_price')
        .eq('is_active', true)
        .order('title');

      if (Array.isArray(allowedIds) && allowedIds.length > 0) {
        query = query.in('id', allowedIds);
      } else if (!Array.isArray(allowedIds) && existingIds.size > 0) {
        query = query.not('id', 'in', `(${Array.from(existingIds).join(',')})`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []) as {
        id: string;
        title: string;
        author: string;
        cover_url?: string | null;
        type: string;
        base_price: number;
        sale_price?: number | null;
      }[];

      const priceMap = await fetchCountryPriceMap(rows.map((r) => r.id), selectedCountry?.id);

      return rows.map((row) => ({
        ...row,
        base_price: priceMap[row.id]?.base_price ?? row.base_price,
        sale_price: priceMap[row.id]?.sale_price ?? row.sale_price,
      }));
    },
  });
}

/* ── Create series ── */
export function useCreateSeries() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      author?: string;
      description?: string;
      cover_url?: string;
      year?: number | null;
      is_active: boolean;
    }) => {
      const { error } = await supabase.from('book_series').insert(input);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['book-series'] });
      toast.success('تمت إضافة السلسلة بنجاح');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ── Update series ── */
export function useUpdateSeries() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: string;
      name?: string;
      author?: string | null;
      description?: string | null;
      cover_url?: string | null;
      year?: number | null;
      is_active?: boolean;
      sort_order?: number;
    }) => {
      const { error } = await supabase.from('book_series').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['book-series'] });
      toast.success('تم تحديث السلسلة');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ── Delete series ── */
export function useDeleteSeries() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('book_series').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['book-series'] });
      toast.success('تم حذف السلسلة');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ── Add book to series ── */
export function useAddBookToSeries() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      seriesId,
      productId,
      sortOrder,
    }: {
      seriesId: string;
      productId: string;
      sortOrder: number;
    }) => {
      const { error } = await supabase
        .from('product_series')
        .insert({ series_id: seriesId, product_id: productId, sort_order: sortOrder });

      if (error) throw error;
    },
    onSuccess: (_, { seriesId }) => {
      qc.invalidateQueries({ queryKey: ['series-books', seriesId] });
      qc.invalidateQueries({ queryKey: ['available-products', seriesId] });
      qc.invalidateQueries({ queryKey: ['book-series'] });
      toast.success('تمت إضافة الكتاب للسلسلة');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ── Remove book from series ── */
export function useRemoveBookFromSeries() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      seriesId,
      productId,
    }: {
      seriesId: string;
      productId: string;
    }) => {
      const { error } = await supabase
        .from('product_series')
        .delete()
        .eq('series_id', seriesId)
        .eq('product_id', productId);

      if (error) throw error;
    },
    onSuccess: (_, { seriesId }) => {
      qc.invalidateQueries({ queryKey: ['series-books', seriesId] });
      qc.invalidateQueries({ queryKey: ['available-products', seriesId] });
      qc.invalidateQueries({ queryKey: ['book-series'] });
      toast.success('تم إزالة الكتاب من السلسلة');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ── Update book sort order in series ── */
export function useUpdateBookSortOrder() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      seriesId,
      productId,
      sortOrder,
    }: {
      seriesId: string;
      productId: string;
      sortOrder: number;
    }) => {
      const { error } = await supabase
        .from('product_series')
        .update({ sort_order: sortOrder })
        .eq('series_id', seriesId)
        .eq('product_id', productId);

      if (error) throw error;
    },
    onSuccess: (_, { seriesId }) => {
      qc.invalidateQueries({ queryKey: ['series-books', seriesId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
