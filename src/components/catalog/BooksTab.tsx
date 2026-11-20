import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Loader2, Pencil, Save, Search, X } from 'lucide-react';
import { useAssignProduct, useCatalogLinks, useCatalogNodes, useCatalogProducts, type CatalogProduct } from '@/hooks/useCatalog';
import { NODE_TYPE_LABELS, buildTree, type CatalogNode, type ProductLink } from '@/lib/catalogTree';

type Filter = 'all' | 'no-category' | 'no-series';
const PAGE_SIZE = 40;

function BookDialog({ product, nodes, links, onClose }: { product: CatalogProduct; nodes: CatalogNode[]; links: ProductLink[]; onClose: () => void }) {
  const assign = useAssignProduct();
  const mine = links.filter((l) => l.product_id === product.id);
  const typeOf = (id: string) => nodes.find((n) => n.id === id)?.type;

  const [seriesIds, setSeriesIds] = useState<string[]>(mine.filter((l) => typeOf(l.node_id) === 'series').map((l) => l.node_id));
  const [primaryId, setPrimaryId] = useState<string>(mine.find((l) => l.is_primary)?.node_id ?? '');
  const [extraIds, setExtraIds] = useState<string[]>(mine.filter((l) => !l.is_primary && typeOf(l.node_id) !== 'series' && typeOf(l.node_id) !== 'section').map((l) => l.node_id));

  const ordered = useMemo(() => buildTree(nodes, 'web', new Set(nodes.map((n) => n.id))), [nodes]);
  const seriesNodes = ordered.filter((r) => r.node.type === 'series');
  const categoryNodes = ordered.filter((r) => r.node.type === 'category' || r.node.type === 'collection');

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const save = async () => {
    await assign.mutateAsync({ productId: product.id, seriesIds, primaryId: primaryId || null, extraIds: extraIds.filter((id) => id !== primaryId) });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto" dir="rtl" data-testid="book-dialog">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-6 flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="font-bold text-gray-800 truncate">{product.title}</h2>
            <p className="text-xs text-gray-400">{product.author ?? ''}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500" aria-label="إغلاق"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <label className="block">
            <span className="block text-sm font-bold text-gray-700 mb-1.5">التصنيف الأساسي</span>
            <select value={primaryId} onChange={(e) => setPrimaryId(e.target.value)} className="input-field" data-testid="book-primary">
              <option value="">— بدون —</option>
              {categoryNodes.map((r) => <option key={r.node.id} value={r.node.id}>{r.node.name_ar}</option>)}
            </select>
          </label>
          <div>
            <span className="block text-sm font-bold text-gray-700 mb-1.5">السلاسل</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {seriesNodes.map((r) => (
                <label key={r.node.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={seriesIds.includes(r.node.id)} onChange={() => setSeriesIds((l) => toggle(l, r.node.id))} />
                  {r.node.name_ar}
                </label>
              ))}
            </div>
          </div>
          <div>
            <span className="block text-sm font-bold text-gray-700 mb-1.5">تصنيفات ومجموعات إضافية</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {categoryNodes.filter((r) => r.node.id !== primaryId).map((r) => (
                <label key={r.node.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={extraIds.includes(r.node.id)} onChange={() => setExtraIds((l) => toggle(l, r.node.id))} />
                  {r.node.name_ar}
                  <span className="text-[10px] text-gray-400">{NODE_TYPE_LABELS[r.node.type]}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold hover:bg-gray-50">إلغاء</button>
          <button type="button" onClick={() => void save()} disabled={assign.isPending} className="btn-primary flex items-center gap-2 disabled:opacity-50" data-testid="save-book">
            {assign.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} حفظ
          </button>
        </div>
      </div>
    </div>
  );
}

/** Every book with the series and categories it belongs to; fix the ones that belong nowhere. */
export default function BooksTab({ openProductId, onOpened }: { openProductId?: string | null; onOpened?: () => void }) {
  const { data: products = [], isLoading } = useCatalogProducts();
  const { data: nodes = [] } = useCatalogNodes();
  const { data: links = [] } = useCatalogLinks();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<CatalogProduct | null>(null);

  useEffect(() => {
    if (!openProductId || products.length === 0) return;
    const target = products.find((p) => p.id === openProductId);
    if (target) setEditing(target);
    onOpened?.();
  }, [openProductId, products, onOpened]);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const linksByProduct = useMemo(() => {
    const map = new Map<string, ProductLink[]>();
    for (const l of links) map.set(l.product_id, [...(map.get(l.product_id) ?? []), l]);
    return map;
  }, [links]);

  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (q && !p.title.toLowerCase().includes(q) && !(p.author ?? '').toLowerCase().includes(q)) return false;
      const mine = linksByProduct.get(p.id) ?? [];
      if (filter === 'no-category') return p.is_active && !mine.some((l) => l.is_primary);
      if (filter === 'no-series') return p.is_active && !mine.some((l) => nodeById.get(l.node_id)?.type === 'series');
      return true;
    });
  }, [products, query, filter, linksByProduct, nodeById]);

  const pages = Math.max(1, Math.ceil(view.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const slice = view.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-3 shadow-sm flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1">
          <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder="ابحث باسم الكتاب أو المؤلف..." className="input-field pr-10 text-sm py-2.5 h-auto" data-testid="books-search" />
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {([['all', 'كل الكتب'], ['no-category', 'بلا تصنيف أساسي'], ['no-series', 'بلا سلسلة']] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => { setFilter(key); setPage(0); }} aria-pressed={filter === key} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${filter === key ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`} data-testid={`filter-${key}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-50" data-testid="books-list">
        {isLoading && <div className="flex items-center justify-center gap-2 py-12 text-gray-400"><Loader2 size={18} className="animate-spin" /> جارٍ التحميل...</div>}
        {!isLoading && view.length === 0 && <p className="text-center text-gray-400 py-12 text-sm">مفيش كتب مطابقة.</p>}
        {slice.map((p) => {
          const mine = linksByProduct.get(p.id) ?? [];
          const primary = mine.find((l) => l.is_primary);
          const series = mine.filter((l) => nodeById.get(l.node_id)?.type === 'series');
          const extras = mine.filter((l) => !l.is_primary && nodeById.get(l.node_id) && nodeById.get(l.node_id)!.type !== 'series');
          return (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3" data-testid="book-row">
              <BookOpen size={15} className="text-gray-300 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{p.title}{!p.is_active && <span className="text-[10px] mr-2 px-1.5 py-0.5 rounded-md bg-gray-200 text-gray-600">غير مفعّل</span>}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {primary ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700">{nodeById.get(primary.node_id)?.name_ar}</span> : <span className="text-[11px] px-2 py-0.5 rounded-md bg-red-50 text-red-500">بلا تصنيف أساسي</span>}
                  {series.map((l) => <span key={l.node_id} className="text-[11px] px-2 py-0.5 rounded-md bg-blue-100 text-blue-700">{nodeById.get(l.node_id)?.name_ar}</span>)}
                  {extras.map((l) => <span key={l.node_id} className="text-[11px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-600">{nodeById.get(l.node_id)?.name_ar}</span>)}
                </div>
              </div>
              <button type="button" onClick={() => setEditing(p)} className="p-2 rounded-xl hover:bg-blue-100 text-blue-600" title="تعديل تنظيم الكتاب" aria-label={`تعديل تنظيم ${p.title}`} data-testid="edit-book"><Pencil size={15} /></button>
            </div>
          );
        })}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)} className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40">السابق</button>
          <span className="text-gray-500 tabular-nums">{current + 1} / {pages}</span>
          <button type="button" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40">التالي</button>
        </div>
      )}

      {editing && <BookDialog key={editing.id} product={editing} nodes={nodes} links={links} onClose={() => setEditing(null)} />}
    </div>
  );
}
