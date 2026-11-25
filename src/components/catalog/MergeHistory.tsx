import { useState } from 'react';
import { GitMerge, Loader2, Undo2 } from 'lucide-react';
import { useMergeHistory, useUnmergeNode } from '@/hooks/useCatalog';
import { historyDetail } from '@/lib/catalogMerge';

const when = (iso: string) =>
  new Date(iso).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * The merge section above the tree: the button that starts a merge (so nobody has to hunt for the small icon on a row), and the
 * latest merges, each with a «تراجع» that puts the item back as it was. Always there, even before the first merge.
 */
export default function MergeHistory({ onPick }: { onPick: () => void }) {
  const { data: rows = [] } = useMergeHistory();
  const undo = useUnmergeNode();
  const [asking, setAsking] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  return (
    <div className="bg-white rounded-2xl shadow-sm" data-testid="merge-history">
      <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
        <GitMerge size={18} className="text-violet-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-700">دمج عنصرين في واحد</p>
          <p className="text-[11px] text-gray-400 leading-relaxed">كتب العنصرين وكل اللي تحتهم بيتجمعوا في عنصر واحد، وتقدر تتراجع بعدها. تقدر كمان تضغط أيقونة الدمج البنفسجية على أي صف.</p>
        </div>
        <button type="button" onClick={onPick} className="btn-primary flex items-center gap-2" data-testid="merge-pick">
          <GitMerge size={15} /> دمج عنصرين
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 pb-3 -mt-1 text-xs text-gray-400" data-testid="merge-history-empty">مفيش عمليات دمج لسه. بعد أول دمج هتظهر هنا، ومعاها زر «تراجع».</p>
      ) : (
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="border-t border-gray-100">
      <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-bold text-gray-700 flex items-center gap-2">
        عمليات الدمج الأخيرة <span className="text-xs font-semibold text-gray-400">({rows.length})</span>
      </summary>
      <div className="divide-y divide-gray-50 border-t border-gray-100">
        {rows.map((row) => (
          <div key={row.old_id} className="flex items-center gap-3 px-4 py-2.5 flex-wrap" data-testid="merge-history-row" data-old-id={row.old_id}>
            <div className="flex-1 min-w-0">
              {row.kind === 'union' ? (
                <p className="text-sm text-gray-800" data-testid="history-union">
                  <span className="font-bold">«{row.target_name}»</span> اتعمل من {row.source_name.replace(' + ', ' و ')}
                  <span className="mr-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700">بدون حذف</span>
                </p>
              ) : (
                <p className="text-sm text-gray-800">
                  <span className="font-bold">«{row.source_name}»</span> اندمج في <span className="font-bold">«{row.target_name}»</span>
                </p>
              )}
              <p className="text-[11px] text-gray-400">{when(row.merged_at)} · {historyDetail(row)}</p>
            </div>
            {asking === row.old_id ? (
              <div className="flex items-center gap-2" data-testid="undo-confirm-box">
                <span className="text-xs text-red-700 font-semibold">
                  {row.kind === 'union'
                    ? <>يشيل «{row.target_name}» بس، والأصليين وكتبهم زي ما هم. متأكد؟</>
                    : <>يرجّع «{row.source_name}» وكتبه ويشيلهم من «{row.target_name}». متأكد؟</>}
                </span>
                <button
                  type="button"
                  onClick={() => undo.mutate({ id: row.old_id, kind: row.kind }, { onSettled: () => setAsking(null) })}
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
                title={row.can_undo
                  ? (row.kind === 'union' ? 'شيل «' + row.target_name + '» (الأصليين مش بيتأثروا)' : 'ارجّع «' + row.source_name + '» زي ما كان')
                  : (row.kind === 'union' ? 'فيه كتب تصنيفها الأساسي العنصر ده. غيّر تصنيفها الأول.' : 'العنصر اللي اندمج فيه اندمج في حاجة تانية بعد كده. اتراجع عن الدمج التاني الأول.')}
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
      )}
    </div>
  );
}
