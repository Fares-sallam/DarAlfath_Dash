import { useRef, useState } from 'react';
import Layout from '@/components/layout/Layout';
import {
  Image as ImageIcon, Upload, Trash2, ArrowUp, ArrowDown, Eye, EyeOff,
  Loader2, AlertTriangle, ExternalLink, Save, Smartphone, X, Moon,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useHeroSlides, uploadHeroImage, useCreateHeroSlide, useUpdateHeroSlide,
  useReorderHeroSlide, useDeleteHeroSlide, type HeroSlide,
} from '@/hooks/useHeroSlides';

const MAX_MB = 5;

function validateImageFile(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'الملف لازم يكون صورة (JPG, PNG, WEBP)';
  if (file.size > MAX_MB * 1024 * 1024) return `حجم الصورة أكبر من ${MAX_MB} ميجابايت`;
  return null;
}

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

  // The mobile variant is picked first but uploaded together with the
  // desktop one — it's optional, so nothing commits until the required
  // desktop image is chosen.
  const [mobileFile, setMobileFile] = useState<File | null>(null);
  const [mobilePreview, setMobilePreview] = useState<string | null>(null);
  const mobileFileRef = useRef<HTMLInputElement>(null);

  const clearMobilePick = () => {
    if (mobilePreview) URL.revokeObjectURL(mobilePreview);
    setMobileFile(null);
    setMobilePreview(null);
    if (mobileFileRef.current) mobileFileRef.current.value = '';
  };

  // Dark-mode variants — both optional, same "pick now, upload on save"
  // deferral as the mobile slot above. Design can differ enough between
  // themes that a single image can't serve both, so admins may skip these
  // entirely and the storefront falls back to the light-mode images.
  const [darkFile, setDarkFile] = useState<File | null>(null);
  const [darkPreview, setDarkPreview] = useState<string | null>(null);
  const darkFileRef = useRef<HTMLInputElement>(null);

  const clearDarkPick = () => {
    if (darkPreview) URL.revokeObjectURL(darkPreview);
    setDarkFile(null);
    setDarkPreview(null);
    if (darkFileRef.current) darkFileRef.current.value = '';
  };

  const [mobileDarkFile, setMobileDarkFile] = useState<File | null>(null);
  const [mobileDarkPreview, setMobileDarkPreview] = useState<string | null>(null);
  const mobileDarkFileRef = useRef<HTMLInputElement>(null);

  const clearMobileDarkPick = () => {
    if (mobileDarkPreview) URL.revokeObjectURL(mobileDarkPreview);
    setMobileDarkFile(null);
    setMobileDarkPreview(null);
    if (mobileDarkFileRef.current) mobileDarkFileRef.current.value = '';
  };

  const handleUpload = async (file: File) => {
    const err = validateImageFile(file);
    if (err) {
      toast.error(err);
      return;
    }

    setUploading(true);
    try {
      const url = await uploadHeroImage(file);
      const mobileUrl = mobileFile ? await uploadHeroImage(mobileFile) : null;
      const darkUrl = darkFile ? await uploadHeroImage(darkFile) : null;
      const mobileDarkUrl = mobileDarkFile ? await uploadHeroImage(mobileDarkFile) : null;
      const nextOrder = slides.length
        ? Math.max(...slides.map((s) => s.sort_order)) + 1
        : 0;
      await createSlide.mutateAsync({
        image_url: url,
        image_url_mobile: mobileUrl,
        image_url_dark: darkUrl,
        image_url_mobile_dark: mobileDarkUrl,
        title: newTitle.trim() || undefined,
        link_url: newLink.trim() || undefined,
        sort_order: nextOrder,
      });
      setNewTitle('');
      setNewLink('');
      if (fileRef.current) fileRef.current.value = '';
      clearMobilePick();
      clearDarkPick();
      clearMobileDarkPick();
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
              صور البانر المعروضة في هيرو الصفحة الرئيسية — أضِف، رتّب، أو أخفِ أي صورة في أي وقت.
              الصورة تظهر بعرضها الطبيعي كاملة، فالأنسب رفع صورة بانر جاهزة (عريضة) لا صورة غلاف كتاب مفردة.
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

          {/* ── الوضع النهاري (Light) ── الكمبيوتر مطلوب، الموبايل اختياري */}
          <div>
            <p className="text-xs font-bold text-gray-500 mb-2">الوضع النهاري (Light)</p>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-stretch">
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
                    <span className="text-sm font-semibold text-gray-600">اضغط لاختيار صورة (الكمبيوتر)</span>
                    <span className="text-xs text-gray-400">JPG, PNG أو WEBP — حتى {MAX_MB} ميجابايت</span>
                  </>
                )}
              </label>

              {/* نسخة الموبايل — اختيارية، تُرفع مع صورة الكمبيوتر عند الإضافة.
                  نفس الصورة عادة بتبان مقصوصة أو صغيرة على الموبايل، فهنا تقدر
                  ترفع نسخة تانية بأبعاد مناسبة للشاشات الضيقة. */}
              <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-gray-200 rounded-xl py-8 px-4 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors md:w-40 relative">
                <input
                  ref={mobileFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const err = validateImageFile(file);
                    if (err) {
                      toast.error(err);
                      e.target.value = '';
                      return;
                    }
                    if (mobilePreview) URL.revokeObjectURL(mobilePreview);
                    setMobileFile(file);
                    setMobilePreview(URL.createObjectURL(file));
                  }}
                />
                {mobilePreview ? (
                  <>
                    <img src={mobilePreview} alt="" className="w-10 h-10 rounded-lg object-contain bg-gray-50" />
                    <span className="text-xs font-semibold text-gray-600">نسخة الموبايل جاهزة</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        clearMobilePick();
                      }}
                      className="absolute top-2 left-2 p-1 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-red-500"
                      aria-label="إلغاء نسخة الموبايل"
                    >
                      <X size={12} />
                    </button>
                  </>
                ) : (
                  <>
                    <Smartphone size={20} className="text-gray-400" />
                    <span className="text-xs font-semibold text-gray-600 text-center">نسخة الموبايل<br />(اختياري)</span>
                  </>
                )}
              </label>
            </div>
          </div>

          {/* ── الوضع الليلي (Dark) ── الاثنين اختياريان، يرجع للصور النهارية
              لو الأدمن ملاش الخانة دي — التصميم بيختلف كفاية بين الوضعين
              إن صورة واحدة متقدرش تخدم الاتنين. */}
          <div>
            <p className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1.5">
              <Moon size={13} />
              الوضع الليلي (Dark) — اختياري، هيرجع لصور الوضع النهاري لو فاضي
            </p>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-stretch">
              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-indigo-200 bg-indigo-50/20 rounded-xl py-8 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors relative">
                <input
                  ref={darkFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const err = validateImageFile(file);
                    if (err) {
                      toast.error(err);
                      e.target.value = '';
                      return;
                    }
                    if (darkPreview) URL.revokeObjectURL(darkPreview);
                    setDarkFile(file);
                    setDarkPreview(URL.createObjectURL(file));
                  }}
                />
                {darkPreview ? (
                  <>
                    <img src={darkPreview} alt="" className="w-10 h-10 rounded-lg object-contain bg-gray-50" />
                    <span className="text-sm font-semibold text-gray-600">نسخة الدارك مود (الكمبيوتر) جاهزة</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        clearDarkPick();
                      }}
                      className="absolute top-2 left-2 p-1 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-red-500"
                      aria-label="إلغاء نسخة الدارك مود"
                    >
                      <X size={12} />
                    </button>
                  </>
                ) : (
                  <>
                    <Moon size={22} className="text-indigo-300" />
                    <span className="text-sm font-semibold text-gray-600">اضغط لاختيار صورة الدارك مود (الكمبيوتر)</span>
                    <span className="text-xs text-gray-400">اختياري — JPG, PNG أو WEBP حتى {MAX_MB} ميجابايت</span>
                  </>
                )}
              </label>

              <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-indigo-200 bg-indigo-50/20 rounded-xl py-8 px-4 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors md:w-40 relative">
                <input
                  ref={mobileDarkFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const err = validateImageFile(file);
                    if (err) {
                      toast.error(err);
                      e.target.value = '';
                      return;
                    }
                    if (mobileDarkPreview) URL.revokeObjectURL(mobileDarkPreview);
                    setMobileDarkFile(file);
                    setMobileDarkPreview(URL.createObjectURL(file));
                  }}
                />
                {mobileDarkPreview ? (
                  <>
                    <img src={mobileDarkPreview} alt="" className="w-10 h-10 rounded-lg object-contain bg-gray-50" />
                    <span className="text-xs font-semibold text-gray-600">نسخة موبايل الدارك مود جاهزة</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        clearMobileDarkPick();
                      }}
                      className="absolute top-2 left-2 p-1 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-red-500"
                      aria-label="إلغاء نسخة موبايل الدارك مود"
                    >
                      <X size={12} />
                    </button>
                  </>
                ) : (
                  <>
                    <Smartphone size={20} className="text-indigo-300" />
                    <span className="text-xs font-semibold text-gray-600 text-center">موبايل دارك مود<br />(اختياري)</span>
                  </>
                )}
              </label>
            </div>
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
              <p className="text-sm font-semibold">تعذّر تحميل الصور</p>
              <p className="text-xs text-gray-400">
                {error instanceof Error ? error.message : 'خطأ غير معروف'}
              </p>
            </div>
          ) : slides.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-2 text-gray-400">
              <ImageIcon size={28} />
              <p className="text-sm font-semibold text-gray-600">لا توجد صور بعد</p>
              <p className="text-xs">أضِف أول صورة من الأعلى — هيرو الصفحة الرئيسية سيبقى بلا صور حتى ذلك.</p>
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
  onSave: (patch: {
    title?: string | null;
    link_url?: string | null;
    image_url_mobile?: string | null;
    image_url_dark?: string | null;
    image_url_mobile_dark?: string | null;
  }) => void;
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
        title="صورة الكمبيوتر"
        className="w-14 h-14 rounded-xl object-contain bg-gray-50 border border-gray-100 flex-shrink-0"
      />

      <MobileImageSlot slide={slide} onSave={onSave} />

      <div className="w-px self-stretch bg-gray-100 flex-shrink-0" aria-hidden="true" />

      <DarkImageSlot slide={slide} onSave={onSave} />
      <MobileDarkImageSlot slide={slide} onSave={onSave} />

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

/* ── نسخة الموبايل داخل الصف: إضافة / تغيير / إزالة ── */
function MobileImageSlot({
  slide,
  onSave,
}: {
  slide: HeroSlide;
  onSave: (patch: { image_url_mobile?: string | null }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handlePick = async (file: File) => {
    const err = validateImageFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      const url = await uploadHeroImage(file);
      onSave({ image_url_mobile: url });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذّر رفع الصورة');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="relative flex-shrink-0 group">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handlePick(file);
        }}
      />

      {slide.image_url_mobile ? (
        <>
          <img
            src={slide.image_url_mobile}
            alt=""
            title="نسخة الموبايل — اضغط للتغيير"
            onClick={() => inputRef.current?.click()}
            className="w-9 h-9 rounded-lg object-contain bg-gray-50 border border-gray-100 cursor-pointer"
          />
          <button
            onClick={() => onSave({ image_url_mobile: null })}
            className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="إزالة نسخة الموبايل"
            title="إزالة نسخة الموبايل"
          >
            <X size={10} />
          </button>
        </>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="w-9 h-9 rounded-lg border border-dashed border-gray-300 text-gray-300 hover:text-indigo-500 hover:border-indigo-300 flex items-center justify-center"
          aria-label="إضافة نسخة موبايل"
          title="إضافة نسخة موبايل (اختياري)"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Smartphone size={13} />}
        </button>
      )}
    </div>
  );
}

/* ── خانة الدارك مود (كمبيوتر) داخل الصف: إضافة / تغيير / إزالة ── */
function DarkImageSlot({
  slide,
  onSave,
}: {
  slide: HeroSlide;
  onSave: (patch: { image_url_dark?: string | null }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handlePick = async (file: File) => {
    const err = validateImageFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      const url = await uploadHeroImage(file);
      onSave({ image_url_dark: url });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذّر رفع الصورة');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="relative flex-shrink-0 group">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handlePick(file);
        }}
      />

      {slide.image_url_dark ? (
        <>
          <img
            src={slide.image_url_dark}
            alt=""
            title="نسخة الدارك مود (الكمبيوتر) — اضغط للتغيير"
            onClick={() => inputRef.current?.click()}
            className="w-9 h-9 rounded-lg object-contain bg-gray-900 border border-gray-100 cursor-pointer"
          />
          <button
            onClick={() => onSave({ image_url_dark: null })}
            className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="إزالة نسخة الدارك مود"
            title="إزالة نسخة الدارك مود"
          >
            <X size={10} />
          </button>
        </>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="w-9 h-9 rounded-lg border border-dashed border-indigo-200 text-indigo-300 hover:text-indigo-500 hover:border-indigo-400 flex items-center justify-center"
          aria-label="إضافة نسخة دارك مود"
          title="إضافة نسخة دارك مود — الكمبيوتر (اختياري، هيرجع للصورة النهارية لو فاضي)"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Moon size={13} />}
        </button>
      )}
    </div>
  );
}

/* ── خانة الدارك مود (موبايل) داخل الصف: إضافة / تغيير / إزالة ── */
function MobileDarkImageSlot({
  slide,
  onSave,
}: {
  slide: HeroSlide;
  onSave: (patch: { image_url_mobile_dark?: string | null }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handlePick = async (file: File) => {
    const err = validateImageFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      const url = await uploadHeroImage(file);
      onSave({ image_url_mobile_dark: url });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذّر رفع الصورة');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="relative flex-shrink-0 group">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handlePick(file);
        }}
      />

      {slide.image_url_mobile_dark ? (
        <>
          <img
            src={slide.image_url_mobile_dark}
            alt=""
            title="نسخة موبايل الدارك مود — اضغط للتغيير"
            onClick={() => inputRef.current?.click()}
            className="w-9 h-9 rounded-lg object-contain bg-gray-900 border border-gray-100 cursor-pointer"
          />
          <button
            onClick={() => onSave({ image_url_mobile_dark: null })}
            className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="إزالة نسخة موبايل الدارك مود"
            title="إزالة نسخة موبايل الدارك مود"
          >
            <X size={10} />
          </button>
        </>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="w-9 h-9 rounded-lg border border-dashed border-indigo-200 text-indigo-300 hover:text-indigo-500 hover:border-indigo-400 flex items-center justify-center"
          aria-label="إضافة نسخة موبايل دارك مود"
          title="إضافة نسخة موبايل دارك مود (اختياري)"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Smartphone size={13} />}
        </button>
      )}
    </div>
  );
}
