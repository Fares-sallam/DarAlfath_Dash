import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import { useCatalogCounts, useCatalogLinks, useCatalogNodes, useCatalogProducts } from '@/hooks/useCatalog';
import { healthIssues } from '@/lib/catalogTree';

/** What is untidy in the catalog, with a way to open each item. */
export default function HealthTab({ onOpenNode, onOpenProduct }: { onOpenNode: (id: string) => void; onOpenProduct: (id: string) => void }) {
  const { data: nodes = [], isLoading: l1 } = useCatalogNodes();
  const { data: links = [], isLoading: l2 } = useCatalogLinks();
  const { data: products = [], isLoading: l3 } = useCatalogProducts();
  const { data: counts, isLoading: l4 } = useCatalogCounts();

  const issues = useMemo(() => healthIssues(nodes, links, products, counts ?? new Map()), [nodes, links, products, counts]);
  const nodeName = useMemo(() => new Map(nodes.map((n) => [n.id, n.name_ar])), [nodes]);
  const productTitle = useMemo(() => new Map(products.map((p) => [p.id, p.title])), [products]);

  if (l1 || l2 || l3 || l4) {
    return <div className="flex items-center justify-center gap-2 py-12 text-gray-400"><Loader2 size={18} className="animate-spin" /> جارٍ الفحص...</div>;
  }

  if (issues.length === 0) {
    return (
      <div className="bg-green-50 text-green-700 rounded-2xl p-6 flex items-center gap-3" data-testid="health-clean">
        <CheckCircle2 size={22} /> كل حاجة منظمة: مفيش ملاحظات على السلاسل والتصنيفات والكتب.
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="health-issues">
      {issues.map((issue) => (
        <div key={issue.id} className="bg-white rounded-2xl shadow-sm p-4" data-testid={`issue-${issue.id}`}>
          <div className="flex items-start gap-3">
            {issue.level === 'warning' ? <AlertTriangle size={18} className="text-amber-500 mt-0.5 flex-shrink-0" /> : <Info size={18} className="text-sky-500 mt-0.5 flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-gray-800">{issue.title} <span className="text-gray-400 font-normal">({issue.nodeIds.length + issue.productIds.length})</span></p>
              <p className="text-xs text-gray-500 mt-0.5">{issue.hint}</p>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {issue.nodeIds.map((id) => (
                  <button key={id} type="button" onClick={() => onOpenNode(id)} className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold">{nodeName.get(id) ?? id}</button>
                ))}
                {issue.productIds.slice(0, 40).map((id) => (
                  <button key={id} type="button" onClick={() => onOpenProduct(id)} className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 max-w-[260px] truncate">{productTitle.get(id) ?? id}</button>
                ))}
                {issue.productIds.length > 40 && <span className="text-xs text-gray-400 self-center">و{issue.productIds.length - 40} كتاب كمان</span>}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
