import { useMemo, useState } from 'react';
import { BookOpen, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import {
  useAssignProduct, useCatalogLinks, useCatalogNodes, useCatalogProducts, useNodeBooks, useRemoveBookFromNode, useReorderNodeBooks,
} from '@/hooks/useCatalog';
import { reorderRelative, stepInList } from '@/lib/dragSort';
import type { CatalogNode } from '@/lib/catalogTree';
import { Grip, gripButtonClass, useDragRows } from './useDragRows';

/** The books linked to one node: order, removal, and adding more. */
export default function NodeBooksPanel({ node }: { node: CatalogNode }) {
  const { data: books = [], isLoading } = useNodeBooks(node.id);
  const { data: allProducts = [] } = useCatalogProducts();
  const { data: allLinks = [] } = useCatalogLinks();
  const { data: nodes = [] } = useCatalogNodes();
  const reorder = useReorderNodeBooks();
  const remove = useRemoveBookFromNode();
  const assign = useAssignProduct();

  const [query, setQuery] = useState('');
  const [asPrimary, setAsPrimary] = useState(false);
  const isSeries = node.type === 'series';
  const isCategory = node.type === 'category' || node.type === 'collection';

  const linkedIds = useMemo(() => new Set(books.map((b) => b.product_id)), [books]);
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allProducts
      .filter((p) => !linkedIds.has(p.id))
      .filter((p) => !q || p.title.toLowerCase().includes(q) || (p.author ?? '').toLowerCase().includes(q))
      .slice(0, 30);
  }, [allProducts, linkedIds, query]);

  const ids = books.map((b) => b.product_id);
  const dnd = useDragRows({
    onDrop: (dragId, targetId, zone) => {
      const next = reorderRelative(ids, dragId, targetId, zone === 'after' ? 'after' : 'before');
      if (next) reorder.mutate({ nodeId: node.id, productIds: next });
    },
  });
  /** One step with the keyboard (the grip focused, then the up and down arrows). */
  const step = (productId: string, dir: -1 | 1) => {
    const next = stepInList(ids, productId, dir);
    if (next) reorder.mutate({ nodeId: node.id, productIds: next });
  };

  /** Adds a book through the same call the books table uses, so the book's other links stay as they are. */
  const add = (productId: string) => {
    const mine = allLinks.filter((l) => l.product_id === productId);
    const typeOf = (nodeId: string) => nodes.find((n) => n.id === nodeId)?.type;
    const seriesIds = mine.filter((l) => typeOf(l.node_id) === 'series').map((l) => l.node_id);
    const currentPrimary = mine.find((l) => l.is_primary)?.node_id ?? null;
    const extraIds = mine.filter((l) => !l.is_primary && typeOf(l.node_id) !== 'series').map((l) => l.node_id);

    if (isSeries) {
      assign.mutate({ productId, seriesIds: [...seriesIds, node.id], primaryId: currentPrimary, extraIds });
    } else if (asPrimary) {
      assign.mutate({ productId, seriesIds, primaryId: node.id, extraIds: currentPrimary ? [...extraIds, currentPrimary] : extraIds });
    } else {
      assign.mutate({ productId, seriesIds, primaryId: currentPrimary, extraIds: [...extraIds, node.id] });
    }
  };

  if (!isSeries && !isCategory) {
    return <p className="text-sm text-gray-500 py-6 text-center">الكتب بتتربط بالسلاسل والتصنيفات والمجموعات، مش بالأقسام. افتح عنصر تحت القسم وضيف له كتب.</p>;
  }

  return (
    <div className="space-y-4" data-testid="node-books">
      <div>
        <h4 className="text-sm font-bold text-gray-700 mb-2">كتب «{node.name_ar}» ({books.length})</h4>
        {isLoading && (
          <div className="flex items-center gap-2 text-gray-400 py-6 justify-center"><Loader2 size={16} className="animate-spin" /> جارٍ التحميل...</div>
        )}
        {!isLoading && books.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">مفيش كتب هنا لسه.</p>}
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {books.map((b, index) => (
            <div key={b.product_id} className={`flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 ${dnd.rowClass(b.product_id)}`} data-testid="node-book-row" {...dnd.rowProps(b.product_id)}>
              <button type="button" className={gripButtonClass} data-testid="drag-handle" {...dnd.handleProps(b.product_id, b.products?.title ?? 'الكتاب', (dir) => step(b.product_id, dir))}><Grip /></button>
              <span className="w-6 text-center text-xs font-bold text-blue-700">{index + 1}</span>
              <BookOpen size={14} className="text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{b.products?.title ?? 'كتاب محذوف'}</p>
                <p className="text-xs text-gray-400 truncate">
                  {b.products?.author ?? ''}
                  {b.is_primary ? ' · تصنيف أساسي' : ''}
                  {b.products && !b.products.is_active ? ' · غير مفعّل' : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove.mutate({ nodeId: node.id, productId: b.product_id })}
                disabled={remove.isPending}
                title="إزالة من العنصر"
                className="p-1 rounded-lg hover:bg-red-100 text-red-500"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <h4 className="text-sm font-bold text-gray-700 mb-2">إضافة كتب</h4>
        <div className="relative mb-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث باسم الكتاب أو المؤلف..." className="input-field pr-9 text-sm py-2 h-auto" />
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>
        {isCategory && (
          <label className="flex items-center gap-2 text-xs text-gray-600 mb-2">
            <input type="checkbox" checked={asPrimary} onChange={(e) => setAsPrimary(e.target.checked)} />
            اجعله التصنيف الأساسي للكتاب (التصنيف الأساسي الحالي يبقى تصنيفًا إضافيًا)
          </label>
        )}
        <div className="space-y-1 max-h-56 overflow-y-auto">
          {candidates.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => add(p.id)}
              disabled={assign.isPending}
              className="w-full flex items-center gap-2 text-right bg-white border border-gray-100 hover:bg-blue-50 rounded-xl px-3 py-2 disabled:opacity-50"
              data-testid="add-book-option"
            >
              <Plus size={13} className="text-blue-600 flex-shrink-0" />
              <span className="flex-1 min-w-0 text-sm text-gray-800 truncate">{p.title}</span>
              <span className="text-xs text-gray-400 truncate max-w-[40%]">{p.author ?? ''}</span>
            </button>
          ))}
          {candidates.length === 0 && <p className="text-xs text-gray-400 text-center py-3">مفيش كتب مطابقة.</p>}
        </div>
      </div>
    </div>
  );
}
