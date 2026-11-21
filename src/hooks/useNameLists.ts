import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { authorKey } from '@/lib/authors';
import { cleanName, findName, nameKey, type KeyFn } from '@/lib/nameLists';

type ListTable = 'publishers' | 'authors';

function useNames(table: ListTable) {
  return useQuery({
    queryKey: [table],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from(table).select('name').order('name', { ascending: true });
      if (error) throw new Error(error.message);
      return ((data ?? []) as { name: string }[]).map((row) => row.name);
    },
    staleTime: 60_000,
  });
}

/**
 * Adds a name to a list and answers the name as stored. A name the list already has (spelled another way) is not added
 * twice: the listed one is answered instead.
 */
function useAddName(table: ListTable, listed: readonly string[], keyOf: KeyFn, noun: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (typed: string): Promise<{ name: string; existed: boolean }> => {
      const name = cleanName(typed);
      if (!name) throw new Error(`اكتب اسم ${noun}.`);
      const same = findName(listed, name, keyOf);
      if (same) return { name: same, existed: true };
      const { data, error } = await supabase.from(table).insert({ name }).select('name').single();
      if (error) {
        // another person added the same name a moment ago: use theirs
        if (error.code === '23505') {
          const { data: rows } = await supabase.from(table).select('name');
          const theirs = findName(((rows ?? []) as { name: string }[]).map((r) => r.name), name, keyOf);
          if (theirs) return { name: theirs, existed: true };
        }
        throw new Error(error.message);
      }
      return { name: (data as { name: string }).name, existed: false };
    },
    onSuccess: ({ existed }) => {
      void qc.invalidateQueries({ queryKey: [table] });
      if (!existed) toast.success(`اتضاف ${noun} للقايمة`);
    },
    onError: (error: Error) => {
      toast.error(error.message.includes('row-level security') ? `مفيش صلاحية لإضافة ${noun}.` : error.message);
    },
  });
}

export const usePublishers = () => useNames('publishers');
export const useAddPublisher = (listed: readonly string[]) => useAddName('publishers', listed, nameKey, 'الناشر');
export const useAuthors = () => useNames('authors');
export const useAddAuthor = (listed: readonly string[]) => useAddName('authors', listed, authorKey, 'المؤلف');
