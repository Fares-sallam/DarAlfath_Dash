import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

/* ── Types ──────────────────────────────────────────────────────────── */
export interface IntroVideo {
  id: string;
  title: string;
  description: string | null;
  youtube_url: string;
  duration: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/* ── List (admin sees every video, active or not) ──────────────────── */
export function useIntroVideos() {
  return useQuery({
    queryKey: ['intro-videos'],
    queryFn: async (): Promise<IntroVideo[]> => {
      const { data, error } = await supabase
        .from('intro_videos')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return (data ?? []) as IntroVideo[];
    },
  });
}

/* ── Create ─────────────────────────────────────────────────────────── */
export interface CreateIntroVideoInput {
  title: string;
  description?: string | null;
  youtube_url: string;
  duration?: string | null;
  sort_order?: number;
}

export function useCreateIntroVideo() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateIntroVideoInput) => {
      const { error } = await supabase.from('intro_videos').insert({
        title: input.title,
        description: input.description || null,
        youtube_url: input.youtube_url,
        duration: input.duration || null,
        sort_order: input.sort_order ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['intro-videos'] });
      toast.success('تمت إضافة الفيديو إلى الصفحة الرئيسية');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ── Update (title / description / youtube_url / duration / active / order) ── */
export interface UpdateIntroVideoInput {
  id: string;
  title?: string;
  description?: string | null;
  youtube_url?: string;
  duration?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export function useUpdateIntroVideo() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateIntroVideoInput) => {
      const { error } = await supabase.from('intro_videos').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['intro-videos'] });
      // Silent for reorder/toggle clicks — a toast per click on repeated
      // drag/reorder actions would be noise, not feedback.
      if (vars.title !== undefined || vars.youtube_url !== undefined) {
        toast.success('تم الحفظ');
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ── Swap sort_order with a neighbour — the actual "move up/down" op ── */
export function useReorderIntroVideo() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      current,
      neighbour,
    }: {
      current: IntroVideo;
      neighbour: IntroVideo;
    }) => {
      await Promise.all([
        supabase.from('intro_videos').update({ sort_order: neighbour.sort_order }).eq('id', current.id),
        supabase.from('intro_videos').update({ sort_order: current.sort_order }).eq('id', neighbour.id),
      ]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['intro-videos'] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ── Delete ─────────────────────────────────────────────────────────── */
export function useDeleteIntroVideo() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (video: IntroVideo) => {
      const { error } = await supabase.from('intro_videos').delete().eq('id', video.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['intro-videos'] });
      toast.success('تم حذف الفيديو');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
