import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { CatalogNode, Channel, NodeCounts, ProductLink } from '@/lib/catalogTree';
import { mergeSummary, undoSummary, type MergeHistoryRow, type MergeResult, type UndoResult } from '@/lib/catalogMerge';
import { refreshCatalogDependents } from '@/lib/catalogRefresh';

const PAGE = 1000;

/** The database's own messages (guards, unique keys, RLS) in plain Arabic. */
export function friendlyCatalogError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('still has books')) return 'العنصر ده فيه كتب. انقل الكتب أو شيلها منه الأول.';
  if (m.includes('still has children')) return 'العنصر ده فيه عناصر تحته. انقلها أو احذفها الأول.';
  if (m.includes('cannot be placed under itself')) return 'مينفعش تنقل العنصر تحت نفسه أو تحت أحد أبنائه.';
  if (m.includes('cannot change to type')) return 'مينفعش تغيّر نوع العنصر ده (السلسلة تفضل سلسلة، والتصنيف يتحوّل لمجموعة بس).';
  if (m.includes('categories_name_key') || (m.includes('duplicate key') && m.includes('name'))) return 'الاسم ده مستخدم قبل كده في تصنيف تاني.';
  if (m.includes('slug')) return 'الرابط المختصر (slug) ده مستخدم قبل كده. غيّره.';
  if (m.includes('row-level security') || m.includes('permission denied')) return 'مفيش عندك صلاحية على «السلاسل والتصنيفات».';
  if (m.includes('can only merge items of the same kind')) return 'الدمج بين عنصرين من نفس النوع بس (تصنيف مع تصنيف، سلسلة مع سلسلة، قسم مع قسم).';
  if (m.includes('cannot merge into an item inside itself')) return 'مينفعش تدمج عنصر في واحد جواه.';
  if (m.includes('merge needs two different items')) return 'اختار عنصرين مختلفين.';
  if (m.includes('merged again later')) return 'العنصر اللي اندمج فيه اندمج في حاجة تانية بعد كده. اتراجع عن الدمج التاني الأول.';
  if (m.includes('exists again already')) return 'العنصر ده موجود تاني بالفعل.';
  if (m.includes('no merge to undo')) return 'مفيش دمج يتراجع عنه للعنصر ده.';
  if (m.includes('before undo existed')) return 'الدمج ده اتعمل قبل ما التراجع يتوفر.';
  if (m.includes('does not exist any more')) return 'العنصر اللي اندمج فيه اتحذف، فمينفعش التراجع.';
  if (m.includes('violates foreign key')) return 'العنصر ده مربوط ببيانات تانية ومينفعش يتحذف.';
  return message;
}

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/** Everything that shows a book's places (see catalogRefresh): the catalog screens, the books list, the older pages. */
const refresh = refreshCatalogDependents;

export function useCatalogNodes() {
  return useQuery({
    queryKey: ['catalog-nodes'],
    queryFn: () =>
      fetchAll<CatalogNode>((from, to) =>
        supabase.from('catalog_nodes').select('*').order('created_at', { ascending: true }).range(from, to),
      ),
  });
}

export function useCatalogLinks() {
  return useQuery({
    queryKey: ['catalog-links'],
    queryFn: () =>
      fetchAll<ProductLink>((from, to) =>
        supabase.from('product_nodes').select('product_id, node_id, is_primary, sort_order, pinned').order('product_id').order('node_id').range(from, to),
      ),
  });
}

export function useCatalogCounts() {
  return useQuery({
    queryKey: ['catalog-counts'],
    queryFn: async (): Promise<Map<string, NodeCounts>> => {
      const { data, error } = await supabase.rpc('catalog_node_counts', { p_country: null });
      if (error) throw new Error(error.message);
      const map = new Map<string, NodeCounts>();
      for (const row of (data ?? []) as { node_id: string; books_direct: number; books_total: number }[]) {
        map.set(row.node_id, { direct: row.books_direct, total: row.books_total });
      }
      return map;
    },
  });
}

export interface CatalogProduct {
  id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  is_active: boolean;
  type: string | null;
}

export function useCatalogProducts() {
  return useQuery({
    queryKey: ['catalog-products'],
    queryFn: () =>
      fetchAll<CatalogProduct>((from, to) =>
        supabase.from('products').select('id, title, author, cover_url, is_active, type').order('title').range(from, to),
      ),
  });
}

export interface NodeBook {
  product_id: string;
  is_primary: boolean;
  sort_order: number;
  products: CatalogProduct | null;
}

export function useNodeBooks(nodeId: string | null) {
  return useQuery({
    queryKey: ['catalog-node-books', nodeId],
    enabled: !!nodeId,
    queryFn: async (): Promise<NodeBook[]> => {
      const { data, error } = await supabase
        .from('product_nodes')
        .select('product_id, is_primary, sort_order, products(id, title, author, cover_url, is_active, type)')
        .eq('node_id', nodeId!)
        .order('sort_order', { ascending: true })
        .order('product_id', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as NodeBook[];
    },
  });
}

export type NodeInput = Partial<Omit<CatalogNode, 'id' | 'created_at' | 'updated_at' | 'legacy_table' | 'legacy_id'>> &
  Pick<CatalogNode, 'type' | 'name_ar' | 'slug'>;

export function useCreateNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NodeInput): Promise<CatalogNode> => {
      const { data, error } = await supabase.from('catalog_nodes').insert(input).select('*').single();
      if (error) throw new Error(error.message);
      return data as CatalogNode;
    },
    onSuccess: () => {
      refresh(qc);
      toast.success('تمت الإضافة');
    },
    onError: (e: Error) => toast.error(friendlyCatalogError(e.message)),
  });
}

export function useUpdateNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<CatalogNode> }) => {
      const { error } = await supabase.from('catalog_nodes').update(patch).eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refresh(qc),
    onError: (e: Error) => toast.error(friendlyCatalogError(e.message)),
  });
}

export function useDeleteNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('catalog_nodes').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      refresh(qc);
      toast.success('تم الحذف');
    },
    onError: (e: Error) => toast.error(friendlyCatalogError(e.message)),
  });
}

export function useReorderNodes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, channel }: { ids: string[]; channel: Channel }) => {
      const { error } = await supabase.rpc('catalog_reorder_nodes', { p_ids: ids, p_channel: channel });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refresh(qc),
    onError: (e: Error) => toast.error(friendlyCatalogError(e.message)),
  });
}

export function useReorderNodeBooks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ nodeId, productIds }: { nodeId: string; productIds: string[] }) => {
      const { error } = await supabase.rpc('catalog_reorder_node_books', { p_node: nodeId, p_product_ids: productIds });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refresh(qc),
    onError: (e: Error) => toast.error(friendlyCatalogError(e.message)),
  });
}

export function useAddBookToNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ nodeId, productId, isPrimary, sortOrder }: { nodeId: string; productId: string; isPrimary: boolean; sortOrder: number }) => {
      const { error } = await supabase
        .from('product_nodes')
        .insert({ node_id: nodeId, product_id: productId, is_primary: isPrimary, sort_order: sortOrder });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refresh(qc),
    onError: (e: Error) => toast.error(friendlyCatalogError(e.message)),
  });
}

export function useRemoveBookFromNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ nodeId, productId }: { nodeId: string; productId: string }) => {
      const { error } = await supabase.from('product_nodes').delete().eq('node_id', nodeId).eq('product_id', productId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refresh(qc),
    onError: (e: Error) => toast.error(friendlyCatalogError(e.message)),
  });
}

export function useAssignProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { productId: string; seriesIds: string[]; primaryId: string | null; extraIds: string[] }) => {
      const { error } = await supabase.rpc('catalog_assign_product', {
        p_product: input.productId,
        p_series: input.seriesIds,
        p_primary: input.primaryId,
        p_extras: input.extraIds,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      refresh(qc);
      toast.success('تم حفظ تنظيم الكتاب');
    },
    onError: (e: Error) => toast.error(friendlyCatalogError(e.message)),
  });
}

/** The page's own list of everything that depends on a merge: the header's links, home shelves, the cards of «أقسام المتجر». */
const MERGE_DEPENDENT_KEYS = ['menu-items', 'store-departments', 'home-layout', 'home-layout-rows', 'home-blocks', 'catalog-merge-history'];

function afterMergeOrUndo(qc: QueryClient) {
  refreshCatalogDependents(qc);
  void qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && MERGE_DEPENDENT_KEYS.includes(q.queryKey[0]) });
}

async function callUnmerge(qc: QueryClient, oldId: string): Promise<UndoResult> {
  const { data, error } = await supabase.rpc('catalog_unmerge_node', { p_old_id: oldId });
  if (error) throw new Error(error.message);
  afterMergeOrUndo(qc);
  return data as UndoResult;
}

/** Merges one item into another in a single step: its books, what is under it and the links to it all move to the other one. */
export function useMergeNodes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sourceId, targetId, newName }: { sourceId: string; targetId: string; newName?: string }): Promise<MergeResult> => {
      const { data, error } = await supabase.rpc('catalog_merge_nodes', { p_source: sourceId, p_target: targetId, p_new_name: newName ?? null });
      if (error) throw new Error(error.message);
      return data as MergeResult;
    },
    onSuccess: (result, { sourceId }) => {
      afterMergeOrUndo(qc);
      // a few seconds to take it back right from the message
      toast.success(mergeSummary(result), {
        duration: 15_000,
        action: {
          label: 'تراجع',
          onClick: () => {
            callUnmerge(qc, sourceId).then((r) => toast.success(undoSummary(r))).catch((e: Error) => toast.error(friendlyCatalogError(e.message)));
          },
        },
      });
    },
    onError: (e: Error) => toast.error(friendlyCatalogError(e.message)),
  });
}

/** The merges that can still be undone, newest first. */
export function useMergeHistory() {
  return useQuery({
    queryKey: ['catalog-merge-history'],
    queryFn: async (): Promise<MergeHistoryRow[]> => {
      const { data, error } = await supabase.rpc('catalog_merge_history', { p_limit: 20 });
      if (error) throw new Error(error.message);
      return (data ?? []) as MergeHistoryRow[];
    },
  });
}

/** Puts a merged item back: the item itself, its books (primary or not, in their order) and everything that moved with it. */
export function useUnmergeNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (oldId: string) => callUnmerge(qc, oldId),
    onSuccess: (result) => toast.success(undoSummary(result)),
    onError: (e: Error) => toast.error(friendlyCatalogError(e.message)),
  });
}
