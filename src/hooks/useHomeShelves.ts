import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { PAGE_STRIP_KIND, type HomeChannel, type HomeLayoutRow } from '@/lib/homeBlocks';

const COLUMNS = 'section_key, kind, node_id, title_ar, subtitle_ar, item_limit, visible, sort_order';

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('row-level security') || m.includes('permission denied')) return 'مفيش عندك صلاحية على «السلاسل والتصنيفات».';
  if (m.includes('duplicate key')) return 'الرف ده موجود بالفعل.';
  return message;
}

/** Every saved row of a channel's home page layout (the blocks, the category shelves and, on the website, the other pages' strips). */
export function useHomeLayoutRows(channel: HomeChannel) {
  return useQuery({
    queryKey: ['home-layout-rows', channel],
    queryFn: async (): Promise<HomeLayoutRow[]> => {
      const { data, error } = await supabase.from('home_layout').select(COLUMNS).eq('channel', channel).order('sort_order', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as HomeLayoutRow[];
    },
  });
}

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['home-layout-rows'] });
    void qc.invalidateQueries({ queryKey: ['home-layout'] });
    void qc.invalidateQueries({ queryKey: ['app-home-settings'] });
  };
}

/** Saves rows (adds the ones that are new, changes the others) in one request. */
export function useSaveHomeRows(channel: HomeChannel) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (rows: readonly HomeLayoutRow[]) => {
      const now = new Date().toISOString();
      const { error } = await supabase.from('home_layout').upsert(
        rows.map((r) => ({ ...r, channel, updated_at: now })),
        { onConflict: 'channel,section_key' },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(friendly(e.message)),
  });
}

export function useDeleteHomeRow(channel: HomeChannel) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (key: string) => {
      const { error } = await supabase.from('home_layout').delete().eq('channel', channel).eq('section_key', key);
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(friendly(e.message)),
  });
}

/** One page strip (e.g. «كتب قد تعجبك») as a row. */
export function pageStripRow(key: string, strip: { visible: boolean; title: string | null; limit: number | null }): HomeLayoutRow {
  return { section_key: key, kind: PAGE_STRIP_KIND, node_id: null, title_ar: strip.title, subtitle_ar: null, item_limit: strip.limit, visible: strip.visible, sort_order: 0 };
}
