import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  uploadSiteAsset, useDeleteFeatureBox, useFeatureBoxes, useSaveFeatureBox, useSwapOrder, type FeatureBox,
} from '@/hooks/useAdsStrips';
import { FEATURE_ICONS, featureIcon } from '@/lib/featureIcons';

const field = 'px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300';

export default function FeatureBoxesSection() {
  const { data: boxes = [], isLoading } = useFeatureBoxes();
  const save = useSaveFeatureBox();
  const remove = useDeleteFeatureBox();
  const swap = useSwapOrder('home_feature_boxes', 'home-feature-boxes');
  const shown = boxes.filter((b) => b.is_active);

  const addBox = () =>
    save.mutate({
      title: 'عنوان جديد',
      description: 'اكتب هنا سطر قصير عن العرض أو الميزة.',
      icon_key: 'sparkles',
      sort_order: boxes.length ? Math.max(...boxes.map((b) => b.sort_order)) + 1 : 0,
      is_active: false,
    });

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-100 overflow-hidden">
        <p className="text-xs font-semibold text-gray-500 px-4 py-2 bg-gray-50">معاينة المربعات اللي فوق الفوتر</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-[#fbf6ed]" data-testid="feature-preview">
          {shown.map((box) => <BoxPreview key={box.id} box={box} />)}
          {shown.length === 0 && <p className="text-sm text-gray-400 col-span-full text-center">مفيش مربعات ظاهرة، فالقسم مش ظاهر في الموقع.</p>}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500">المربعات بتبان في صف واحد على الكمبيوتر، فأحسن عدد هو 4.</p>
        <button onClick={addBox} disabled={save.isPending} className="btn-secondary flex items-center gap-2 disabled:opacity-50">
          <Plus size={15} /> مربع جديد
        </button>
      </div>

      {isLoading ? (
        <div className="py-12 flex justify-center text-gray-400"><Loader2 className="animate-spin" /></div>
      ) : (
        <ul className="space-y-3">
          {boxes.map((box, i) => (
            <BoxEditor
              key={box.id}
              box={box}
              isFirst={i === 0}
              isLast={i === boxes.length - 1}
              onMove={(dir) => swap.mutate({ a: box, b: boxes[i + dir] })}
              onSave={(patch) => save.mutate({ id: box.id, ...patch })}
              onDelete={() => { if (confirm(`حذف مربع «${box.title}» نهائيًا؟`)) remove.mutate(box.id); }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function BoxPreview({ box }: { box: Pick<FeatureBox, 'title' | 'description' | 'icon_key' | 'image_url'> }) {
  const Icon = featureIcon(box.icon_key);
  return (
    <div className="flex items-start gap-3 bg-white rounded-2xl border border-[#e6d3ad] p-3">
      <div className="w-10 h-10 rounded-xl bg-[#f6ead2] text-[#b5863f] flex items-center justify-center flex-shrink-0 overflow-hidden">
        {box.image_url ? <img src={box.image_url} alt="" className="w-full h-full object-contain" /> : <Icon size={18} />}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-gray-800">{box.title}</p>
        <p className="text-xs text-gray-500 leading-relaxed">{box.description}</p>
      </div>
    </div>
  );
}

function BoxEditor({
  box, isFirst, isLast, onMove, onSave, onDelete,
}: {
  box: FeatureBox;
  isFirst: boolean;
  isLast: boolean;
  onMove: (dir: -1 | 1) => void;
  onSave: (patch: Partial<FeatureBox>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(box.title);
  const [description, setDescription] = useState(box.description ?? '');
  const [iconKey, setIconKey] = useState(box.icon_key ?? 'book-open-text');
  const [imageUrl, setImageUrl] = useState(box.image_url);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = title !== box.title || description !== (box.description ?? '') || iconKey !== (box.icon_key ?? 'book-open-text') || imageUrl !== box.image_url;

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast.error('الصورة لازم تكون JPG أو PNG أو WebP.');
      return;
    }
    setUploading(true);
    try {
      setImageUrl(await uploadSiteAsset(file));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذّر رفع الصورة');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <li className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3" data-testid="feature-box-row">
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-1">
          <button onClick={() => onMove(-1)} disabled={isFirst} aria-label="نقل لأعلى" className="p-1 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-20"><ArrowUp size={14} /></button>
          <button onClick={() => onMove(1)} disabled={isLast} aria-label="نقل لأسفل" className="p-1 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-20"><ArrowDown size={14} /></button>
        </div>
        <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} aria-label="عنوان المربع" placeholder="العنوان" className={field} />
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} aria-label="نص المربع" placeholder="سطر قصير" className={field} />
        </div>
        {dirty && (
          <button
            onClick={() => onSave({ title: title.trim(), description: description.trim() || null, icon_key: iconKey, image_url: imageUrl })}
            disabled={!title.trim() || uploading}
            className="p-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-40"
            aria-label="حفظ" title="حفظ"
          >
            <Save size={16} />
          </button>
        )}
        <button
          onClick={() => onSave({ is_active: !box.is_active })}
          className={`p-2 rounded-lg ${box.is_active ? 'text-green-600 hover:bg-green-50' : 'text-gray-300 hover:bg-gray-100'}`}
          title={box.is_active ? 'ظاهر — اضغط للإخفاء' : 'مخفي — اضغط للإظهار'}
          aria-label={box.is_active ? 'إخفاء المربع' : 'إظهار المربع'}
        >
          {box.is_active ? <Eye size={17} /> : <EyeOff size={17} />}
        </button>
        <button onClick={onDelete} className="p-2 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50" title="حذف" aria-label="حذف المربع">
          <Trash2 size={16} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500 ml-1">الأيقونة:</span>
        {FEATURE_ICONS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => { setIconKey(key); setImageUrl(null); }}
            aria-label={`أيقونة ${label}`}
            aria-pressed={!imageUrl && iconKey === key}
            title={label}
            className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-colors ${
              !imageUrl && iconKey === key ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            <Icon size={16} />
          </button>
        ))}
        <span className="text-xs text-gray-400 mx-1">أو</span>
        {imageUrl ? (
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl border border-indigo-300 bg-indigo-50">
            <img src={imageUrl} alt="" className="w-7 h-7 rounded-lg object-contain bg-white" />
            <button type="button" onClick={() => setImageUrl(null)} aria-label="شيل الصورة" className="text-gray-500 hover:text-red-600"><X size={14} /></button>
          </span>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-gray-300 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
            صورة من جهازك
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pickImage(e.target.files?.[0])} />
      </div>

      {dirty && <p className="text-xs text-amber-600">فيه تعديلات لسه ما اتحفظتش. دوس زرار الحفظ.</p>}
      <div className="max-w-xs"><BoxPreview box={{ title: title || '—', description, icon_key: iconKey, image_url: imageUrl }} /></div>
    </li>
  );
}
