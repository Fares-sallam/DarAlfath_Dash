import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { toSettings, type AppHomeSettings } from '@/lib/appHome';

/* The app's own strips (table app_home_settings, one row with id = 1). A row that is not there yet is the defaults. */

const KEY = ['app-home-settings'];

export function useAppHomeSettings() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<AppHomeSettings> => {
      const { data, error } = await supabase.from('app_home_settings').select('*').eq('id', 1).maybeSingle();
      if (error) throw error;
      return toSettings(data as Partial<AppHomeSettings> | null);
    },
  });
}

export function useSaveAppHomeSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: AppHomeSettings) => {
      // upsert: the row is created by the migration, but saving must also work if it was ever deleted.
      const { error } = await supabase.from('app_home_settings').upsert({ id: 1, ...settings }, { onConflict: 'id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success('تم الحفظ. التطبيق بياخد التغيير أول ما العميل يفتح الصفحة أو يسحب للتحديث.');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
