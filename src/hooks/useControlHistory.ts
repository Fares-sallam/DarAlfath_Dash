import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

export type ControlHistoryScope = 'appearance' | 'app_control';

export interface ControlHistoryEntry {
  id: number;
  created_at: string;
  actor: string | null;
}

const key = (scope: ControlHistoryScope) => ['control-publish-history', scope];

export function useControlHistory(scope: ControlHistoryScope) {
  return useQuery({
    queryKey: key(scope),
    queryFn: async (): Promise<ControlHistoryEntry[]> => {
      const { data, error } = await supabase.from('control_publish_history')
        .select('id, created_at, actor').eq('scope', scope)
        .order('created_at', { ascending: false }).limit(12);
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
  });
}

export function useRestoreControl(scope: ControlHistoryScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, revision }: { id: number; revision: string }) => {
      const { error } = await supabase.rpc('control_restore', {
        p_history_id: id, p_expected: revision,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: key(scope) }),
        qc.invalidateQueries({ queryKey: ['storefront-appearance-admin'] }),
        qc.invalidateQueries({ queryKey: ['storefront-display-admin'] }),
        qc.invalidateQueries({ queryKey: ['app-control-admin'] }),
      ]);
      toast.success('رجعت النسخة السابقة بنجاح');
    },
    onError: (error: Error & { code?: string }) => toast.error(error.code === '40001'
      ? 'الإعدادات اتغيرت من مكان تاني. حدّث الصفحة قبل الاسترجاع.'
      : `تعذّر الاسترجاع: ${error.message}`),
  });
}
