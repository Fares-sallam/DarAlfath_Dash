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

// ── managing the lists (the «المؤلفون والناشرون» window) ──

export type NameKind = 'author' | 'publisher';
const TABLE: Record<NameKind, ListTable> = { author: 'authors', publisher: 'publishers' };

/** One name with how many books carry it; `id` is null for a name written on books that is not in the list. */
export interface NameUsageRow {
  id: string | null;
  name: string;
  books: number;
  listed: boolean;
}

function friendlyNameError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('duplicate key') || m.includes('unique')) return 'الاسم ده موجود في القايمة بالفعل (أو بشكل مشابه جدًا).';
  if (m.includes('still used')) return 'فيه كتب عليه. انقلها لاسم تاني (دمج) الأول.';
  if (m.includes('empty name')) return 'اكتب اسم.';
  if (m.includes('row-level security') || m.includes('permission denied')) return 'مفيش عندك صلاحية على القايمة دي.';
  if (m.includes('not found')) return 'الاسم ده اتحذف قبل كده. حدّث الصفحة.';
  return message;
}

function useRefreshNames(kind: NameKind) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['name-usage', kind] });
    void qc.invalidateQueries({ queryKey: [TABLE[kind]] });
    void qc.invalidateQueries({ queryKey: ['products'] });
  };
}

/** Every listed name with its book count, then the unlisted names found on books. */
export function useNameUsage(kind: NameKind) {
  return useQuery({
    queryKey: ['name-usage', kind],
    queryFn: async (): Promise<NameUsageRow[]> => {
      const { data, error } = await supabase.rpc('name_list_usage', { p_kind: kind });
      if (error) throw new Error(error.message);
      return ((data ?? []) as { id: string | null; name: string; books: number | string; listed: boolean }[])
        .map((r) => ({ id: r.id, name: r.name, books: Number(r.books), listed: r.listed }))
        .sort((a, b) => Number(a.listed) - Number(b.listed) || a.name.localeCompare(b.name, 'ar'));
    },
  });
}

/** Adds a name to the list (the same insert the book form uses). */
export function useListName(kind: NameKind) {
  const refresh = useRefreshNames(kind);
  return useMutation({
    mutationFn: async (typed: string) => {
      const name = cleanName(typed);
      if (!name) throw new Error('empty name');
      const { error } = await supabase.from(TABLE[kind]).insert({ name });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { refresh(); toast.success('اتضاف للقايمة'); },
    onError: (e: Error) => toast.error(friendlyNameError(e.message)),
  });
}

/** Renames a name in the list and on every book that carries it, in one step. Answers how many books changed. */
export function useRenameName(kind: NameKind) {
  const refresh = useRefreshNames(kind);
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }): Promise<number> => {
      const { data, error } = await supabase.rpc('name_list_rename', { p_kind: kind, p_id: id, p_name: name });
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },
    onSuccess: (books) => { refresh(); toast.success(books > 0 ? `اتغيّر الاسم على ${books} كتاب` : 'اتغيّر الاسم'); },
    onError: (e: Error) => toast.error(friendlyNameError(e.message)),
  });
}

/** Moves the books of one name to another and removes the first from the list. */
export function useMergeNames(kind: NameKind) {
  const refresh = useRefreshNames(kind);
  return useMutation({
    mutationFn: async ({ from, into }: { from: string; into: string }): Promise<number> => {
      const { data, error } = await supabase.rpc('name_list_merge', { p_kind: kind, p_from: from, p_into: into });
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },
    onSuccess: (books) => { refresh(); toast.success(`اتدمج، واتنقل ${books} كتاب`); },
    onError: (e: Error) => toast.error(friendlyNameError(e.message)),
  });
}

/** Removes a name from the list; only one no book carries. */
export function useDeleteName(kind: NameKind) {
  const refresh = useRefreshNames(kind);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('name_list_delete', { p_kind: kind, p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { refresh(); toast.success('اتحذف من القايمة'); },
    onError: (e: Error) => toast.error(friendlyNameError(e.message)),
  });
}
