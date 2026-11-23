import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { APP_CONTROL_COLUMNS, DEFAULT_APP_CONTROL, appControlToRow, resolveAppControl, type AppControl } from '@/lib/appControl';
import { maintenanceOff } from '@/lib/appControlDraft';

/* What «التحكم في التطبيق» edits: app_control, one row (the maintenance screen, the forced / recommended update, the pop-up).
   The app reads the same row and acts on it. */

export interface AppControlAdminData {
  control: AppControl;
  revision: string | null;
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
      const { data, error } = await supabase.from('app_control').select(`${APP_CONTROL_COLUMNS}, updated_at`).eq('id', 1).maybeSingle();
      if (isMissingTable(error)) return { control: DEFAULT_APP_CONTROL, revision: null, tableMissing: true };
      if (error) throw error;
      return { control: resolveAppControl(data), revision: data?.updated_at ?? null, tableMissing: false };
    },
    staleTime: 0,
  });
}

export function useSaveAppControl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ control, revision }: { control: AppControl; revision: string | null }) => {
      const { error } = await supabase.rpc('control_save', {
        p_scope: 'app_control', p_expected: revision, p_payload: appControlToRow(control),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: KEY });
      toast.success('اتحفظ. التطبيق بياخد التغيير لما يتفتح أو يرجع للمقدمة (خلال دقيقتين)');
    },
    onError: (e: Error & { code?: string }) => toast.error(e.code === '40001'
      ? 'الإعدادات اتغيرت من مكان تاني. حدّث الصفحة وراجع التغييرات قبل الحفظ.'
      : `تعذّر الحفظ: ${e.message}`),
  });
}

export function useDisableAppMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('app_control').select('maintenance').eq('id', 1).single();
      if (error) throw error;
      const maintenance = maintenanceOff(data.maintenance);
      if (!maintenance) return;
      const { error: updateError } = await supabase.from('app_control')
        .update({ maintenance })
        .eq('id', 1)
        .select('maintenance')
        .single();
      if (updateError) throw updateError;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: KEY });
      toast.success('اتوقفت الصيانة. قد يستغرق وصول التغيير للتطبيق دقيقتين في النسخ الحالية.');
    },
    onError: (e: Error) => toast.error(`تعذّر إيقاف الصيانة: ${e.message}`),
  });
}
