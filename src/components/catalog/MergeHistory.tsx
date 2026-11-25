import { useState } from 'react';
import { GitMerge, Loader2, Undo2 } from 'lucide-react';
import { useMergeHistory, useUnmergeNode } from '@/hooks/useCatalog';
import { historyDetail } from '@/lib/catalogMerge';

const when = (iso: string) =>
  new Date(iso).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** The latest merges, each with a «تراجع» that puts the item back as it was. Nothing is drawn when nothing was merged. */
export default function MergeHistory() {
  const { data: rows = [] } = useMergeHistory();
  const undo = useUnmergeNode();
  const [asking, setAsking] = useState<string | null>(null);

  if (rows.length === 0) return null;

  return (
    <details className="bg-white rounded-2xl shadow-sm" data-testid="merge-history">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-bold text-gray-700 flex items-center gap-2">
        <GitMerge size={15} className="text-violet-600" /> عمليات الدمج الأخيرة <span className="text-xs font-semibold text-gray-400">({rows.length})</span>
      </summary>
      <div className="divide-y divide-gray-50 border-t border-gray-100">
        {rows.map((row) => (
          <div key={row.old_id} className="flex items-center gap-3 px-4 py-2.5 flex-wrap" data-testid="merge-history-row" data-old-id={row.old_id}>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800">
                <span className="font-bold">«{row.source_name}»</span> اندمج في <span className="font-bold">«{row.target_name}»</span>
              </p>
              <p className="text-[11px] text-gray-400">{when(row.merged_at)} · {historyDetail(row)}</p>
            </div>
            {asking === row.old_id ? (
              <div className="flex items-center gap-2" data-testid="undo-confirm-box">
                <span className="text-xs text-red-700 font-semibold">يرجّع «{row.source_name}» وكتبه ويشيلهم من «{row.target_name}». متأكد؟</span>
                <button
                  type="button"
                  onClick={() => undo.mutate(row.old_id, { onSettled: () => setAsking(null) })}
                  disabled={undo.isPending}
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-60 flex items-center gap-1.5"
                  data-testid="undo-confirm"
                >
                  {undo.isPending ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />} أيوه، تراجع
                </button>
                <button type="button" onClick={() => setAsking(null)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50" data-testid="undo-cancel">لا</button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAsking(row.old_id)}
                disabled={!row.can_undo}
                title={row.can_undo ? 'ارجّع «' + row.source_name + '» زي ما كان' : 'العنصر اللي اندمج فيه اندمج في حاجة تانية بعد كده. اتراجع عن الدمج التاني الأول.'}
                className="px-3 py-1.5 rounded-lg border border-violet-200 text-violet-700 text-xs font-bold hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                data-testid="undo-merge"
              >
                <Undo2 size={12} /> تراجع
              </button>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
