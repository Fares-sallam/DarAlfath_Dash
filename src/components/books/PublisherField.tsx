import { useId, useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useAddPublisher, usePublishers } from '@/hooks/usePublishers';
import { cleanPublisherName, findPublisher, publisherOptions } from '@/lib/publishers';

const ADD = '__add__';

/**
 * The publisher of a book, chosen from one list of names so the same house is never spelled two ways. A name that is not
 * in the list yet is added from here («إضافة ناشر جديد»); a name that is the same as a listed one (other spacing, vowel
 * marks, hamza) selects the listed one instead of making a second.
 */
export default function PublisherField({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const id = useId();
  const { data: listed = [], isLoading, isError } = usePublishers();
  const add = useAddPublisher(listed);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');

  const options = useMemo(() => publisherOptions(listed, value), [listed, value]);
  const selected = options.find((name) => name === cleanPublisherName(value)) ?? '';

  const submit = async () => {
    const typed = cleanPublisherName(draft);
    if (!typed) { setNote('اكتب اسم الناشر الأول.'); return; }
    const same = findPublisher(listed, typed);
    try {
      const { name, existed } = await add.mutateAsync(typed);
      onChange(name);
      setAdding(false);
      setDraft('');
      setNote(existed || same ? `«${name}» موجود في القايمة، اتختار.` : '');
    } catch {
      // the message is already shown
    }
  };

  return (
    <div className="block text-sm font-semibold text-gray-700" data-testid="publisher-field">
      <label htmlFor={id}>الناشر (اختياري)</label>
      <select
        id={id}
        value={adding ? ADD : selected}
        onChange={(e) => {
          if (e.target.value === ADD) { setAdding(true); setNote(''); return; }
          setAdding(false);
          setNote('');
          onChange(e.target.value);
        }}
        className="input-field mt-1.5"
        disabled={isLoading}
        data-testid="publisher-select"
      >
        <option value="">— من غير ناشر —</option>
        {options.map((name) => (
          <option key={name} value={name}>{listed.includes(name) ? name : `${name} (مش في القايمة)`}</option>
        ))}
        <option value={ADD}>＋ إضافة ناشر جديد…</option>
      </select>
      {isError && <p className="text-xs text-red-500 font-normal mt-1">تعذّر تحميل قايمة الناشرين. تقدر تضيف اسم جديد.</p>}
      {adding && (
        <div className="mt-2 flex items-center gap-2" data-testid="publisher-add">
          <input
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setNote(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } if (e.key === 'Escape') { setAdding(false); setDraft(''); } }}
            className="input-field flex-1"
            maxLength={160}
            placeholder="اسم الناشر / دار النشر"
            aria-label="اسم الناشر الجديد"
            autoFocus
            data-testid="publisher-new-name"
          />
          <button type="button" onClick={() => void submit()} disabled={add.isPending} className="px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold flex items-center gap-1 disabled:opacity-50" data-testid="publisher-add-save">
            <Check size={14} /> إضافة
          </button>
          <button type="button" onClick={() => { setAdding(false); setDraft(''); setNote(''); }} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50" aria-label="إلغاء">
            <X size={14} />
          </button>
        </div>
      )}
      {note && <p className="text-xs text-gray-500 font-normal mt-1" data-testid="publisher-note">{note}</p>}
    </div>
  );
}
