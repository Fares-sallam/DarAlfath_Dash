import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

/* ── Types ──────────────────────────────────────────────────────────── */
export type ReviewStatus = 'pending' | 'approved' | 'hidden';

export interface ProductReview {
  id: string;
  product_id: string;
  /** null: left by a visitor without an account. */
  user_id: string | null;
  reviewer_name: string;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  /** Signed in with a delivered order of the book (set by the database). */
  is_verified_buyer: boolean;
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
  products: { title: string } | null;
}

/* ── List (admins see every comment, whatever its status) ─────────────── */
export function useReviews() {
  return useQuery({
    queryKey: ['product-reviews-admin'],
    queryFn: async (): Promise<ProductReview[]> => {
      const { data, error } = await supabase
        .from('product_reviews')
        .select('*, products(title)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as ProductReview[];
    },
  });
}

/** How many comments wait for approval (the number beside "تقييمات العملاء" in the menu). */
export function usePendingReviewsCount() {
  return useQuery({
    queryKey: ['product-reviews-pending-count'],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('product_reviews')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (error) return 0;
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });
}

/* ── Moderation ───────────────────────────────────────────────────────
 * Approving puts a comment on the book's page (and in its rating); hiding takes it off but keeps it
 * here, to show again later. A comment a customer edits comes back as pending on its own. */
export function useSetReviewStatus() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ReviewStatus }) => {
      const { error } = await supabase.from('product_reviews').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['product-reviews-admin'] });
      qc.invalidateQueries({ queryKey: ['product-reviews-pending-count'] });
      toast.success(vars.status === 'approved' ? 'التعليق ظاهر في صفحة الكتاب' : 'التعليق اتخفى من صفحة الكتاب');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ── Delete (permanent — for spam/abuse, not routine moderation) ──────── */
export function useDeleteReview() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('product_reviews').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-reviews-admin'] });
      qc.invalidateQueries({ queryKey: ['product-reviews-pending-count'] });
      toast.success('تم حذف التعليق نهائيًا');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
