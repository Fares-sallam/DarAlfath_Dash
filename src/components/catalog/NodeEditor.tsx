import { useMemo, useRef, useState } from 'react';
import { ImagePlus, Loader2, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ads/CategoryBarSection';
import { useCatalogCounts, useCreateNode, useDeleteNode, useUpdateNode, type NodeInput } from '@/hooks/useCatalog';
import { uploadSeriesCover } from '@/hooks/useSeries';
import { compressImage } from '@/lib/imageCompression';
import {
  BOOKS_SORT_LABELS, PAGE_LAYOUT_LABELS, NODE_TYPES, NODE_TYPE_HINTS, NODE_TYPE_LABELS, allowedParents, buildTree, nextSortFor, slugify,
  type BooksSort, type CatalogNode, type NodeType, type PageLayout,
} from '@/lib/catalogTree';
import NodeBooksPanel from './NodeBooksPanel';
import NodePagePanel from './NodePagePanel';

type TabKey = 'basic' | 'visibility' | 'page' | 'books' | 'seo';

export interface EditorTarget {
  /** the node being edited, or null to create one */
  node: CatalogNode | null;
  createType?: NodeType;
  createParentId?: string | null;
}

interface Props {
  target: EditorTarget;
  nodes: CatalogNode[];
  onClose: () => void;
}

const toLocalInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

export default function NodeEditor({ target, nodes, onClose }: Props) {
  const existing = target.node;
  const create = useCreateNode();
  const update = useUpdateNode();
  const remove = useDeleteNode();
  const { data: counts } = useCatalogCounts();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<TabKey>('basic');
  const [uploading, setUploading] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!!existing);

  const [type, setType] = useState<NodeType>(existing?.type ?? target.createType ?? 'category');
  const [nameAr, setNameAr] = useState(existing?.name_ar ?? '');
  const [nameEn, setNameEn] = useState(existing?.name_en ?? '');
  const [slug, setSlug] = useState(existing?.slug ?? '');
  const [parentId, setParentId] = useState<string>(existing?.parent_id ?? target.createParentId ?? '');
  const [descAr, setDescAr] = useState(existing?.description_ar ?? '');
  const [descEn, setDescEn] = useState(existing?.description_en ?? '');
  const [imageUrl, setImageUrl] = useState(existing?.image_url ?? '');
  const [isActive, setIsActive] = useState(existing?.is_active ?? true);
  const [featured, setFeatured] = useState(existing?.featured ?? false);
  const [showWeb, setShowWeb] = useState(existing?.show_web ?? true);
  const [showApp, setShowApp] = useState(existing?.show_app ?? true);
  const [inBar, setInBar] = useState((existing?.show_in_bar_web ?? true) || (existing?.show_in_bar_app ?? true));
  const [hideWhenEmpty, setHideWhenEmpty] = useState(existing?.hide_when_empty ?? true);
  const [startsAt, setStartsAt] = useState(toLocalInput(existing?.starts_at ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(existing?.ends_at ?? null));
  const [sortWeb, setSortWeb] = useState(String(existing?.sort_web ?? nextSortFor(nodes, type, 'web')));
  const [sortApp, setSortApp] = useState(String(existing?.sort_app ?? nextSortFor(nodes, type, 'app')));
  const [booksSortWeb, setBooksSortWeb] = useState<BooksSort>(existing?.books_sort_web ?? 'manual');
  const [booksSortApp, setBooksSortApp] = useState<BooksSort>(existing?.books_sort_app ?? 'manual');
  const [introAr, setIntroAr] = useState(existing?.intro_ar ?? '');
  const [introEn, setIntroEn] = useState(existing?.intro_en ?? '');
  const [videoUrl, setVideoUrl] = useState(existing?.video_url ?? '');
  const [pageLayout, setPageLayout] = useState<PageLayout>(existing?.page_layout ?? 'auto');
  const [stripsLimit, setStripsLimit] = useState(String(existing?.strips_limit ?? 12));
  const [showAsStrip, setShowAsStrip] = useState(existing?.show_as_strip ?? true);
  const [seoTitle, setSeoTitle] = useState(existing?.seo_title ?? '');
  const [seoDescription, setSeoDescription] = useState(existing?.seo_description ?? '');

  const parentOptions = useMemo(() => {
    const allowed = new Set(allowedParents(nodes, existing?.id ?? null).map((n) => n.id));
    const everyId = new Set(nodes.map((n) => n.id));
    return buildTree(nodes, 'web', everyId).filter((row) => allowed.has(row.node.id));
  }, [nodes, existing?.id]);

  const isLegacyType = type === 'series' || type === 'category' || type === 'collection';
  const typeLocked = !!existing && existing.legacy_table !== null;
  const allowedTypes = existing
    ? NODE_TYPES.filter((t) => (existing.type === 'series' ? t === 'series' : existing.type === 'section' ? t === 'section' : t === 'category' || t === 'collection'))
    : NODE_TYPES;
  const busy = create.isPending || update.isPending || remove.isPending || uploading;
  const isCategoryLike = type === 'category' || type === 'collection';

  const onName = (value: string) => {
    setNameAr(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const small = await compressImage(file);
      setImageUrl(await uploadSeriesCover(small));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذّر رفع الصورة');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async () => {
    const name = nameAr.trim();
    const finalSlug = slug.trim() || slugify(name);
    if (!name) { toast.error('اكتب الاسم بالعربي'); setTab('basic'); return; }
    if (!finalSlug) { toast.error('الرابط المختصر (slug) مطلوب'); setTab('basic'); return; }

    const limit = Number.parseInt(stripsLimit, 10);
    if (!Number.isFinite(limit) || limit < 1 || limit > 60) { toast.error('عدد الكتب في الشريط من 1 لـ 60'); setTab('page'); return; }
    if (videoUrl.trim() && !/^https:\/\/\S+$/i.test(videoUrl.trim())) { toast.error('رابط الفيديو لازم يبدأ بـ https://'); setTab('page'); return; }

    const values = {
      type,
      name_ar: name,
      name_en: nameEn.trim() || null,
      slug: finalSlug,
      parent_id: parentId || null,
      description_ar: descAr.trim() || null,
      description_en: descEn.trim() || null,
      image_url: imageUrl || null,
      is_active: isActive,
      featured,
      show_web: showWeb,
      show_app: showApp,
      show_in_bar_web: isCategoryLike ? inBar : (existing?.show_in_bar_web ?? false),
      show_in_bar_app: isCategoryLike ? inBar : (existing?.show_in_bar_app ?? false),
      hide_when_empty: hideWhenEmpty,
      starts_at: fromLocalInput(startsAt),
      ends_at: fromLocalInput(endsAt),
      sort_web: Number.parseInt(sortWeb, 10) || 0,
      sort_app: Number.parseInt(sortApp, 10) || 0,
      books_sort_web: booksSortWeb,
      books_sort_app: booksSortApp,
      intro_ar: introAr.trim() || null,
      intro_en: introEn.trim() || null,
      video_url: videoUrl.trim() || null,
      page_layout: pageLayout,
      strips_limit: limit,
      show_as_strip: showAsStrip,
      seo_title: seoTitle.trim() || null,
      seo_description: seoDescription.trim() || null,
    };

    if (existing) {
      const patch: Partial<CatalogNode> = {};
      (Object.keys(values) as (keyof typeof values)[]).forEach((key) => {
        const before = (existing as unknown as Record<string, unknown>)[key];
        const same = key === 'starts_at' || key === 'ends_at'
          ? (values[key] ? new Date(values[key] as string).getTime() : null) === (before ? new Date(before as string).getTime() : null)
          : values[key] === before;
        if (!same) (patch as Record<string, unknown>)[key] = values[key];
      });
      if (Object.keys(patch).length === 0) { onClose(); return; }
      await update.mutateAsync({ id: existing.id, patch });
      toast.success('تم الحفظ');
      onClose();
    } else {
      await create.mutateAsync(values as NodeInput);
      onClose();
    }
  };

  const confirmDelete = async () => {
    if (!existing) return;
    const c = counts?.get(existing.id);
    const kids = nodes.filter((n) => n.parent_id === existing.id).length;
    if ((c?.direct ?? 0) > 0 || kids > 0) {
      toast.error(`«${existing.name_ar}» فيه ${c?.direct ?? 0} كتاب و${kids} عنصر تحته. انقلهم أو شيلهم الأول.`);
      return;
    }
    if (!window.confirm(`حذف «${existing.name_ar}» نهائيًا؟`)) return;
    await remove.mutateAsync(existing.id);
    onClose();
  };

  const tabs: { key: TabKey; label: string; hidden?: boolean }[] = [
    { key: 'basic', label: 'الأساسيات' },
    { key: 'visibility', label: 'الظهور والترتيب' },
    { key: 'page', label: 'صفحة العرض' },
    { key: 'books', label: 'الكتب', hidden: !existing },
    { key: 'seo', label: 'البحث (SEO)' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto" dir="rtl" data-testid="node-editor">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl my-6 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-800">{existing ? `تعديل «${existing.name_ar}»` : `إضافة ${NODE_TYPE_LABELS[type]}`}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{NODE_TYPE_HINTS[type]}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500" aria-label="إغلاق"><X size={18} /></button>
        </div>

        <div className="flex border-b border-gray-100 flex-shrink-0 overflow-x-auto" role="tablist">
          {tabs.filter((t) => !t.hidden).map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 min-w-[110px] py-3 text-sm font-semibold ${tab === t.key ? 'border-b-2 border-blue-600 text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {tab === 'basic' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-sm font-semibold text-gray-700 mb-1.5">النوع</span>
                  <select value={type} onChange={(e) => setType(e.target.value as NodeType)} disabled={typeLocked && allowedTypes.length === 1} className="input-field" data-testid="field-type">
                    {allowedTypes.map((t) => <option key={t} value={t}>{NODE_TYPE_LABELS[t]}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-sm font-semibold text-gray-700 mb-1.5">يتبع (الأب)</span>
                  <select value={parentId} onChange={(e) => setParentId(e.target.value)} className="input-field" data-testid="field-parent">
                    <option value="">— على المستوى الأعلى —</option>
                    {parentOptions.map((row) => (
                      <option key={row.node.id} value={row.node.id}>{`${'— '.repeat(row.depth)}${NODE_TYPE_LABELS[row.node.type]}: ${row.node.name_ar}`}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-sm font-semibold text-gray-700 mb-1.5">الاسم بالعربي *</span>
                  <input value={nameAr} onChange={(e) => onName(e.target.value)} className="input-field" placeholder="مثال: سلسلة في رحاب الله" data-testid="field-name-ar" />
                </label>
                <label className="block">
                  <span className="block text-sm font-semibold text-gray-700 mb-1.5">الاسم بالإنجليزي</span>
                  <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className="input-field" dir="ltr" placeholder="Optional" data-testid="field-name-en" />
                </label>
                <label className="block md:col-span-2">
                  <span className="block text-sm font-semibold text-gray-700 mb-1.5">الرابط المختصر (slug) *</span>
                  <input
                    value={slug}
                    onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
                    className="input-field" dir="ltr" data-testid="field-slug"
                  />
                  {existing && isCategoryLike && slug !== existing.slug && (
                    <span className="block text-xs text-amber-600 mt-1">تغيير الرابط بيكسر أي رابط قديم للتصنيف ده (إعلانات، مشاركات).</span>
                  )}
                </label>
                <label className="block">
                  <span className="block text-sm font-semibold text-gray-700 mb-1.5">الوصف بالعربي</span>
                  <textarea value={descAr} onChange={(e) => setDescAr(e.target.value)} rows={3} className="input-field" />
                </label>
                <label className="block">
                  <span className="block text-sm font-semibold text-gray-700 mb-1.5">الوصف بالإنجليزي</span>
                  <textarea value={descEn} onChange={(e) => setDescEn(e.target.value)} rows={3} className="input-field" dir="ltr" />
                </label>
              </div>

              <div>
                <span className="block text-sm font-semibold text-gray-700 mb-1.5">الصورة</span>
                <div className="flex items-center gap-3">
                  <div className="w-20 h-20 rounded-2xl bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center">
                    {imageUrl ? <img src={imageUrl} alt="" className="w-full h-full object-contain" /> : <ImagePlus size={20} className="text-gray-300" />}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50">
                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} رفع صورة
                  </button>
                  {imageUrl && <button type="button" onClick={() => setImageUrl('')} className="text-sm text-red-500 hover:underline">إزالة</button>}
                </div>
              </div>
            </>
          )}

          {tab === 'visibility' && (
            <>
              <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
                الموقع بيتبع إعدادات «الموقع» (الظهور والترتيب وترتيب الكتب)، والنسخة المنشورة من التطبيق لسه بتتبع إعدادات «التطبيق». الجدولة (يبدأ/ينتهي) بتشتغل على الموقع بس. «مميّز» محفوظ ومفيش مكان بيستخدمه لسه.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { label: 'ظاهر (مفعّل)', value: isActive, set: setIsActive },
                  { label: 'مميّز', value: featured, set: setFeatured },
                  { label: 'يظهر في الموقع', value: showWeb, set: setShowWeb },
                  { label: 'يظهر في التطبيق', value: showApp, set: setShowApp },
                  ...(isCategoryLike ? [{ label: 'يظهر في شريط التصنيفات', value: inBar, set: setInBar }] : []),
                  { label: 'يختفي لما يبقى فاضي (بلا كتب)', value: hideWhenEmpty, set: setHideWhenEmpty },
                  { label: 'يظهر كشريط في صفحة اللي فوقه', value: showAsStrip, set: setShowAsStrip },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                    <span className="text-sm font-semibold text-gray-700">{row.label}</span>
                    <Switch checked={row.value} onChange={row.set} label={row.label} />
                  </div>
                ))}
              </div>
              {type === 'series' && <p className="text-xs text-gray-500">ظهور السلسلة في قايمة الموقع العلوية وترتيبها فيها من تاب «خريطة العرض».</p>}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-sm font-semibold text-gray-700 mb-1.5">يبدأ الظهور في</span>
                  <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="input-field" />
                </label>
                <label className="block">
                  <span className="block text-sm font-semibold text-gray-700 mb-1.5">ينتهي الظهور في</span>
                  <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="input-field" />
                </label>
                <label className="block">
                  <span className="block text-sm font-semibold text-gray-700 mb-1.5">الترتيب في الموقع</span>
                  <input type="number" value={sortWeb} onChange={(e) => setSortWeb(e.target.value)} className="input-field" data-testid="field-sort-web" />
                </label>
                <label className="block">
                  <span className="block text-sm font-semibold text-gray-700 mb-1.5">الترتيب في التطبيق</span>
                  <input type="number" value={sortApp} onChange={(e) => setSortApp(e.target.value)} className="input-field" data-testid="field-sort-app" />
                </label>
                <label className="block">
                  <span className="block text-sm font-semibold text-gray-700 mb-1.5">ترتيب الكتب في الموقع</span>
                  <select value={booksSortWeb} onChange={(e) => setBooksSortWeb(e.target.value as BooksSort)} className="input-field">
                    {(Object.keys(BOOKS_SORT_LABELS) as BooksSort[]).map((k) => <option key={k} value={k}>{BOOKS_SORT_LABELS[k]}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-sm font-semibold text-gray-700 mb-1.5">ترتيب الكتب في التطبيق</span>
                  <select value={booksSortApp} onChange={(e) => setBooksSortApp(e.target.value as BooksSort)} className="input-field">
                    {(Object.keys(BOOKS_SORT_LABELS) as BooksSort[]).map((k) => <option key={k} value={k}>{BOOKS_SORT_LABELS[k]}</option>)}
                  </select>
                </label>
              </div>
              {!isLegacyType && <p className="text-xs text-gray-500">«القسم» مستوى جديد: بيظهر في الواجهات الجديدة بس، والنسخ القديمة من التطبيق بتشوف السلاسل والتصنيفات اللي تحته مباشرة.</p>}
            </>
          )}

          {tab === 'page' && (
            <>
              <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2">
                صفحة «{nameAr || 'العنصر'}» نفسها: اسمه فوق، وتحته كلمة تعريفية وفيديو (اختياريين)، وبعدهم أشرطة كتب. بتظهر على الموقع دلوقتي (التطبيق في نسخته الجاية).
              </p>
              <label className="block">
                <span className="block text-sm font-semibold text-gray-700 mb-1.5">كلمة تعريفية (بالعربي)</span>
                <textarea value={introAr} onChange={(e) => setIntroAr(e.target.value)} rows={5} className="input-field" placeholder="مثال: سلسلة الفتح الرباني، منهج متكامل لتعليم…" data-testid="field-intro-ar" />
              </label>
              <label className="block">
                <span className="block text-sm font-semibold text-gray-700 mb-1.5">كلمة تعريفية (بالإنجليزي)</span>
                <textarea value={introEn} onChange={(e) => setIntroEn(e.target.value)} rows={3} className="input-field" dir="ltr" />
              </label>
              <label className="block">
                <span className="block text-sm font-semibold text-gray-700 mb-1.5">فيديو للعرض (رابط https)</span>
                <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className="input-field" dir="ltr" placeholder="https://www.youtube.com/watch?v=..." data-testid="field-video" />
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-sm font-semibold text-gray-700 mb-1.5">شكل الصفحة</span>
                  <select value={pageLayout} onChange={(e) => setPageLayout(e.target.value as PageLayout)} className="input-field" data-testid="field-layout">
                    {(Object.keys(PAGE_LAYOUT_LABELS) as PageLayout[]).map((k) => <option key={k} value={k}>{PAGE_LAYOUT_LABELS[k]}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-sm font-semibold text-gray-700 mb-1.5">عدد الكتب في كل شريط</span>
                  <input type="number" min={1} max={60} value={stripsLimit} onChange={(e) => setStripsLimit(e.target.value)} className="input-field" data-testid="field-strips-limit" />
                </label>
              </div>
              {existing && <NodePagePanel node={existing} nodes={nodes} />}
            </>
          )}

          {tab === 'books' && existing && <NodeBooksPanel node={existing} />}

          {tab === 'seo' && (
            <>
              <label className="block">
                <span className="block text-sm font-semibold text-gray-700 mb-1.5">عنوان الصفحة (SEO)</span>
                <input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} className="input-field" placeholder="لو فاضي بنستخدم الاسم" />
              </label>
              <label className="block">
                <span className="block text-sm font-semibold text-gray-700 mb-1.5">وصف الصفحة (SEO)</span>
                <textarea value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} rows={3} className="input-field" placeholder="لو فاضي بنستخدم الوصف" />
              </label>
              <p className="text-xs text-gray-500">بتظهر على الموقع في نتايج جوجل ومعاينة الروابط المتشاركة.</p>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          {existing ? (
            <button type="button" onClick={() => void confirmDelete()} disabled={busy} className="flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 px-3 py-2 rounded-xl disabled:opacity-50" data-testid="delete-node">
              <Trash2 size={14} /> حذف
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold hover:bg-gray-50">إلغاء</button>
            <button type="button" onClick={() => void save()} disabled={busy} className="btn-primary flex items-center gap-2 disabled:opacity-50" data-testid="save-node">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {existing ? 'حفظ' : 'إضافة'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
