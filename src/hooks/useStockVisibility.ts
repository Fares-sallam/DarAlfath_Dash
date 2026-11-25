import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_STOCK_VISIBILITY, STOCK_VISIBILITY_COLUMN, mergeStockVisibility, resolveStockVisibility, type StockVisibility,
} from '@/lib/stockVisibility';

/* What «إظهار عدد النسخ للعملاء» edits: the `show_stock_count` column of storefront_appearance (one row). The website and the app
   read the same column. */

export interface StockVisibilityData {
  value: StockVisibility;
  /** The column is not in the database: the card says so and does not save. */
  columnMissing: boolean;
}

const KEY = ['stock-visibility-admin'];
const isMissing = (error: { code?: string; message?: string } | null) =>
  ['PGRST204', '42703'].includes(error?.code ?? '') || /show_stock_count/.test(error?.message ?? '');

export function useStockVisibilityAdmin() {
  return useQuery({
    queryKey: KEY,
    staleTime: 0,
    queryFn: async (): Promise<StockVisibilityData> => {
      const { data, error } = await supabase.from('storefront_appearance').select(STOCK_VISIBILITY_COLUMN).eq('id', 1).maybeSingle();
      if (isMissing(error)) return { value: DEFAULT_STOCK_VISIBILITY, columnMissing: true };
      if (error) throw error;
      return { value: resolveStockVisibility((data as Record<string, unknown> | null)?.[STOCK_VISIBILITY_COLUMN]), columnMissing: false };
    },
  });
}

export function useSaveStockVisibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ loaded, draft }: { loaded: StockVisibility; draft: StockVisibility }) => {
      // what is in the database right now, so only the switches changed here replace it
      const { data: current, error: readError } = await supabase.from('storefront_appearance').select(STOCK_VISIBILITY_COLUMN).eq('id', 1).maybeSingle();
      if (readError) throw readError;
      const next = mergeStockVisibility(resolveStockVisibility((current as Record<string, unknown> | null)?.[STOCK_VISIBILITY_COLUMN]), loaded, draft);
      const { data, error } = await supabase.from('storefront_appearance').update({ [STOCK_VISIBILITY_COLUMN]: next }).eq('id', 1).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('ما اتحفظش: مفيش صلاحية أو الصف مش موجود.');
      return next;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: KEY });
      toast.success('اتحفظ. التغيير بيظهر في الموقع خلال دقيقة، وفي التطبيق عند فتحه (من النسخة الجاية منه)');
    },
    onError: (e: Error & { code?: string }) =>
      toast.error(isMissing(e) ? 'الإعداد ده لسه مش متفعّل على قاعدة البيانات.' : `تعذّر الحفظ: ${e.message}`),
  });
}
