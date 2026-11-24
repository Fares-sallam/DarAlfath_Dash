import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { friendlyCatalogError } from '@/hooks/useCatalog';

/** The cards of «أقسام المتجر», in order (the ids of existing catalog nodes). */
export function useStoreDepartments() {
  return useQuery({
    queryKey: ['store-departments'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from('store_departments').select('node_id, sort_order').order('sort_order', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => row.node_id as string);
    },
  });
}

/** Saves the list and its order in one step, and the pictures chosen for the nodes in it. */
export function useSaveStoreDepartments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, images }: { ids: string[]; images: Record<string, string | null> }) => {
      for (const [id, url] of Object.entries(images)) {
        const { error } = await supabase.from('catalog_nodes').update({ image_url: url }).eq('id', id);
        if (error) throw new Error(error.message);
      }
      const { error } = await supabase.rpc('store_departments_save', { p_node_ids: ids });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      for (const key of ['store-departments', 'catalog-nodes', 'catalog-counts', 'book-series', 'series-books']) void qc.invalidateQueries({ queryKey: [key] });
      toast.success('اتحفظ. الكروت بتتغيّر في الرئيسية خلال دقيقة');
    },
    onError: (e: Error) => toast.error(friendlyCatalogError(e.message)),
  });
}
