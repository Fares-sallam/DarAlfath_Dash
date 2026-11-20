import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { friendlyCatalogError } from '@/hooks/useCatalog';
import type { MenuItem } from '@/lib/menuMap';

/** The menu's own message in plain Arabic (the two-level rule), then the shared catalog ones. */
function friendlyMenuError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('two levels')) return 'القايمة مستويين بس (رئيسي وفرعي). انقل الفروع الأول، ومينفعش فرعي جوه فرعي.';
  if (m.includes('fill its sub-items automatically')) return 'الفروع التلقائية للعناصر الرئيسية بس.';
  if (m.includes('menu_items_link_url')) return 'اكتب رابط للعنصر.';
  if (m.includes('menu_items_label')) return 'اكتب اسم للعنصر.';
  if (m.includes('only a main item linked')) return 'تثبيت الفروع متاح للعناصر الرئيسية المربوطة بسلسلة أو قسم أو تصنيف.';
  return friendlyCatalogError(message);
}

function refresh(qc: QueryClient) {
  void qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && ['menu-items', 'site-header-nav', 'catalog-nodes'].includes(q.queryKey[0]) });
}

export function useMenuItems() {
  return useQuery({
    queryKey: ['menu-items'],
    queryFn: async (): Promise<MenuItem[]> => {
      const { data, error } = await supabase.from('menu_items').select('*').order('sort_order', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as MenuItem[];
    },
  });
}

export interface HomeLayoutRow {
  channel: 'web' | 'app';
  section_key: string;
  kind: string;
  visible: boolean;
  sort_order: number;
  item_limit: number | null;
}

export function useHomeLayout() {
  return useQuery({
    queryKey: ['home-layout'],
    queryFn: async (): Promise<HomeLayoutRow[]> => {
      const { data, error } = await supabase.from('home_layout').select('channel, section_key, kind, visible, sort_order, item_limit').order('sort_order', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as HomeLayoutRow[];
    },
  });
}

export type MenuItemInput = Pick<MenuItem, 'kind' | 'visible' | 'sort_order'> &
  Partial<Pick<MenuItem, 'channel' | 'parent_id' | 'node_id' | 'label_ar' | 'label_en' | 'url' | 'auto_children'>>;

export function useCreateMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: MenuItemInput) => {
      const { error } = await supabase.from('menu_items').insert({ channel: 'web', ...input });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { refresh(qc); toast.success('تمت الإضافة'); },
    onError: (e: Error) => toast.error(friendlyMenuError(e.message)),
  });
}

export function useUpdateMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<MenuItem> }) => {
      const { error } = await supabase.from('menu_items').update(patch).eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refresh(qc),
    onError: (e: Error) => toast.error(friendlyMenuError(e.message)),
  });
}

export function useDeleteMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('menu_items').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { refresh(qc); toast.success('تم الحذف'); },
    onError: (e: Error) => toast.error(friendlyMenuError(e.message)),
  });
}

export function useReorderMenuItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc('menu_reorder', { p_ids: ids });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refresh(qc),
    onError: (e: Error) => toast.error(friendlyMenuError(e.message)),
  });
}

export function useMoveMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, parentId }: { id: string; parentId: string | null }) => {
      const { error } = await supabase.rpc('menu_move_item', { p_id: id, p_parent: parentId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refresh(qc),
    onError: (e: Error) => toast.error(friendlyMenuError(e.message)),
  });
}

export function useMaterializeMenuChildren() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<number> => {
      const { data, error } = await supabase.rpc('menu_materialize_children', { p_id: id });
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },
    onSuccess: (count) => { refresh(qc); toast.success(count > 0 ? `تم تثبيت ${count} فرع، تقدر تتحكم فيهم دلوقتي` : 'مفيش فروع جديدة تتثبّت'); },
    onError: (e: Error) => toast.error(friendlyMenuError(e.message)),
  });
}
