import type { SupabaseClient } from '@supabase/supabase-js';
import { nextSortOrder, planSeriesLinks } from '@/lib/seriesOrder';

/**
 * Saves the series a book belongs to. A link that stays keeps its place inside that series (the old save deleted
 * every link and re-inserted it with the position in this book's own list, which reset the series' order). Only
 * removed links are deleted, and new ones are added at the end of their series.
 */
export async function syncProductSeries(
  client: Pick<SupabaseClient, 'from'>,
  productId: string,
  desiredSeriesIds: readonly string[],
  isEdit: boolean,
): Promise<void> {
  let currentSeriesIds: string[] = [];

  if (isEdit) {
    const { data, error } = await client.from('product_series').select('series_id').eq('product_id', productId);
    if (error) throw error;
    currentSeriesIds = (data ?? []).map((row) => row.series_id as string);
  }

  const plan = planSeriesLinks(currentSeriesIds, desiredSeriesIds);

  if (plan.remove.length > 0) {
    const { error } = await client
      .from('product_series')
      .delete()
      .eq('product_id', productId)
      .in('series_id', plan.remove);
    if (error) throw error;
  }

  if (plan.add.length > 0) {
    const rows = await Promise.all(
      plan.add.map(async (seriesId) => {
        const { data, error } = await client
          .from('product_series')
          .select('sort_order')
          .eq('series_id', seriesId)
          .order('sort_order', { ascending: false })
          .limit(1);
        if (error) throw error;
        return {
          product_id: productId,
          series_id: seriesId,
          sort_order: nextSortOrder((data ?? []).map((row) => row.sort_order as number)),
        };
      }),
    );
    const { error } = await client.from('product_series').insert(rows);
    if (error) throw error;
  }
}
