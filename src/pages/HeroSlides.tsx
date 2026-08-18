import { useRef, useState } from 'react';
import Layout from '@/components/layout/Layout';
import {
  Image as ImageIcon, Upload, Trash2, ArrowUp, ArrowDown, Eye, EyeOff,
  Loader2, AlertTriangle, ExternalLink, Save,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useHeroSlides, uploadHeroImage, useCreateHeroSlide, useUpdateHeroSlide,
  useReorderHeroSlide, useDeleteHeroSlide, type HeroSlide,
} from '@/hooks/useHeroSlides';

const MAX_MB = 5;

export default function HeroSlides() {
  const { data: slides = [], isLoading, isError, error } = useHeroSlides();
  const createSlide = useCreateHeroSlide();
  const updateSlide = useUpdateHeroSlide();
  const reorderSlide = useReorderHeroSlide();
  const deleteSlide = useDeleteHeroSlide();

  const [uploading, setUploading] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newLink, setNewLink] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('الملف لازم يكون صورة (JPG, PNG, WEBP)');
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`حجم الصورة أكبر من ${MAX_MB} ميجابايت`);
      return;
    }

    setUploading(true);
    try {
      const url = await uploadHeroImage(file);
      const nextOrder = slides.length
        ? Math.max(...slides.map((s) => s.sort_order)) + 1
        : 0;
      await createSlide.mutateAsync({
        image_url: url,
        title: newTitle.trim() || undefined,
        link_url: newLink.trim() || undefined,
        sort_order: nextOrder,
      });
      setNewTitle('');
      setNewLink('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذّر رفع الصورة');
    } finally {
      setUploading(false);
    }
  };

  const move = (slide: HeroSlide, dir: -1 | 1) => {
    const sorted = [...slides].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((s) => s.id === slide.id);
    const neighbour = sorted[idx + dir];
    if (!neighbour) return;
    reorderSlide.mutate({ current: slide, neighbour });
  };

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <ImageIcon className="text-indigo-600" size={24} />
              صور الصفحة الرئيسية
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              الصور المعروضة على القواعد في هيرو الصفحة الرئيسية — أضِف، رتّب، أو أخفِ أي صورة في أي وقت.
              التغيير يظهر في الموقع فورًا.
            </p>
          </div>
        </div>

        {/* ── نموذج الإضافة ── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <h2 className="text-sm font-bold text-gray-700">إضافة صورة جديدة</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="عنوان (اختياري — للوصف الداخلي فقط)"
              className="px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
            />
            <input
              value={newLink}
              onChange={(e) => setNewLink(e.target.value)}
              placeholder="رابط عند الضغط (اختياري — مثال: /book/xxxx أو /books)"
              className="px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
              dir="ltr"
            />
          </div>

          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-8 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
              }}
            />
            {uploading ? (
              <>
                <Loader2 size={22} className="animate-spin text-indigo-500" />
                <span className="text-sm text-gray-500">جارٍ الرفع...</span>
              </>
            ) : (
              <>
                <Upload size={22} className="text-gray-400" />
                <span className="text-sm font-semibold text-gray-600">اضغط لاختيار صورة</span>
                <span className="text-xs text-gray-400">JPG, PNG أو WEBP — حتى {MAX_MB} ميجابايت</span>
              </>
            )}
          </label>
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
              <p className="text-sm font-semibold">تعذّر تحميل الصور</p>
              <p className="text-xs text-gray-400">
                {error instanceof Error ? error.message : 'خطأ غير معروف'}
              </p>
            </div>
          ) : slides.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-2 text-gray-400">
              <ImageIcon size={28} />
              <p className="text-sm font-semibold text-gray-600">لا توجد صور بعد</p>
              <p className="text-xs">أضِف أول صورة من الأعلى — هيرو الصفحة الرئيسية سيبقى بلا صور قواعد حتى ذلك.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {slides
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((slide, i, arr) => (
                  <SlideRow
                    key={slide.id}
                    slide={slide}
                    isFirst={i === 0}
                    isLast={i === arr.length - 1}
                    onMoveUp={() => move(slide, -1)}
                    onMoveDown={() => move(slide, 1)}
                    onToggleActive={() =>
                      updateSlide.mutate({ id: slide.id, is_active: !slide.is_active })
                    }
                    onDelete={() => {
                      if (confirm('حذف هذه الصورة نهائيًا؟')) deleteSlide.mutate(slide);
                    }}
                    onSave={(patch) => updateSlide.mutate({ id: slide.id, ...patch })}
                  />
                ))}
            </ul>
          )}
        </div>
      </div>
    </Layout>
  );
}

/* ── صف واحد ── */
function SlideRow({
  slide, isFirst, isLast, onMoveUp, onMoveDown, onToggleActive, onDelete, onSave,
}: {
  slide: HeroSlide;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  onSave: (patch: { title?: string | null; link_url?: string | null }) => void;
}) {
  const [title, setTitle] = useState(slide.title ?? '');
  const [link, setLink] = useState(slide.link_url ?? '');
  const dirty = title !== (slide.title ?? '') || link !== (slide.link_url ?? '');

  return (
    <li className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50/60 transition-colors">
      <div className="flex flex-col gap-1">
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className="p-1 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-20 disabled:pointer-events-none"
          aria-label="نقل لأعلى"
        >
          <ArrowUp size={14} />
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className="p-1 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-20 disabled:pointer-events-none"
          aria-label="نقل لأسفل"
        >
          <ArrowDown size={14} />
        </button>
      </div>

      <img
        src={slide.image_url}
        alt={slide.title ?? ''}
        className="w-14 h-14 rounded-xl object-contain bg-gray-50 border border-gray-100 flex-shrink-0"
      />

      <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="بلا عنوان"
          className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-200"
        />
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="بلا رابط"
          dir="ltr"
          className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-200"
        />
      </div>

      {dirty && (
        <button
          onClick={() => onSave({ title: title || null, link_url: link || null })}
          className="p-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 flex-shrink-0"
          aria-label="حفظ"
          title="حفظ"
        >
          <Save size={16} />
        </button>
      )}

      {slide.link_url && (
        <a
          href={slide.link_url}
          target="_blank"
          rel="noreferrer"
          className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 flex-shrink-0"
          title="فتح الرابط"
        >
          <ExternalLink size={15} />
        </a>
      )}

      <button
        onClick={onToggleActive}
        className={`p-2 rounded-lg flex-shrink-0 ${
          slide.is_active
            ? 'text-green-600 hover:bg-green-50'
            : 'text-gray-300 hover:bg-gray-100'
        }`}
        title={slide.is_active ? 'ظاهرة — اضغط للإخفاء' : 'مخفية — اضغط للإظهار'}
      >
        {slide.is_active ? <Eye size={17} /> : <EyeOff size={17} />}
      </button>

      <button
        onClick={onDelete}
        className="p-2 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
        title="حذف"
      >
        <Trash2 size={16} />
      </button>
    </li>
  );
}
