import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { cleanPublisherName, findPublisher } from '@/lib/publishers';

/** The publisher names to choose from in the book form. */
export function usePublishers() {
  return useQuery({
    queryKey: ['publishers'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from('publishers').select('name').order('name', { ascending: true });
      if (error) throw new Error(error.message);
      return ((data ?? []) as { name: string }[]).map((row) => row.name);
    },
    staleTime: 60_000,
  });
}

/**
 * Adds a name to the list and answers the name as stored. A name the list already has (spelled another way) is not added
 * twice: the listed one is answered instead.
 */
export function useAddPublisher(listed: readonly string[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (typed: string): Promise<{ name: string; existed: boolean }> => {
      const name = cleanPublisherName(typed);
      if (!name) throw new Error('اكتب اسم الناشر.');
      const same = findPublisher(listed, name);
      if (same) return { name: same, existed: true };
      const { data, error } = await supabase.from('publishers').insert({ name }).select('name').single();
      if (error) {
        // another person added the same name a moment ago: use theirs
        if (error.code === '23505') {
          const { data: rows } = await supabase.from('publishers').select('name');
          const theirs = findPublisher(((rows ?? []) as { name: string }[]).map((r) => r.name), name);
          if (theirs) return { name: theirs, existed: true };
        }
        throw new Error(error.message);
      }
      return { name: (data as { name: string }).name, existed: false };
    },
    onSuccess: ({ existed }) => {
      void qc.invalidateQueries({ queryKey: ['publishers'] });
      if (!existed) toast.success('اتضاف الناشر للقايمة');
    },
    onError: (error: Error) => {
      toast.error(error.message.includes('row-level security') ? 'مفيش صلاحية لإضافة ناشر.' : error.message);
    },
  });
}
