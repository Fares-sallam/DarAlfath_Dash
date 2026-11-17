import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import {
  APPEARANCE_COLUMNS, DEFAULT_APPEARANCE, appearanceToRow, resolveAppearance,
  type StorefrontAppearance,
} from '@/lib/appearance';

/* What the "مظهر المتجر" page edits: storefront_appearance, one row (the pattern strength, which home sections show
   and in what order, the colours of four buttons). The store reads the same row and draws it. */

export interface AppearanceAdminData {
  appearance: StorefrontAppearance;
  /** The table is not in the database yet (the migration has not been applied): the page says so and does not save. */
  tableMissing: boolean;
}

const KEY = ['storefront-appearance-admin'];

/** PostgREST answers a table it does not know with PGRST205 (or Postgres with 42P01). */
const isMissingTable = (error: { code?: string } | null) => error?.code === 'PGRST205' || error?.code === '42P01';

export function useStorefrontAppearanceAdmin() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<AppearanceAdminData> => {
      const { data, error } = await supabase.from('storefront_appearance').select(APPEARANCE_COLUMNS).eq('id', 1).maybeSingle();
      if (isMissingTable(error)) return { appearance: DEFAULT_APPEARANCE, tableMissing: true };
      if (error) throw error;
      return { appearance: resolveAppearance(data), tableMissing: false };
    },
    staleTime: 0,
  });
}

export function useSaveStorefrontAppearance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (appearance: StorefrontAppearance) => {
      const { error } = await supabase.from('storefront_appearance').upsert(appearanceToRow(appearance));
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: KEY });
      toast.success('اتحفظ. التغيير بيظهر في المتجر خلال دقيقة');
    },
    onError: (e: Error) => toast.error(`تعذّر الحفظ: ${e.message}`),
  });
}
