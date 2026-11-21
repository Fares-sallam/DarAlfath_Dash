import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { PAGE_STRIP_KIND, type HomeChannel, type HomeLayoutRow } from '@/lib/homeBlocks';

const COLUMNS = 'section_key, kind, node_id, title_ar, subtitle_ar, item_limit, visible, sort_order, starts_at, ends_at, countries, devices, config';

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('row-level security') || m.includes('permission denied')) return 'مفيش عندك صلاحية على «السلاسل والتصنيفات».';
  if (m.includes('duplicate key')) return 'الرف ده موجود بالفعل.';
  if (m.includes('product_ids') || m.includes('hand-picked')) return 'الكتب المختارة مش مقبولة (لحد 40 كتاب).';
  if (m.includes('link must be')) return 'الرابط لازم يكون صفحة جوه التطبيق (يبدأ بـ / ).';
  if (m.includes('picture must be')) return 'رابط الصورة لازم يبدأ بـ https.';
  if (m.includes('needs words or a picture')) return 'شريط الإعلان محتاج كلام أو صورة.';
  if (m.includes('home_layout_window_check')) return 'تاريخ النهاية لازم يبقى بعد تاريخ البداية.';
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

/**
 * Makes one channel's blocks exactly the given rows in ONE transaction: the listed keys are deleted, the rows written
 * (the «نسخ الترتيب» button).
 */
export function useApplyHomeLayout() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({ channel, rows, remove }: { channel: HomeChannel; rows: readonly HomeLayoutRow[]; remove: readonly string[] }) => {
      const { error } = await supabase.rpc('home_layout_apply', { p_channel: channel, p_rows: rows, p_remove: remove });
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(friendly(e.message)),
  });
}

/** The titles of some books by id (for the hand-picked shelf's list). Books that no longer exist are simply missing. */
export function useBookTitles(ids: readonly string[]) {
  const key = [...ids].sort().join(',');
  return useQuery({
    queryKey: ['home-block-book-titles', key],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Map<string, { title: string; author: string | null }>> => {
      const { data, error } = await supabase.from('products').select('id, title, author').in('id', [...ids]);
      if (error) throw new Error(error.message);
      return new Map((data ?? []).map((b: { id: string; title: string; author: string | null }) => [b.id, { title: b.title, author: b.author }]));
    },
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
