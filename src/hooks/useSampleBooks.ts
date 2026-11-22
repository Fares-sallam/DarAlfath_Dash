import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface SampleBook {
  id: string;
  title: string;
}

/**
 * A few real books to show a book's page with in the previews (the newest active ones, not bundles): the owner picks the one
 * that shows what is being edited best (a book with few copies left shows the stock note, one with a discount the badge).
 */
export function useSampleBooks() {
  return useQuery({
    queryKey: ['preview-sample-books'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SampleBook[]> => {
      const { data, error } = await supabase
        .from('products')
        .select('id, title')
        .eq('is_active', true)
        .eq('is_bundle', false)
        .order('created_at', { ascending: false })
        .limit(40);
      if (error || !data) return [];
      return (data as { id: string; title: string }[]).map((b) => ({ id: b.id, title: b.title }));
    },
  });
}
