import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/imageCompression';
import { fetchReportOrders } from '@/lib/reports/data';
import type { ResolvedPeriod } from '@/lib/reports/period';
import { salesRanking, type BookSales } from '@/lib/bestSellers';

/* What the "إدارة الإعلانات والأشرطة" page edits on the store: the offers strip, the category strip,
   the boxes above the footer, the "الأكثر مبيعًا" row, and the videos section's title. */

const fail = (e: Error) => toast.error(e.message);

/* ── One row of content settings ───────────────────────────────────── */
export interface SiteContentSettings {
  all_books_in_bar: boolean;
  intro_videos_title: string;
}

export function useSiteContentSettings() {
  return useQuery({
    queryKey: ['site-content-settings'],
    queryFn: async (): Promise<SiteContentSettings> => {
      const { data, error } = await supabase
        .from('site_content_settings')
        .select('all_books_in_bar, intro_videos_title')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      return (data as SiteContentSettings | null) ?? { all_books_in_bar: true, intro_videos_title: 'فيديوهات تعريفية' };
    },
  });
}

export function useUpdateSiteContentSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<SiteContentSettings>) => {
      const { error } = await supabase.from('site_content_settings').update(patch).eq('id', 1);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['site-content-settings'] });
      toast.success('تم الحفظ');
    },
    onError: fail,
  });
}

/* ── The offers strip ──────────────────────────────────────────────── */
export interface Announcement {
  id: string;
  message: string;
  link_url: string | null;
  is_active: boolean;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
}

export function useAnnouncements() {
  return useQuery({
    queryKey: ['site-announcements'],
    queryFn: async (): Promise<Announcement[]> => {
      const { data, error } = await supabase
        .from('site_announcements')
        .select('id, message, link_url, is_active, sort_order, starts_at, ends_at')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Announcement[];
    },
  });
}

export type AnnouncementInput = Omit<Announcement, 'id'>;

export function useSaveAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...row }: Partial<Announcement> & { id?: string }) => {
      const { error } = id
        ? await supabase.from('site_announcements').update(row).eq('id', id)
        : await supabase.from('site_announcements').insert(row);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['site-announcements'] });
      if (vars.message !== undefined) toast.success(vars.id ? 'تم الحفظ' : 'تمت إضافة الرسالة');
    },
    onError: fail,
  });
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('site_announcements').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['site-announcements'] });
      toast.success('تم حذف الرسالة');
    },
    onError: fail,
  });
}

/** Swaps the order of two rows of a table that has id + sort_order. */
export function useSwapOrder(table: 'site_announcements' | 'home_feature_boxes', queryKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ a, b }: { a: { id: string; sort_order: number }; b: { id: string; sort_order: number } }) => {
      // Equal orders (rows added together) would swap to the same thing: give them distinct ones.
      const [first, second] = a.sort_order === b.sort_order ? [b.sort_order + 1, a.sort_order] : [b.sort_order, a.sort_order];
      const results = await Promise.all([
        supabase.from(table).update({ sort_order: first }).eq('id', a.id),
        supabase.from(table).update({ sort_order: second }).eq('id', b.id),
      ]);
      const error = results.find((r) => r.error)?.error;
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [queryKey] }),
    onError: fail,
  });
}

/* ── The category strip ────────────────────────────────────────────── */
export interface CategoryBarRow {
  id: string;
  name: string;
  slug: string;
  /** Books in it, as their own category or an extra one. */
  books: number;
  is_visible: boolean;
  /** null: no place given yet (shown after the ordered ones, alphabetically). */
  sort_order: number | null;
}

export function useCategoryBarRows() {
  return useQuery({
    queryKey: ['category-bar-rows'],
    queryFn: async (): Promise<CategoryBarRow[]> => {
      const [cats, items, products, extras] = await Promise.all([
        supabase.from('categories').select('id, name, slug'),
        supabase.from('category_bar_items').select('category_id, is_visible, sort_order'),
        supabase.from('products').select('id, category_id').eq('is_active', true),
        supabase.from('product_categories').select('product_id, category_id'),
      ]);
      const error = cats.error || items.error || products.error || extras.error;
      if (error) throw error;

      const active = new Set((products.data ?? []).map((p) => p.id as string));
      const booksIn = new Map<string, Set<string>>();
      const count = (categoryId: string | null, productId: string) => {
        if (!categoryId || !active.has(productId)) return;
        if (!booksIn.has(categoryId)) booksIn.set(categoryId, new Set());
        booksIn.get(categoryId)!.add(productId);
      };
      (products.data ?? []).forEach((p) => count(p.category_id as string | null, p.id as string));
      (extras.data ?? []).forEach((e) => count(e.category_id as string, e.product_id as string));

      const placed = new Map((items.data ?? []).map((i) => [i.category_id as string, i as { is_visible: boolean; sort_order: number }]));
      return (cats.data ?? [])
        .map((c) => ({
          id: c.id as string,
          name: String(c.name).trim(),
          slug: String(c.slug ?? ''),
          books: booksIn.get(c.id as string)?.size ?? 0,
          is_visible: placed.get(c.id as string)?.is_visible ?? true,
          sort_order: placed.get(c.id as string)?.sort_order ?? null,
        }))
        .sort((a, b) => {
          if (a.sort_order != null && b.sort_order != null) return a.sort_order - b.sort_order;
          if (a.sort_order != null) return -1;
          if (b.sort_order != null) return 1;
          return a.name.localeCompare(b.name, 'ar');
        });
    },
  });
}

/** Saves the whole strip as shown: every category's place and whether it shows. */
export function useSaveCategoryBar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: { id: string; is_visible: boolean }[]) => {
      const { error } = await supabase
        .from('category_bar_items')
        .upsert(rows.map((r, i) => ({ category_id: r.id, is_visible: r.is_visible, sort_order: i })), { onConflict: 'category_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['category-bar-rows'] });
      toast.success('تم حفظ شريط التصنيفات');
    },
    onError: fail,
  });
}

/* ── The boxes above the footer ────────────────────────────────────── */
export interface FeatureBox {
  id: string;
  title: string;
  description: string | null;
  icon_key: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
}

export function useFeatureBoxes() {
  return useQuery({
    queryKey: ['home-feature-boxes'],
    queryFn: async (): Promise<FeatureBox[]> => {
      const { data, error } = await supabase
        .from('home_feature_boxes')
        .select('id, title, description, icon_key, image_url, sort_order, is_active')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as FeatureBox[];
    },
  });
}

export function useSaveFeatureBox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...row }: Partial<FeatureBox> & { id?: string }) => {
      const { error } = id
        ? await supabase.from('home_feature_boxes').update(row).eq('id', id)
        : await supabase.from('home_feature_boxes').insert(row);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['home-feature-boxes'] });
      if (vars.title !== undefined) toast.success(vars.id ? 'تم الحفظ' : 'تمت إضافة المربع');
    },
    onError: fail,
  });
}

export function useDeleteFeatureBox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('home_feature_boxes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['home-feature-boxes'] });
      toast.success('تم حذف المربع');
    },
    onError: fail,
  });
}

/** A box's picture, shrunk in the browser first (a small icon-sized image is plenty). */
export async function uploadSiteAsset(original: File): Promise<string> {
  const file = await compressImage(original, { maxSize: 400, keepIfSmallerThan: 60 * 1024 });
  const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg';
  const path = `feature-boxes/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('site-assets').upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return supabase.storage.from('site-assets').getPublicUrl(path).data.publicUrl;
}

/* ── "الأكثر مبيعًا" ───────────────────────────────────────────────── */
export function useBestSellerPicks() {
  return useQuery({
    queryKey: ['home-best-sellers'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('home_best_sellers')
        .select('product_id')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => r.product_id as string);
    },
  });
}

/** Saves the row as given: the books in it, in this order (the ones taken out are removed). */
export function useSaveBestSellerPicks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ picks, before }: { picks: string[]; before: string[] }) => {
      const removed = before.filter((id) => !picks.includes(id));
      if (removed.length) {
        const { error } = await supabase.from('home_best_sellers').delete().in('product_id', removed);
        if (error) throw error;
      }
      if (picks.length) {
        const { error } = await supabase
          .from('home_best_sellers')
          .upsert(picks.map((product_id, sort_order) => ({ product_id, sort_order })), { onConflict: 'product_id' });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['home-best-sellers'] });
      toast.success('تم حفظ «الأكثر مبيعًا»');
    },
    onError: fail,
  });
}

export type SalesWindow = 30 | 90 | 'all';

/** Every book with its sales in the window (cancelled and returned orders left out), best first. */
export function useBookSales(window: SalesWindow) {
  return useQuery({
    queryKey: ['book-sales-ranking', window],
    queryFn: async (): Promise<BookSales[]> => {
      const from = window === 'all' ? null : new Date(Date.now() - window * 24 * 60 * 60 * 1000);
      const period: ResolvedPeriod = { preset: window === 'all' ? 'all' : 'custom', from, to: null, label: '', rangeLabel: '', slug: '' };
      const [orders, products, stock] = await Promise.all([
        fetchReportOrders(period, null),
        supabase.from('products').select('id, title, author, cover_url, is_active, is_bundle'),
        supabase.from('product_inventory').select('product_id, stock, reserved_stock'),
      ]);
      if (products.error) throw products.error;
      const inStock = new Map<string, number>();
      for (const row of (stock.data ?? []) as { product_id: string; stock: number | null; reserved_stock: number | null }[]) {
        inStock.set(row.product_id, (inStock.get(row.product_id) ?? 0) + Math.max(0, (row.stock ?? 0) - (row.reserved_stock ?? 0)));
      }
      return salesRanking(
        orders,
        (products.data ?? []) as { id: string; title: string; author: string | null; cover_url: string | null; is_active: boolean; is_bundle: boolean }[],
        stock.error ? null : inStock,
      );
    },
  });
}
