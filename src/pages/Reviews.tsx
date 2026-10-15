import { useMemo, useState } from 'react';
import Layout from '@/components/layout/Layout';
import {
  Star, Search, Eye, EyeOff, Trash2, Loader2, AlertTriangle, MessageSquareText, BadgeCheck, Check,
} from 'lucide-react';
import {
  useReviews, useSetReviewStatus, useDeleteReview, type ProductReview, type ReviewStatus,
} from '@/hooks/useReviews';

type Filter = 'pending' | 'approved' | 'hidden' | 'all';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'pending', label: 'بانتظار المراجعة' },
  { key: 'approved', label: 'ظاهرة' },
  { key: 'hidden', label: 'مخفية' },
  { key: 'all', label: 'الكل' },
];

const STATUS_BADGE: Record<ReviewStatus, { label: string; tone: string }> = {
  pending: { label: 'بانتظار المراجعة', tone: 'bg-amber-50 text-amber-700' },
  approved: { label: 'ظاهر', tone: 'bg-green-50 text-green-700' },
  hidden: { label: 'مخفي', tone: 'bg-gray-100 text-gray-500' },
};

export default function Reviews() {
  const { data: reviews = [], isLoading, isError, error } = useReviews();
  const setStatus = useSetReviewStatus();
  const deleteReview = useDeleteReview();

  const pendingCount = reviews.filter((r) => r.status === 'pending').length;
  // Open on what needs doing; once nothing waits, on everything.
  const [filter, setFilter] = useState<Filter | null>(null);
  const active: Filter = filter ?? (pendingCount > 0 ? 'pending' : 'all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return reviews.filter((r) => {
      if (active !== 'all' && r.status !== active) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${r.products?.title ?? ''} ${r.reviewer_name} ${r.comment ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [reviews, active, search]);

  const stats = useMemo(() => {
    const approved = reviews.filter((r) => r.status === 'approved');
    const avg = approved.length ? (approved.reduce((s, r) => s + r.rating, 0) / approved.length).toFixed(1) : '—';
    return { total: reviews.length, approved: approved.length, avg };
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
            أي عميل يقدر يكتب تعليق على كتاب (باسمه وتقييمه)، حتى من غير حساب. التعليق مش بيظهر في صفحة الكتاب غير لما
            توافق عليه هنا. «مشتري موثّق» معناها إن صاحب التعليق مسجّل واستلم الكتاب فعلًا. الإخفاء بيشيله من صفحة الكتاب
            ويسيبه هنا، والحذف نهائي.
          </p>
        </div>

        {/* ── إحصائيات ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl border border-amber-100 p-4">
            <p className="text-xs text-amber-600">بانتظار المراجعة</p>
            <p className="text-2xl font-bold text-gray-800 mt-1" data-testid="reviews-pending-count">{pendingCount}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400">ظاهرة في الموقع</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{stats.approved}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400">متوسط التقييم الظاهر</p>
            <p className="text-2xl font-bold text-gray-800 mt-1 flex items-center gap-1">
              {stats.avg}
              <Star size={16} className="text-amber-400" fill="currentColor" />
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400">كل التعليقات</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{stats.total}</p>
          </div>
        </div>

        {/* ── فلاتر وبحث ── */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-100 p-1" role="group" aria-label="الحالة">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                aria-pressed={active === f.key}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  active === f.key ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {f.label}
                {f.key === 'pending' && pendingCount > 0 && ` (${pendingCount})`}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-300" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث باسم الكتاب أو العميل أو نص التعليق..."
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
              <p className="text-sm font-semibold">تعذّر تحميل التعليقات</p>
              <p className="text-xs text-gray-400">{error instanceof Error ? error.message : 'خطأ غير معروف'}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-2 text-gray-400">
              <MessageSquareText size={28} />
              <p className="text-sm font-semibold text-gray-600">
                {reviews.length === 0 ? 'لا توجد تعليقات بعد' : active === 'pending' ? 'مفيش تعليقات مستنية مراجعة' : 'لا توجد نتائج مطابقة'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {filtered.map((r) => (
                <ReviewRow
                  key={r.id}
                  review={r}
                  onStatus={(status) => setStatus.mutate({ id: r.id, status })}
                  onDelete={() => {
                    if (confirm('حذف هذا التعليق نهائيًا؟ لا يمكن التراجع.')) deleteReview.mutate(r.id);
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
  review, onStatus, onDelete,
}: {
  review: ProductReview;
  onStatus: (status: ReviewStatus) => void;
  onDelete: () => void;
}) {
  const badge = STATUS_BADGE[review.status];
  return (
    <li className={`flex items-start gap-4 px-4 py-4 hover:bg-gray-50/60 transition-colors ${review.status === 'hidden' ? 'opacity-60' : ''}`} data-testid="review-row">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <div className="flex text-amber-400" aria-label={`${review.rating} من 5`}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} size={14} fill={i <= review.rating ? 'currentColor' : 'none'} className={i > review.rating ? 'text-gray-200' : ''} />
            ))}
          </div>
          <span className="text-sm font-bold text-gray-800">{review.reviewer_name}</span>
          {review.is_verified_buyer ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-700">
              <BadgeCheck size={11} /> مشتري موثّق
            </span>
          ) : !review.user_id ? (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-50 text-gray-500">زائر</span>
          ) : null}
          <span className="text-xs text-gray-300">•</span>
          <span className="text-xs text-gray-500">{review.products?.title ?? 'كتاب محذوف'}</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badge.tone}`}>{badge.label}</span>
        </div>
        {review.comment && <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{review.comment}</p>}
        <p className="text-[11px] text-gray-300 mt-1">
          {new Date(review.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}
          {review.updated_at !== review.created_at && review.status === 'pending' && ' · اتعدّل'}
        </p>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {review.status !== 'approved' && (
          <button
            onClick={() => onStatus('approved')}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700"
            aria-label={`إظهار تعليق ${review.reviewer_name}`}
          >
            {review.status === 'pending' ? <Check size={14} /> : <Eye size={14} />}
            إظهار
          </button>
        )}
        {review.status !== 'hidden' && (
          <button
            onClick={() => onStatus('hidden')}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-semibold hover:bg-gray-50"
            aria-label={`إخفاء تعليق ${review.reviewer_name}`}
          >
            <EyeOff size={14} />
            إخفاء
          </button>
        )}
        <button onClick={onDelete} className="p-2 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50" title="حذف نهائي" aria-label={`حذف تعليق ${review.reviewer_name}`}>
          <Trash2 size={16} />
        </button>
      </div>
    </li>
  );
}
