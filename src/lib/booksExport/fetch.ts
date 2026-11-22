import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/reports/download';
import type { ExportBook } from './rows';

/**
 * Every book with what the export needs (the books list shows only the newest 300, and the export must not stop there),
 * read in pages with a stable order.
 */
export function fetchBooksForExport(): Promise<ExportBook[]> {
  return fetchAllPages<ExportBook>((from, to) =>
    supabase
      .from('products')
      .select(`
        id, title, author, publisher, publication_year, page_count, description, keywords, isbn, cover_url, is_active, created_at, updated_at,
        categories!products_category_id_fkey(name),
        product_categories(categories(name)),
        product_series(book_series(name)),
        electronic_books(file_format, file_size_mb),
        product_variants(sku, variant_name, variant_type, weight_kg, cost_price, base_price, sale_price, price, sale_channel, iap_product_id)
      `)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to) as unknown as PromiseLike<{ data: ExportBook[] | null; error: { message: string } | null }>,
  );
}
