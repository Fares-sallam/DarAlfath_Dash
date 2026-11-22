import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { APP_CONTROL_COLUMNS, DEFAULT_APP_CONTROL, appControlToRow, resolveAppControl, type AppControl } from '@/lib/appControl';

/* What «التحكم في التطبيق» edits: app_control, one row (the maintenance screen, the forced / recommended update, the pop-up).
   The app reads the same row and acts on it. */

export interface AppControlAdminData {
  control: AppControl;
  /** The table is not in the database yet (the migration has not been applied): the page says so and does not save. */
  tableMissing: boolean;
}

const KEY = ['app-control-admin'];

/** PostgREST answers a table it does not know with PGRST205 (or Postgres with 42P01). */
const isMissingTable = (error: { code?: string } | null) => error?.code === 'PGRST205' || error?.code === '42P01';

export function useAppControlAdmin() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<AppControlAdminData> => {
      const { data, error } = await supabase.from('app_control').select(APP_CONTROL_COLUMNS).eq('id', 1).maybeSingle();
      if (isMissingTable(error)) return { control: DEFAULT_APP_CONTROL, tableMissing: true };
      if (error) throw error;
      return { control: resolveAppControl(data), tableMissing: false };
    },
    staleTime: 0,
  });
}

export function useSaveAppControl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (control: AppControl) => {
      const { error } = await supabase.from('app_control').upsert(appControlToRow(control));
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: KEY });
      toast.success('اتحفظ. التطبيق بياخد التغيير لما يتفتح أو يرجع للمقدمة (خلال دقيقتين)');
    },
    onError: (e: Error) => toast.error(`تعذّر الحفظ: ${e.message}`),
  });
}
