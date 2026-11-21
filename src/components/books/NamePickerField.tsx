import { useId, useMemo, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { cleanName, findName, nameOptions, type KeyFn } from '@/lib/nameLists';

export interface NamePickerProps {
  /** the field's label, e.g. «المؤلف» */
  label: string;
  required?: boolean;
  /** "ناشر" / "مؤلف": used in the button and the placeholders */
  noun: string;
  /** the same with «ال»: "الناشر" / "المؤلف" */
  nounThe: string;
  /** the prefix of the test ids */
  testId: string;
  keyOf: KeyFn;
  value: string;
  onChange: (name: string) => void;
  listed: readonly string[];
  loading: boolean;
  failed: boolean;
  /** adds a name to the list: answers the name as stored, and whether it was already there */
  onAdd: (typed: string) => Promise<{ name: string; existed: boolean }>;
  adding: boolean;
}

/**
 * A name chosen from one list (so the same name is never written two ways) with an «إضافة» button for one that is not
 * there yet. A name that is the same as a listed one (other spacing, vowel marks, hamza, a title) selects the listed one
 * instead of making a second.
 */
export default function NamePickerField({
  label, required = false, noun, nounThe, testId, keyOf, value, onChange, listed, loading, failed, onAdd, adding: saving,
}: NamePickerProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');

  const options = useMemo(() => nameOptions(listed, value, keyOf), [listed, value, keyOf]);
  const selected = options.find((name) => name === cleanName(value)) ?? '';

  const submit = async () => {
    const typed = cleanName(draft);
    if (!typed) { setNote(`اكتب اسم ${nounThe} الأول.`); return; }
    const same = findName(listed, typed, keyOf);
    try {
      const { name, existed } = await onAdd(typed);
      onChange(name);
      setOpen(false);
      setDraft('');
      setNote(existed || same ? `«${name}» موجود في القايمة، اتختار.` : '');
    } catch {
      // the message is already shown
    }
  };

  return (
    <div className="block text-sm font-semibold text-gray-700" data-testid={`${testId}-field`}>
      <label htmlFor={id}>{label}{required && <span className="text-red-500"> *</span>}</label>
      <div className="mt-1.5 flex items-stretch gap-2">
        <select
          id={id}
          value={selected}
          onChange={(e) => { setNote(''); onChange(e.target.value); }}
          className="input-field flex-1 min-w-0"
          disabled={loading}
          data-testid={`${testId}-select`}
        >
          <option value="">{required ? `— اختار ${noun} —` : `— من غير ${noun} —`}</option>
          {options.map((name) => (
            <option key={name} value={name}>{listed.includes(name) ? name : `${name} (مش في القايمة)`}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => { setOpen((was) => !was); setNote(''); }}
          className="px-3 rounded-xl border border-blue-200 text-blue-700 text-sm font-semibold hover:bg-blue-50 flex items-center gap-1 whitespace-nowrap"
          aria-expanded={open}
          data-testid={`${testId}-add-button`}
        >
          <Plus size={14} /> إضافة {noun}
        </button>
      </div>
      {failed && <p className="text-xs text-red-500 font-normal mt-1">تعذّر تحميل القايمة. تقدر تضيف اسم جديد.</p>}
      {open && (
        <div className="mt-2 flex items-center gap-2" data-testid={`${testId}-add`}>
          <input
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setNote(''); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void submit(); }
              if (e.key === 'Escape') { setOpen(false); setDraft(''); }
            }}
            className="input-field flex-1 min-w-0"
            maxLength={160}
            placeholder={`اسم ${noun} الجديد`}
            aria-label={`اسم ${noun} الجديد`}
            autoFocus
            data-testid={`${testId}-new-name`}
          />
          <button type="button" onClick={() => void submit()} disabled={saving} className="px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold flex items-center gap-1 disabled:opacity-50" data-testid={`${testId}-add-save`}>
            <Check size={14} /> حفظ
          </button>
          <button type="button" onClick={() => { setOpen(false); setDraft(''); setNote(''); }} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50" aria-label="إلغاء">
            <X size={14} />
          </button>
        </div>
      )}
      {note && <p className="text-xs text-gray-500 font-normal mt-1" data-testid={`${testId}-note`}>{note}</p>}
    </div>
  );
}
