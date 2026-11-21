import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { SHELF_KIND, shelfKeyFor, type HomeShelf } from '@/lib/homeShelves';

const COLUMNS = 'section_key, node_id, title_ar, item_limit, visible, sort_order';

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('row-level security') || m.includes('permission denied')) return 'مفيش عندك صلاحية على «السلاسل والتصنيفات».';
  if (m.includes('duplicate key')) return 'الرف ده موجود بالفعل.';
  return message;
}

/** The category shelves of the website's home page, in their order. */
export function useHomeShelves() {
  return useQuery({
    queryKey: ['home-shelves'],
    queryFn: async (): Promise<HomeShelf[]> => {
      const { data, error } = await supabase
        .from('home_layout').select(COLUMNS).eq('channel', 'web').eq('kind', SHELF_KIND).order('sort_order', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as HomeShelf[];
    },
  });
}

export interface ShelfInput {
  nodeId: string;
  title: string | null;
  limit: number | null;
  visible: boolean;
  /** only for a new shelf: it goes after the others */
  sortOrder: number;
}

function refresh(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['home-shelves'] });
  void qc.invalidateQueries({ queryKey: ['home-layout'] });
}

/** Adds a shelf, or changes the one that already exists for that node (the key is the node). */
export function useSaveShelf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ShelfInput) => {
      const { error } = await supabase.from('home_layout').upsert(
        {
          channel: 'web', section_key: shelfKeyFor(input.nodeId), kind: SHELF_KIND, node_id: input.nodeId,
          title_ar: input.title?.trim() || null, item_limit: input.limit, visible: input.visible, sort_order: input.sortOrder,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'channel,section_key' },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refresh(qc),
    onError: (e: Error) => toast.error(friendly(e.message)),
  });
}

export function useSetShelfVisible() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, visible }: { key: string; visible: boolean }) => {
      const { error } = await supabase.from('home_layout').update({ visible, updated_at: new Date().toISOString() }).eq('channel', 'web').eq('section_key', key);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refresh(qc),
    onError: (e: Error) => toast.error(friendly(e.message)),
  });
}

export function useDeleteShelf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => {
      const { error } = await supabase.from('home_layout').delete().eq('channel', 'web').eq('section_key', key);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refresh(qc),
    onError: (e: Error) => toast.error(friendly(e.message)),
  });
}

/** Saves a new order: the shelves' keys in the order they should have. */
export function useReorderShelves() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (keys: string[]) => {
      const results = await Promise.all(
        keys.map((key, index) =>
          supabase.from('home_layout').update({ sort_order: index, updated_at: new Date().toISOString() }).eq('channel', 'web').eq('section_key', key),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw new Error(failed.error.message);
    },
    onSuccess: () => refresh(qc),
    onError: (e: Error) => toast.error(friendly(e.message)),
  });
}
