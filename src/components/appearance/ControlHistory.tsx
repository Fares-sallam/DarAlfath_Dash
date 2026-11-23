import { History, Loader2, RotateCcw } from 'lucide-react';
import { useControlHistory, useRestoreControl, type ControlHistoryScope } from '@/hooks/useControlHistory';

export default function ControlHistory({ scope, revision, onRestored }: {
  scope: ControlHistoryScope;
  revision: string | null;
  onRestored: () => void;
}) {
  const { data, isLoading, isError } = useControlHistory(scope);
  const restore = useRestoreControl(scope);

  const restoreEntry = (id: number) => {
    if (!revision || restore.isPending) return;
    if (!window.confirm('استرجاع هذه النسخة سيستبدل الإعدادات المنشورة حاليًا، وأي مسودة مفتوحة ستُفقد. هل أنت متأكد؟')) return;
    restore.mutate({ id, revision }, { onSuccess: onRestored });
  };

  return (
    <section className="bg-white border border-gray-100 rounded-xl p-5 space-y-3" aria-label="سجل النشر">
      <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2"><History size={17} /> سجل النشر</h2>
      {isLoading && <Loader2 size={18} className="animate-spin text-gray-400" />}
      {isError && <p className="text-xs text-red-700" role="alert">تعذّر تحميل السجل. تأكد من تطبيق ترحيل سجل النشر.</p>}
      {data?.length === 0 && <p className="text-xs text-gray-500">لا توجد نسخة سابقة بعد.</p>}
      {data && data.length > 0 && (
        <div className="divide-y divide-gray-100">
          {data.map((entry) => (
            <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="text-xs text-gray-700" dir="auto">
                {new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.created_at))}
              </span>
              <button type="button" onClick={() => restoreEntry(entry.id)} disabled={!revision || restore.isPending}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 disabled:opacity-40 hover:underline"
                aria-label={`استرجاع نسخة ${entry.id}`}>
                {restore.isPending ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                استرجاع
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
