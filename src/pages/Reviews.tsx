import { useMemo, useState } from 'react';
import Layout from '@/components/layout/Layout';
import {
  Star, Search, Eye, EyeOff, Trash2, Loader2, AlertTriangle, MessageSquareText,
} from 'lucide-react';
import {
  useReviews, useToggleReviewVisibility, useDeleteReview, type ProductReview,
} from '@/hooks/useReviews';

type Filter = 'all' | 'visible' | 'hidden';

export default function Reviews() {
  const { data: reviews = [], isLoading, isError, error } = useReviews();
  const toggleVisibility = useToggleReviewVisibility();
  const deleteReview = useDeleteReview();

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return reviews.filter((r) => {
      if (filter === 'visible' && r.is_hidden) return false;
      if (filter === 'hidden' && !r.is_hidden) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${r.products?.title ?? ''} ${r.reviewer_name} ${r.comment ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [reviews, filter, search]);

  const stats = useMemo(() => {
    const total = reviews.length;
    const hidden = reviews.filter((r) => r.is_hidden).length;
    const avg = total ? (reviews.reduce((s, r) => s + r.rating, 0) / total).toFixed(1) : '—';
    return { total, hidden, avg };
  }, [reviews]);

  return (
    <Layout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Star className="text-indigo-600" size={24} />
            تقييمات العملاء
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            تقييمات حقيقية من عملاء اشتروا الكتاب واستلموه فعليًا (شرط الشراء المُتحقَّق مطبَّق تلقائيًا) —
            أخفِ أو احذف أي تقييم مسيء أو غير لائق. الإخفاء يُبقي التقييم محفوظًا وقابلاً للإظهار لاحقًا،
            بينما الحذف نهائي.
          </p>
        </div>

        {/* ── إحصائيات ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400">إجمالي التقييمات</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{stats.total}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400">متوسط التقييم</p>
            <p className="text-2xl font-bold text-gray-800 mt-1 flex items-center gap-1">
              {stats.avg}
              <Star size={16} className="text-amber-400" fill="currentColor" />
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400">مخفية</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{stats.hidden}</p>
          </div>
        </div>

        {/* ── فلاتر وبحث ── */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-100 p-1">
            {(['all', 'visible', 'hidden'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filter === f ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {f === 'all' ? 'الكل' : f === 'visible' ? 'ظاهرة' : 'مخفية'}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-300" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث باسم الكتاب أو العميل أو نص التقييم..."
              className="w-full pr-9 pl-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
            />
          </div>
        </div>

        {/* ── القائمة ── */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center gap-3 text-gray-400">
              <Loader2 className="animate-spin" size={28} />
              <p className="text-sm">جارٍ التحميل...</p>
            </div>
          ) : isError ? (
            <div className="py-16 flex flex-col items-center gap-2 text-red-500">
              <AlertTriangle size={28} />
              <p className="text-sm font-semibold">تعذّر تحميل التقييمات</p>
              <p className="text-xs text-gray-400">
                {error instanceof Error ? error.message : 'خطأ غير معروف'}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-2 text-gray-400">
              <MessageSquareText size={28} />
              <p className="text-sm font-semibold text-gray-600">
                {reviews.length === 0 ? 'لا توجد تقييمات بعد' : 'لا توجد نتائج مطابقة'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {filtered.map((r) => (
                <ReviewRow
                  key={r.id}
                  review={r}
                  onToggle={() => toggleVisibility.mutate({ id: r.id, is_hidden: !r.is_hidden })}
                  onDelete={() => {
                    if (confirm('حذف هذا التقييم نهائيًا؟ لا يمكن التراجع.')) deleteReview.mutate(r.id);
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Layout>
  );
}

function ReviewRow({
  review, onToggle, onDelete,
}: {
  review: ProductReview;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      className={`flex items-start gap-4 px-4 py-4 hover:bg-gray-50/60 transition-colors ${
        review.is_hidden ? 'opacity-60' : ''
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <div className="flex text-amber-400">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star
                key={i}
                size={14}
                fill={i <= review.rating ? 'currentColor' : 'none'}
                className={i > review.rating ? 'text-gray-200' : ''}
              />
            ))}
          </div>
          <span className="text-sm font-bold text-gray-800">{review.reviewer_name}</span>
          <span className="text-xs text-gray-300">•</span>
          <span className="text-xs text-gray-500">{review.products?.title ?? 'كتاب محذوف'}</span>
          {review.is_hidden && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">مخفي</span>
          )}
        </div>
        {review.comment && <p className="text-sm text-gray-600 leading-relaxed">{review.comment}</p>}
        <p className="text-[11px] text-gray-300 mt-1">
          {new Date(review.created_at).toLocaleDateString('ar-EG', {
            year: 'numeric', month: 'long', day: 'numeric',
          })}
        </p>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onToggle}
          className={`p-2 rounded-lg ${
            review.is_hidden ? 'text-gray-300 hover:bg-gray-100' : 'text-green-600 hover:bg-green-50'
          }`}
          title={review.is_hidden ? 'إظهار التقييم' : 'إخفاء التقييم'}
        >
          {review.is_hidden ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50"
          title="حذف نهائي"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </li>
  );
}
