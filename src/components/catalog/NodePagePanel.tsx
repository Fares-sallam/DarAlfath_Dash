import { ArrowDown, ArrowUp, Eye, EyeOff } from 'lucide-react';
import { useReorderNodes, useUpdateNode } from '@/hooks/useCatalog';
import { NODE_TYPE_LABELS, childrenOf, moveWithinSiblings, type CatalogNode } from '@/lib/catalogTree';

/**
 * The strips on a node's own page: one per child, in the website's order. Showing or hiding a strip and moving it
 * are saved at once (they are not part of the editor's Save button).
 */
export default function NodePagePanel({ node, nodes }: { node: CatalogNode; nodes: CatalogNode[] }) {
  const update = useUpdateNode();
  const reorder = useReorderNodes();
  const strips = childrenOf(nodes, node.id, 'web');

  if (strips.length === 0) {
    return <p className="text-sm text-gray-500 bg-gray-50 rounded-xl px-4 py-3">مفيش عناصر تحت «{node.name_ar}» لسه، فصفحته هتعرض شبكة كتب واحدة. ضيف تصنيفات تحته وهتظهر كأشرطة.</p>;
  }

  const move = (id: string, dir: -1 | 1) => {
    const ids = moveWithinSiblings(strips, id, dir);
    if (ids) reorder.mutate({ ids, channel: 'web' });
  };

  return (
    <div data-testid="page-strips">
      <h4 className="text-sm font-bold text-gray-700 mb-1">الأشرطة اللي تحت العنوان ({strips.length})</h4>
      <p className="text-xs text-gray-500 mb-2">كل عنصر تحت «{node.name_ar}» بيظهر كشريط باسمه فوقه وكتبه بتتسحب يمين وشمال. رتّبهم أو اخفي اللي مش عايزه.</p>
      <div className="space-y-1.5">
        {strips.map((strip, index) => (
          <div key={strip.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2" data-testid="strip-row">
            <span className="w-6 text-center text-xs font-bold text-blue-700">{index + 1}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold truncate ${strip.show_as_strip ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{strip.name_ar}</p>
              <p className="text-[11px] text-gray-400">{NODE_TYPE_LABELS[strip.type]}</p>
            </div>
            <button type="button" onClick={() => move(strip.id, -1)} disabled={index === 0 || reorder.isPending} title="لأعلى" aria-label={`تقديم الشريط ${strip.name_ar}`} className="p-1 rounded-lg hover:bg-blue-100 disabled:opacity-30 text-blue-600"><ArrowUp size={13} /></button>
            <button type="button" onClick={() => move(strip.id, 1)} disabled={index >= strips.length - 1 || reorder.isPending} title="لأسفل" aria-label={`تأخير الشريط ${strip.name_ar}`} className="p-1 rounded-lg hover:bg-blue-100 disabled:opacity-30 text-blue-600"><ArrowDown size={13} /></button>
            <button
              type="button"
              onClick={() => update.mutate({ id: strip.id, patch: { show_as_strip: !strip.show_as_strip } })}
              disabled={update.isPending}
              title={strip.show_as_strip ? 'إخفاء الشريط' : 'إظهار الشريط'}
              aria-label={strip.show_as_strip ? `إخفاء شريط ${strip.name_ar}` : `إظهار شريط ${strip.name_ar}`}
              className="p-1 rounded-lg hover:bg-gray-200 text-gray-500"
              data-testid="toggle-strip"
            >
              {strip.show_as_strip ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
