import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { ShippingOffer } from '@/lib/shippingOffers';

const KEY = ['shipping-offers'];

export function useShippingOffers() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<ShippingOffer[]> => {
      const { data, error } = await supabase
        .from('shipping_offers')
        .select('id, title, min_subtotal, channel, starts_at, ends_at, is_active, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as ShippingOffer[]).map((r) => ({ ...r, min_subtotal: Number(r.min_subtotal) }));
    },
  });
}

export function useSaveShippingOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (offer: Omit<ShippingOffer, 'id' | 'created_at'> & { id?: string }) => {
      const { id, ...row } = offer;
      const { error } = id
        ? await supabase.from('shipping_offers').update(row).eq('id', id)
        : await supabase.from('shipping_offers').insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success('تم حفظ عرض الشحن');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteShippingOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('shipping_offers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success('تم حذف العرض');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
