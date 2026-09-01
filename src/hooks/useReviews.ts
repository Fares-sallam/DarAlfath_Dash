import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

/* ── Types ──────────────────────────────────────────────────────────── */
export interface ProductReview {
  id: string;
  product_id: string;
  user_id: string;
  reviewer_name: string;
  rating: number;
  comment: string | null;
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
  products: { title: string } | null;
}

/* ── List (admin sees every review, hidden or not — its own RLS policy
 * grants full access via is_admin(), unlike the storefront's public
 * read which only sees is_hidden = false) ────────────────────────────── */
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

/* ── Moderation: hide/unhide ───────────────────────────────────────────
 * Hiding a review doesn't delete it — it just drops out of the public
 * read policy and the product_review_stats aggregate, while staying
 * visible here for the admin to review or reverse the decision. */
export function useToggleReviewVisibility() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_hidden }: { id: string; is_hidden: boolean }) => {
      const { error } = await supabase.from('product_reviews').update({ is_hidden }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['product-reviews-admin'] });
      toast.success(vars.is_hidden ? 'تم إخفاء التقييم' : 'تم إظهار التقييم');
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
      toast.success('تم حذف التقييم نهائيًا');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
