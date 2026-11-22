import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { DEFAULT_DISPLAY, DISPLAY_COLUMN, displayToRow, resolveDisplay, type DisplaySettings } from '@/lib/displaySettings';

/* What «تفاصيل العرض» edits: the `display` column of storefront_appearance (one row). The website and the app read the same
   column and draw it. */

export interface DisplayAdminData {
  display: DisplaySettings;
  /** The column is not in the database yet (the migration has not been applied): the page says so and does not save. */
  columnMissing: boolean;
}

const KEY = ['storefront-display-admin'];

/** A table or column the database does not know: PostgREST says PGRST205 / PGRST204, Postgres 42P01 / 42703. */
const isMissing = (error: { code?: string } | null) => ['PGRST205', 'PGRST204', '42P01', '42703'].includes(error?.code ?? '');

export function useDisplaySettingsAdmin() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<DisplayAdminData> => {
      const { data, error } = await supabase.from('storefront_appearance').select(DISPLAY_COLUMN).eq('id', 1).maybeSingle();
      if (isMissing(error)) return { display: DEFAULT_DISPLAY, columnMissing: true };
      if (error) throw error;
      return { display: resolveDisplay((data as { display?: unknown } | null)?.display), columnMissing: false };
    },
    staleTime: 0,
  });
}

export function useSaveDisplaySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (display: DisplaySettings) => {
      const { error } = await supabase.from('storefront_appearance').upsert(displayToRow(display));
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: KEY });
      toast.success('اتحفظ. التغيير بيظهر في الموقع خلال دقيقة، وفي التطبيق عند فتحه');
    },
    onError: (e: Error) => toast.error(`تعذّر الحفظ: ${e.message}`),
  });
}
