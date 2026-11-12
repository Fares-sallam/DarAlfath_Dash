import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/imageCompression';
import { DEFAULT_PROMO_SETTINGS, type PromoCard, type PromoSettings } from '@/lib/promoCards';

/* The promo panel under the app's big banner: its cards (home_promo_cards) and how they rotate (home_promo_settings,
   one row with id = 1). The admin sees every card, active or not; the app reads the active ones. */

const CARDS_KEY = ['home-promo-cards'];
const SETTINGS_KEY = ['home-promo-settings'];
const fail = (e: Error) => toast.error(e.message);

export function usePromoCards() {
  return useQuery({
    queryKey: CARDS_KEY,
    queryFn: async (): Promise<PromoCard[]> => {
      const { data, error } = await supabase
        .from('home_promo_cards')
        .select('id, title, subtitle, button_label, link_url, image_url, image_url_dark, sort_order, is_active')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PromoCard[];
    },
  });
}

export function useSavePromoCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...row }: Partial<PromoCard> & { id?: string }) => {
      const { error } = id
        ? await supabase.from('home_promo_cards').update(row).eq('id', id)
        : await supabase.from('home_promo_cards').insert(row);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: CARDS_KEY });
      // A click on the on/off switch or the arrows is not worth a toast; saving the words is.
      if (vars.title !== undefined) toast.success(vars.id ? 'تم حفظ الكارت' : 'تمت إضافة الكارت (مخفي لحد ما تظهره)');
    },
    onError: fail,
  });
}

export function useDeletePromoCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('home_promo_cards').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CARDS_KEY });
      toast.success('تم حذف الكارت');
    },
    onError: fail,
  });
}

/** Swap the order of two cards (the "move up / down" arrows). */
export function useSwapPromoCards() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ a, b }: { a: { id: string; sort_order: number }; b: { id: string; sort_order: number } }) => {
      // Equal orders (cards added together) would swap to the same thing: give them distinct ones.
      const [first, second] = a.sort_order === b.sort_order ? [b.sort_order + 1, a.sort_order] : [b.sort_order, a.sort_order];
      const results = await Promise.all([
        supabase.from('home_promo_cards').update({ sort_order: first }).eq('id', a.id),
        supabase.from('home_promo_cards').update({ sort_order: second }).eq('id', b.id),
      ]);
      const error = results.find((r) => r.error)?.error;
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CARDS_KEY }),
    onError: fail,
  });
}

export function usePromoSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async (): Promise<PromoSettings> => {
      const { data, error } = await supabase.from('home_promo_settings').select('rotate_seconds, sync_with_banner').eq('id', 1).maybeSingle();
      if (error) throw error;
      return (data as PromoSettings | null) ?? DEFAULT_PROMO_SETTINGS;
    },
  });
}

export function useSavePromoSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: PromoSettings) => {
      const { error } = await supabase.from('home_promo_settings').upsert({ id: 1, ...settings }, { onConflict: 'id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
      toast.success('تم حفظ إعدادات التبديل');
    },
    onError: fail,
  });
}

/** A card's picture. Shown about 150 points wide on a phone (3x screens: ~450px), so 900px is plenty; WebP keeps a transparent background. */
export async function uploadPromoImage(original: File): Promise<string> {
  const file = await compressImage(original, { maxSize: 900, keepIfSmallerThan: 150 * 1024 });
  const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg';
  const path = `app-promo/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('site-assets').upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return supabase.storage.from('site-assets').getPublicUrl(path).data.publicUrl;
}

/* What the link chooser lists. */
export interface SeriesOption { id: string; name: string }

export function useSeriesOptions() {
  return useQuery({
    queryKey: ['promo-series-options'],
    queryFn: async (): Promise<SeriesOption[]> => {
      const { data, error } = await supabase.from('book_series').select('id, name').eq('is_active', true).order('sort_order').order('name');
      if (error) throw error;
      return (data ?? []) as SeriesOption[];
    },
  });
}

export interface BookOption { id: string; title: string; author: string | null }

/** Books whose title contains the words typed (at least two letters), for choosing the book a card opens. */
export function useBookSearch(words: string) {
  const q = words.trim();
  return useQuery({
    queryKey: ['promo-book-search', q],
    enabled: q.length >= 2,
    queryFn: async (): Promise<BookOption[]> => {
      const safe = q.replace(/[%_,()]/g, ' ');
      const { data, error } = await supabase
        .from('products')
        .select('id, title, author')
        .ilike('title', `%${safe}%`)
        .order('title')
        .limit(8);
      if (error) throw error;
      return (data ?? []) as BookOption[];
    },
  });
}

/** The title of one book (to show the chosen book by name). */
export function useBookTitle(id: string | null) {
  return useQuery({
    queryKey: ['promo-book-title', id],
    enabled: !!id,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.from('products').select('title').eq('id', id as string).maybeSingle();
      if (error) throw error;
      return (data as { title: string } | null)?.title ?? null;
    },
  });
}
