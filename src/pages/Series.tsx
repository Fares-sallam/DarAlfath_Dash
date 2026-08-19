import { useRef, useState } from 'react';
import Layout from '@/components/layout/Layout';
import {
  Plus, Edit, Trash2, BookMarked, X, Search, Loader2,
  AlertCircle, RefreshCw, ArrowUp, ArrowDown, BookOpen,
  Check, ChevronRight, GripVertical, Image, Power, Globe2, Upload
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useCountry } from '@/contexts/CountryContext';
import {
  useSeriesList, useSeriesBooks, useAvailableProducts,
  useCreateSeries, useUpdateSeries, useDeleteSeries,
  useAddBookToSeries, useRemoveBookFromSeries, useUpdateBookSortOrder,
  uploadSeriesCover,
  type BookSeries, type SeriesBook,
} from '@/hooks/useSeries';

const MAX_COVER_MB = 5;

interface SeriesFormProps {
  editing: BookSeries | null;
  onClose: () => void;
}

function SeriesFormModal({ editing, onClose }: SeriesFormProps) {
  const createMutation = useCreateSeries();
  const updateMutation = useUpdateSeries();

  const [form, setForm] = useState({
    name: editing?.name ?? '',
    author: editing?.author ?? '',
    description: editing?.description ?? '',
    cover_url: editing?.cover_url ?? '',
    year: editing?.year ? String(editing.year) : '',
    is_active: editing?.is_active ?? true,
  });

  const [uploadingCover, setUploadingCover] = useState(false);
  const coverFileRef = useRef<HTMLInputElement>(null);

  const handleCoverUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('الملف لازم يكون صورة (JPG, PNG, WEBP)');
      return;
    }
    if (file.size > MAX_COVER_MB * 1024 * 1024) {
      toast.error(`حجم الصورة أكبر من ${MAX_COVER_MB} ميجابايت`);
      return;
    }

    setUploadingCover(true);
    try {
      const url = await uploadSeriesCover(file);
      setForm((f) => ({ ...f, cover_url: url }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذّر رفع الصورة');
    } finally {
      setUploadingCover(false);
      if (coverFileRef.current) coverFileRef.current.value = '';
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('اسم السلسلة مطلوب');
      return;
    }

    const payload = {
      name: form.name.trim(),
      author: form.author.trim() || undefined,
      description: form.description.trim() || undefined,
      cover_url: form.cover_url.trim() || undefined,
      year: form.year ? parseInt(form.year) : null,
      is_active: form.is_active,
    };

    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, ...payload });
    } else {
      await createMutation.mutateAsync(payload);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-6">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <BookMarked size={18} className="text-blue-700" />
            </div>
            <h2 className="font-bold text-gray-800">
              {editing ? 'تعديل السلسلة' : 'إضافة سلسلة جديدة'}
            </h2>
          </div>

          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              اسم السلسلة <span className="text-red-500">*</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="مثال: سلسلة في رحاب الله"
              required
              autoFocus
              className="input-field"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">المؤلف</label>
              <input
                value={form.author}
                onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
                placeholder="اسم المؤلف"
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">سنة البدء</label>
              <input
                type="number"
                value={form.year}
                onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                placeholder="2024"
                min={1900}
                max={2100}
                className="input-field"
                dir="ltr"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">الوصف</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="وصف مختصر للسلسلة..."
              rows={3}
              className="input-field resize-none h-auto py-3"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
              <Image size={13} /> صورة الغلاف
            </label>

            <input
              ref={coverFileRef}
              id="series-cover-upload"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={uploadingCover}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleCoverUpload(file);
              }}
            />

            {form.cover_url ? (
              <div className="flex items-center gap-3">
                <img
                  src={form.cover_url}
                  alt="preview"
                  className="w-16 h-20 rounded-xl object-cover shadow-sm border border-gray-100 flex-shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => coverFileRef.current?.click()}
                    disabled={uploadingCover}
                    className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 disabled:opacity-60"
                  >
                    {uploadingCover ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Upload size={13} />
                    )}
                    تغيير الصورة
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, cover_url: '' }))}
                    className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
                  >
                    <X size={12} /> إزالة الصورة
                  </button>
                </div>
              </div>
            ) : (
              <label
                htmlFor="series-cover-upload"
                className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-6 cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
              >
                {uploadingCover ? (
                  <>
                    <Loader2 size={20} className="animate-spin text-blue-500" />
                    <span className="text-xs text-gray-500">جارٍ الرفع...</span>
                  </>
                ) : (
                  <>
                    <Upload size={20} className="text-gray-400" />
                    <span className="text-xs font-semibold text-gray-600">اضغط لاختيار صورة</span>
                    <span className="text-[11px] text-gray-400">
                      JPG, PNG أو WEBP — حتى {MAX_COVER_MB} ميجابايت
                    </span>
                  </>
                )}
              </label>
            )}
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <div>
              <p className="text-sm font-semibold text-gray-700">السلسلة نشطة</p>
              <p className="text-xs text-gray-400">تظهر في واجهة المتجر</p>
            </div>

            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
              className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${
                form.is_active ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 shadow transition-all ${
                form.is_active ? 'right-0.5' : 'right-6'
              }`} />
            </button>
          </div>
        </form>

        <div className="flex justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-3xl">
          <button onClick={onClose} className="btn-secondary">إلغاء</button>

          <button
            onClick={(e) => handleSubmit(e as unknown as React.FormEvent)}
            disabled={isPending || !form.name.trim()}
            className="btn-primary flex items-center gap-2 disabled:opacity-60"
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {editing ? 'حفظ التعديلات' : 'إضافة السلسلة'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ManageBooksModalProps {
  series: BookSeries;
  onClose: () => void;
}

function ManageBooksModal({ series, onClose }: ManageBooksModalProps) {
  const { selectedCountry, currencySymbol } = useCountry();
  const { data: seriesBooks = [], isLoading: loadingBooks } = useSeriesBooks(series.id);
  const { data: availableProducts = [], isLoading: loadingAvailable } = useAvailableProducts(series.id);
  const addMutation = useAddBookToSeries();
  const removeMutation = useRemoveBookFromSeries();
  const updateOrderMutation = useUpdateBookSortOrder();

  const [tab, setTab] = useState<'current' | 'add'>('current');
  const [search, setSearch] = useState('');

  const filteredAvailable = availableProducts.filter((p) =>
    !search || p.title.includes(search) || p.author.includes(search)
  );

  const handleAddBook = async (productId: string) => {
    const nextOrder =
      seriesBooks.length > 0 ? Math.max(...seriesBooks.map((b) => b.sort_order)) + 1 : 1;

    await addMutation.mutateAsync({ seriesId: series.id, productId, sortOrder: nextOrder });
  };

  const handleMoveUp = async (book: SeriesBook, index: number) => {
    if (index === 0) return;
    const prev = seriesBooks[index - 1];

    await Promise.all([
      updateOrderMutation.mutateAsync({
        seriesId: series.id,
        productId: book.product_id,
        sortOrder: prev.sort_order,
      }),
      updateOrderMutation.mutateAsync({
        seriesId: series.id,
        productId: prev.product_id,
        sortOrder: book.sort_order,
      }),
    ]);
  };

  const handleMoveDown = async (book: SeriesBook, index: number) => {
    if (index >= seriesBooks.length - 1) return;
    const next = seriesBooks[index + 1];

    await Promise.all([
      updateOrderMutation.mutateAsync({
        seriesId: series.id,
        productId: book.product_id,
        sortOrder: next.sort_order,
      }),
      updateOrderMutation.mutateAsync({
        seriesId: series.id,
        productId: next.product_id,
        sortOrder: book.sort_order,
      }),
    ]);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-6 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <BookMarked size={16} className="text-blue-600" />
              إدارة كتب السلسلة
            </h2>
            <p className="text-xs text-gray-400 mt-0.5 font-semibold">{series.name}</p>
            <p className="text-[11px] text-blue-600 mt-1">
              الكتب المعروضة تخص {selectedCountry?.name ?? 'الدولة الحالية'} فقط
            </p>
          </div>

          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400">
            <X size={20} />
          </button>
        </div>

        <div className="flex border-b border-gray-100 flex-shrink-0">
          <button
            onClick={() => setTab('current')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${
              tab === 'current'
                ? 'border-b-2 border-blue-600 text-blue-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <GripVertical size={14} />
            ترتيب الكتب ({seriesBooks.length})
          </button>

          <button
            onClick={() => setTab('add')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${
              tab === 'add'
                ? 'border-b-2 border-blue-600 text-blue-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Plus size={14} />
            إضافة كتب ({availableProducts.length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'current' && (
            <>
              {loadingBooks && (
                <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
                  <Loader2 size={20} className="animate-spin" />
                  <span className="text-sm">جارٍ التحميل...</span>
                </div>
              )}

              {!loadingBooks && seriesBooks.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <BookOpen size={40} className="text-gray-200 mx-auto mb-3" />
                  <p className="font-semibold text-gray-500">لا توجد كتب في هذه السلسلة لهذه الدولة</p>
                  <p className="text-sm mt-1">انتقل لتبويب "إضافة كتب" لإضافة كتب للسلسلة</p>
                  <button
                    onClick={() => setTab('add')}
                    className="mt-3 btn-primary text-sm flex items-center gap-1.5 mx-auto"
                  >
                    <Plus size={13} /> إضافة كتب
                  </button>
                </div>
              )}

              {!loadingBooks && seriesBooks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 mb-3">استخدم الأسهم لترتيب الكتب داخل السلسلة</p>

                  {seriesBooks.map((book, index) => {
                    const price =
                      book.products?.sale_price ?? book.products?.base_price ?? 0;

                    return (
                      <div
                        key={book.product_id}
                        className="flex items-center gap-3 bg-gray-50 rounded-2xl p-3 hover:bg-blue-50/40 transition-colors"
                      >
                        <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-black text-blue-700">{index + 1}</span>
                        </div>

                        {book.products?.cover_url ? (
                          <img
                            src={book.products.cover_url}
                            alt={book.products?.title}
                            className="w-9 h-12 rounded-lg object-cover flex-shrink-0 shadow-sm"
                          />
                        ) : (
                          <div className="w-9 h-12 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
                            <BookOpen size={12} className="text-gray-400" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">
                            {book.products?.title ?? 'كتاب محذوف'}
                          </p>
                          <p className="text-xs text-gray-500">{book.products?.author ?? ''}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded-md font-semibold ${
                              book.products?.type === 'رقمي'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-green-100 text-green-700'
                            }`}>
                              {book.products?.type ?? ''}
                            </span>
                            <span className="text-xs text-gray-400">
                              {price.toLocaleString()} {currencySymbol}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1 flex-shrink-0">
                          <button
                            onClick={() => handleMoveUp(book, index)}
                            disabled={index === 0 || updateOrderMutation.isPending}
                            className="p-1.5 rounded-lg hover:bg-blue-100 disabled:opacity-30 disabled:cursor-not-allowed text-blue-600 transition-colors"
                            title="تحريك لأعلى"
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            onClick={() => handleMoveDown(book, index)}
                            disabled={index >= seriesBooks.length - 1 || updateOrderMutation.isPending}
                            className="p-1.5 rounded-lg hover:bg-blue-100 disabled:opacity-30 disabled:cursor-not-allowed text-blue-600 transition-colors"
                            title="تحريك لأسفل"
                          >
                            <ArrowDown size={13} />
                          </button>
                        </div>

                        <button
                          onClick={() =>
                            removeMutation.mutate({ seriesId: series.id, productId: book.product_id })
                          }
                          disabled={removeMutation.isPending}
                          className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 transition-colors flex-shrink-0"
                          title="إزالة من السلسلة"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {tab === 'add' && (
            <>
              <div className="relative mb-4">
                <input
                  type="text"
                  placeholder="ابحث في الكتب المتاحة..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input-field pr-10 text-sm py-2.5 h-auto"
                />
                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>

              {loadingAvailable && (
                <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
                  <Loader2 size={20} className="animate-spin" />
                  <span className="text-sm">جارٍ التحميل...</span>
                </div>
              )}

              {!loadingAvailable && filteredAvailable.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <BookOpen size={32} className="text-gray-200 mx-auto mb-2" />
                  <p className="text-sm">
                    {search ? 'لا توجد نتائج للبحث' : 'جميع الكتب المتاحة في هذه الدولة مضافة للسلسلة أو لا توجد كتب نشطة'}
                  </p>
                </div>
              )}

              {!loadingAvailable && filteredAvailable.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 mb-3">{filteredAvailable.length} كتاب متاح للإضافة</p>

                  {filteredAvailable.map((product) => {
                    const price = product.sale_price ?? product.base_price ?? 0;

                    return (
                      <div
                        key={product.id}
                        className="flex items-center gap-3 bg-gray-50 rounded-2xl p-3 hover:bg-green-50/50 transition-colors"
                      >
                        {product.cover_url ? (
                          <img
                            src={product.cover_url}
                            alt={product.title}
                            className="w-9 h-12 rounded-lg object-cover flex-shrink-0 shadow-sm"
                          />
                        ) : (
                          <div className="w-9 h-12 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
                            <BookOpen size={12} className="text-gray-400" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{product.title}</p>
                          <p className="text-xs text-gray-500">{product.author}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded-md font-semibold ${
                              product.type === 'رقمي'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-green-100 text-green-700'
                            }`}>
                              {product.type}
                            </span>
                            <span className="text-xs text-gray-400">
                              {price.toLocaleString()} {currencySymbol}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleAddBook(product.id)}
                          disabled={addMutation.isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-xl text-xs font-semibold hover:bg-blue-200 transition-colors disabled:opacity-60 flex-shrink-0"
                        >
                          {addMutation.isPending ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <Plus size={11} />
                          )}
                          إضافة
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-3xl flex-shrink-0">
          <button onClick={onClose} className="btn-secondary w-full">إغلاق</button>
        </div>
      </div>
    </div>
  );
}

interface SeriesCardProps {
  series: BookSeries;
  onEdit: () => void;
  onManageBooks: () => void;
}

function SeriesCard({ series, onEdit, onManageBooks }: SeriesCardProps) {
  const deleteMutation = useDeleteSeries();
  const updateMutation = useUpdateSeries();

  const handleToggle = () => {
    updateMutation.mutate({ id: series.id, is_active: !series.is_active });
  };

  const handleDelete = () => {
    if (!confirm(`هل تريد حذف سلسلة "${series.name}"؟ سيتم إزالة ارتباطها بجميع الكتب.`)) return;
    deleteMutation.mutate(series.id);
  };

  return (
    <div className={`bg-white rounded-2xl p-5 shadow-sm transition-all hover:shadow-md border-2 ${
      series.is_active ? 'border-transparent' : 'border-gray-100 opacity-75'
    }`}>
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          {series.cover_url ? (
            <img
              src={series.cover_url}
              alt={series.name}
              className="w-16 h-20 rounded-xl object-cover shadow-sm border border-gray-100"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <div className={`w-16 h-20 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-200 flex items-center justify-center shadow-sm ${series.cover_url ? 'hidden' : ''}`}>
            <BookMarked size={24} className="text-blue-600" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-1">
            <h3 className="font-bold text-gray-800 truncate flex-1">{series.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${
              series.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {series.is_active ? 'نشط' : 'معطّل'}
            </span>
          </div>

          {series.author && (
            <p className="text-sm text-gray-500 mb-1 truncate">{series.author}</p>
          )}
          {series.year && (
            <p className="text-xs text-gray-400 mb-1">منذ {series.year}</p>
          )}
          {series.description && (
            <p className="text-xs text-gray-400 line-clamp-2 mb-2 leading-relaxed">{series.description}</p>
          )}

          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <button
              onClick={onManageBooks}
              className="flex items-center gap-1.5 text-blue-600 hover:text-blue-800 transition-colors"
            >
              <BookOpen size={13} />
              <span className="text-sm font-bold">{series.books_count ?? 0}</span>
              <span className="text-xs text-gray-400">كتاب</span>
              <ChevronRight size={11} className="text-gray-400" />
            </button>

            <div className="flex items-center gap-1 text-amber-600">
              <span className="text-sm font-bold">{series.total_sales.toLocaleString()}</span>
              <span className="text-xs text-gray-400">نسخة مباعة</span>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={onManageBooks}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-colors font-semibold"
            >
              <BookMarked size={12} /> الكتب
            </button>

            <button
              onClick={onEdit}
              className="btn-secondary text-xs flex items-center gap-1 py-1.5"
            >
              <Edit size={12} /> تعديل
            </button>

            <button
              onClick={handleToggle}
              disabled={updateMutation.isPending}
              className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl border transition-colors font-semibold ${
                series.is_active
                  ? 'border-red-200 text-red-500 hover:bg-red-50'
                  : 'border-green-200 text-green-600 hover:bg-green-50'
              }`}
            >
              <Power size={12} />
              {series.is_active ? 'تعطيل' : 'تفعيل'}
            </button>

            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 transition-colors font-semibold"
            >
              {deleteMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              حذف
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SeriesPage() {
  const qc = useQueryClient();
  const { selectedCountry, currencySymbol } = useCountry();
  const { data: seriesList = [], isLoading, isError } = useSeriesList();

  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingSeries, setEditingSeries] = useState<BookSeries | null>(null);
  const [managingBooks, setManagingBooks] = useState<BookSeries | null>(null);

  const filtered = seriesList.filter((s) => {
    const matchSearch =
      !search || s.name.includes(search) || (s.author ?? '').includes(search);
    const matchActive =
      filterActive === 'all' ||
      (filterActive === 'active' && s.is_active) ||
      (filterActive === 'inactive' && !s.is_active);

    return matchSearch && matchActive;
  });

  const totalBooks = seriesList.reduce((sum, s) => sum + (s.books_count ?? 0), 0);
  const totalSales = seriesList.reduce((sum, s) => sum + s.total_sales, 0);
  const activeCount = seriesList.filter((s) => s.is_active).length;

  return (
    <Layout>
      <div className="fade-in" dir="rtl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="section-title">إدارة السلاسل</h1>
            <p className="section-subtitle">
              إدارة سلاسل الكتب وترتيب محتواها — السلسلة عامة والكتب المعروضة تخص {selectedCountry?.name ?? 'الدولة الحالية'}
            </p>

            <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-xl bg-blue-50 text-blue-700">
              <Globe2 size={12} />
              {selectedCountry?.name ?? 'كل الدول'} · {currencySymbol}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                qc.invalidateQueries({ queryKey: ['book-series'] });
                toast.info('جارٍ التحديث...');
              }}
              className="p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 transition-colors"
              title="تحديث"
            >
              <RefreshCw size={16} />
            </button>

            <button
              onClick={() => {
                setEditingSeries(null);
                setShowFormModal(true);
              }}
              className="btn-primary flex items-center gap-2"
            >
              <Plus size={16} /> إضافة سلسلة
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'إجمالي السلاسل', value: isLoading ? '—' : seriesList.length, color: 'text-blue-700', bg: 'bg-blue-50', icon: '📚' },
            { label: 'سلاسل نشطة', value: isLoading ? '—' : activeCount, color: 'text-green-700', bg: 'bg-green-50', icon: '✅' },
            { label: 'كتب الدولة الحالية', value: isLoading ? '—' : totalBooks, color: 'text-indigo-700', bg: 'bg-indigo-50', icon: '📖' },
            { label: 'إجمالي المبيعات', value: isLoading ? '—' : totalSales.toLocaleString(), color: 'text-amber-700', bg: 'bg-amber-50', icon: '🏷️' },
          ].map((s, i) => (
            <div key={i} className={`${s.bg} rounded-2xl p-4 text-center`}>
              <div className="text-2xl mb-1">{s.icon}</div>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="ابحث باسم السلسلة أو المؤلف..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field pr-10"
              />
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>

            <div className="flex gap-2">
              {([['all', 'الكل'], ['active', 'نشطة'], ['inactive', 'معطّلة']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setFilterActive(val)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                    filterActive === val
                      ? 'bg-blue-700 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
            <Loader2 size={26} className="animate-spin" />
            <span>جارٍ تحميل السلاسل...</span>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-red-400">
            <AlertCircle size={32} />
            <span className="font-semibold">تعذّر تحميل السلاسل</span>
          </div>
        )}

        {!isLoading && !isError && (
          <>
            {filtered.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm text-center py-16 text-gray-400">
                <BookMarked size={48} className="text-gray-200 mx-auto mb-3" />
                <p className="font-semibold text-gray-500">
                  {search || filterActive !== 'all' ? 'لا توجد نتائج مطابقة' : 'لا توجد سلاسل بعد'}
                </p>
                <p className="text-sm mt-1">
                  {!search && filterActive === 'all' && 'أضف أول سلسلة لكتبك عبر زر "إضافة سلسلة"'}
                </p>

                {!search && filterActive === 'all' && (
                  <button
                    onClick={() => {
                      setEditingSeries(null);
                      setShowFormModal(true);
                    }}
                    className="mt-4 btn-primary flex items-center gap-1.5 mx-auto"
                  >
                    <Plus size={14} /> إضافة سلسلة
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filtered.map((s) => (
                  <SeriesCard
                    key={s.id}
                    series={s}
                    onEdit={() => {
                      setEditingSeries(s);
                      setShowFormModal(true);
                    }}
                    onManageBooks={() => setManagingBooks(s)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {showFormModal && (
        <SeriesFormModal
          editing={editingSeries}
          onClose={() => {
            setShowFormModal(false);
            setEditingSeries(null);
          }}
        />
      )}

      {managingBooks && (
        <ManageBooksModal
          series={managingBooks}
          onClose={() => setManagingBooks(null)}
        />
      )}
    </Layout>
  );
}
