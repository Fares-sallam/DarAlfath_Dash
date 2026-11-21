import NamePickerField from '@/components/books/NamePickerField';
import { useAddAuthor, useAuthors } from '@/hooks/useNameLists';
import { authorKey } from '@/lib/authors';

/** The author of a book, chosen from one list of names, with a button to add one that is not there yet. */
export default function AuthorField({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const { data: listed = [], isLoading, isError } = useAuthors();
  const add = useAddAuthor(listed);
  return (
    <NamePickerField
      label="المؤلف" required noun="مؤلف" nounThe="المؤلف" testId="author" keyOf={authorKey}
      value={value} onChange={onChange} listed={listed} loading={isLoading} failed={isError}
      onAdd={(typed) => add.mutateAsync(typed)} adding={add.isPending}
    />
  );
}
