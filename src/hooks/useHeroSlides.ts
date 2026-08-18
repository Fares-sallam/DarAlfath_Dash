import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

/* ── Types ──────────────────────────────────────────────────────────── */
export interface HeroSlide {
  id: string;
  image_url: string;
  /** Optional phone-shaped version of the same slide — the storefront
   *  swaps to it under ~640px. Falls back to image_url when not set. */
  image_url_mobile: string | null;
  title: string | null;
  link_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/* ── List (admin sees every slide, active or not) ──────────────────── */
export function useHeroSlides() {
  return useQuery({
    queryKey: ['hero-slides'],
    queryFn: async (): Promise<HeroSlide[]> => {
      const { data, error } = await supabase
        .from('home_hero_slides')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return (data ?? []) as HeroSlide[];
    },
  });
}

/* ── Upload the image file, return its public URL (bucket is public) ── */
export async function uploadHeroImage(file: File): Promise<string> {
  const ext = file.name.split('.').pop();
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from('hero-images')
    .upload(path, file, { upsert: false });

  if (error) throw error;

  const { data } = supabase.storage.from('hero-images').getPublicUrl(path);
  return data.publicUrl;
}

/* ── Create ─────────────────────────────────────────────────────────── */
export interface CreateHeroSlideInput {
  image_url: string;
  image_url_mobile?: string | null;
  title?: string | null;
  link_url?: string | null;
  sort_order?: number;
}

export function useCreateHeroSlide() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateHeroSlideInput) => {
      const { error } = await supabase.from('home_hero_slides').insert({
        image_url: input.image_url,
        image_url_mobile: input.image_url_mobile || null,
        title: input.title || null,
        link_url: input.link_url || null,
        sort_order: input.sort_order ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hero-slides'] });
      toast.success('تمت إضافة الصورة إلى واجهة المتجر');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ── Update (title / link / active / order) ────────────────────────── */
export interface UpdateHeroSlideInput {
  id: string;
  image_url_mobile?: string | null;
  title?: string | null;
  link_url?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export function useUpdateHeroSlide() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateHeroSlideInput) => {
      const { error } = await supabase.from('home_hero_slides').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['hero-slides'] });
      // Silent for reorder/toggle clicks — a toast per click on repeated
      // drag/reorder actions would be noise, not feedback.
      if (vars.title !== undefined || vars.link_url !== undefined) {
        toast.success('تم الحفظ');
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ── Swap sort_order with a neighbour — the actual "move up/down" op ── */
export function useReorderHeroSlide() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      current,
      neighbour,
    }: {
      current: HeroSlide;
      neighbour: HeroSlide;
    }) => {
      await Promise.all([
        supabase.from('home_hero_slides').update({ sort_order: neighbour.sort_order }).eq('id', current.id),
        supabase.from('home_hero_slides').update({ sort_order: current.sort_order }).eq('id', neighbour.id),
      ]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hero-slides'] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ── Delete (row + the file itself, best-effort) ───────────────────── */
export function useDeleteHeroSlide() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (slide: HeroSlide) => {
      const paths = [slide.image_url, slide.image_url_mobile]
        .filter((url): url is string => !!url && url.includes('/hero-images/'))
        .map((url) => url.split('/hero-images/')[1])
        .filter((p): p is string => !!p);
      if (paths.length) await supabase.storage.from('hero-images').remove(paths);

      const { error } = await supabase.from('home_hero_slides').delete().eq('id', slide.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hero-slides'] });
      toast.success('تم حذف الصورة');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
