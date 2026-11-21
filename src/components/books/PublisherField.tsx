import NamePickerField from '@/components/books/NamePickerField';
import { useAddPublisher, usePublishers } from '@/hooks/useNameLists';
import { nameKey } from '@/lib/nameLists';

/** The publisher of a book, chosen from one list of names, with a button to add one that is not there yet. */
export default function PublisherField({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const { data: listed = [], isLoading, isError } = usePublishers();
  const add = useAddPublisher(listed);
  return (
    <NamePickerField
      label="الناشر (اختياري)" noun="ناشر" nounThe="الناشر" testId="publisher" keyOf={nameKey}
      value={value} onChange={onChange} listed={listed} loading={isLoading} failed={isError}
      onAdd={(typed) => add.mutateAsync(typed)} adding={add.isPending}
    />
  );
}
