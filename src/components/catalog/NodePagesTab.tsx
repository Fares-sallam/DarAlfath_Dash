import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ExternalLink, Loader2, Save, Search, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import LiveFrame from '@/components/preview/LiveFrame';
import { Pills, PreviewShell } from '@/components/preview/PreviewControls';
import PreviewDock from '@/components/preview/PreviewDock';
import { useCatalogNodes, useUpdateNode } from '@/hooks/useCatalog';
import { NODE_TYPE_LABELS, PAGE_LAYOUT_LABELS, buildTree, type CatalogNode, type IntroAlign, type IntroTextPos, type NodeType, type PageLayout } from '@/lib/catalogTree';
import { STOREFRONT_URL } from '@/lib/storefront';
import { SITE_PREVIEW_READY, buildNodePageMessage, siteOrigin, sitePreviewUrl } from '@/lib/livePreview';
import {
  FONT_MAX, FONT_MIN, PAD_MAX, formFromNode, nodePagePatch, nodePageProblems, pageSummary, previewFields, type MediaChoice, type NodePageForm,
} from '@/lib/nodePageDraft';
import NodePagePanel from './NodePagePanel';
import PicturePicker from './PicturePicker';

const TYPE_CHIP: Record<NodeType, string> = {
  section: 'bg-violet-100 text-violet-700',
  series: 'bg-blue-100 text-blue-700',
  category: 'bg-emerald-100 text-emerald-700',
  collection: 'bg-amber-100 text-amber-700',
};

const SIZE = { mobile: { width: 390, height: 640 }, desktop: { width: 1100, height: 640 } } as const;

function Block({ title, hint, children, testId }: { title: string; hint?: string; children: ReactNode; testId: string }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm p-4 space-y-3" data-testid={testId}>
      <div>
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        {hint && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** A number chosen by sliding or typing. */
function Amount({ label, value, min, max, unit = 'px', onChange, testId }: { label: string; value: number; min: number; max: number; unit?: string; onChange: (next: number) => void; testId: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-semibold text-gray-600 w-28 flex-shrink-0">{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-blue-600" aria-label={label} />
      <div className="flex items-center gap-1 flex-shrink-0">
        <input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="input-field !w-20 !py-1.5 text-sm text-center" aria-label={`${label} (رقم)`} data-testid={testId} />
        <span className="text-[11px] text-gray-400">{unit}</span>
      </div>
    </div>
  );
}

/**
 * «صفحات الأقسام»: the top of a section's, series' or category's own page: a video or a picture, the welcome text and how it is
 * set (aligned right / centred / left, its size, the space at its sides, above / below / beside the picture or video), then the
 * books. One place for it all, with the real page shown beside it with the unsaved changes.
 */
export default function NodePagesTab({ openNodeId, onOpened }: { openNodeId?: string | null; onOpened?: () => void }) {
  const { data: nodes = [], isLoading } = useCatalogNodes();
  const update = useUpdateNode();

  const [nodeId, setNodeId] = useState<string | null>(null);
  const [form, setForm] = useState<NodePageForm | null>(null);
  const [query, setQuery] = useState('');
  const [device, setDevice] = useState<'mobile' | 'desktop'>('desktop');

  // a link from the tree (or the editor) opens that node's page once
  useEffect(() => {
    if (!openNodeId || nodes.length === 0) return;
    if (nodes.some((n) => n.id === openNodeId)) setNodeId(openNodeId);
    onOpened?.();
  }, [openNodeId, nodes, onOpened]);

  const node = nodes.find((n) => n.id === nodeId) ?? null;
  const base = node ? formFromNode(node) : null;
  const baseKey = node ? `${node.id}|${node.updated_at}` : '';
  useEffect(() => { setForm(node ? formFromNode(node) : null); }, [baseKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => buildTree(nodes, 'web', new Set(nodes.map((n) => n.id)), query), [nodes, query]);
  const dirty = !!node && !!form && Object.keys(nodePagePatch(node, form)).length > 0;
  const problems = form ? nodePageProblems(form) : {};
  const hasProblems = Object.keys(problems).length > 0;

  const set = (patch: Partial<NodePageForm>) => setForm((current) => (current ? { ...current, ...patch } : current));

  const message = useMemo(() => (node && form ? buildNodePageMessage(node.id, node.type, previewFields(form)) : null), [node, form]);

  const onSave = async () => {
    if (!node || !form) return;
    if (hasProblems) { toast.error(problems.video ?? problems.strips ?? 'راجع الخانات'); return; }
    const patch = nodePagePatch(node, form);
    if (Object.keys(patch).length === 0) return;
    await update.mutateAsync({ id: node.id, patch });
    toast.success('اتحفظ. صفحة القسم بتتغيّر في الموقع خلال دقيقة');
  };

  const hiddenOnSite = node && (!node.is_active || !node.show_web);
  const hasText = !!form && (form.introAr.trim() !== '');
  const hasMedia = !!form && ((form.media === 'video' && form.videoUrl.trim() !== '') || (form.media === 'image' && !!form.imageUrl));

  const picker = (
    <Block title="اختار الصفحة" hint="كل قسم وسلسلة وتصنيف ليه صفحته الخاصة في الموقع (بتفتح من الهيدر أو من كروت أقسام المتجر)." testId="pages-picker">
      <div className="relative">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث..." className="input-field pr-9 text-sm py-2 h-auto" data-testid="pages-node-search" />
        <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
      </div>
      <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
        {isLoading && <div className="flex items-center justify-center gap-2 py-6 text-gray-400"><Loader2 size={16} className="animate-spin" /></div>}
        {rows.map(({ node: n, depth }) => {
          const parts = pageSummary(n);
          const on = n.id === nodeId;
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => setNodeId(n.id)}
              aria-pressed={on}
              className={`w-full flex items-center gap-2 px-3 py-2 text-right ${on ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
              style={{ paddingRight: 12 + depth * 18 }}
              data-testid="pages-node-row"
              data-node-id={n.id}
            >
              <span className={`text-sm flex-1 truncate ${on ? 'font-bold text-blue-800' : 'font-semibold text-gray-800'}`}>{n.name_ar}</span>
              {parts.map((p) => <span key={p} className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-green-100 text-green-700">{p}</span>)}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${TYPE_CHIP[n.type]}`}>{NODE_TYPE_LABELS[n.type]}</span>
            </button>
          );
        })}
        {!isLoading && rows.length === 0 && <p className="text-sm text-gray-400 text-center py-6">مفيش نتايج.</p>}
      </div>
    </Block>
  );

  const editor = node && form && base ? (
    <div className="space-y-4" data-testid="pages-editor" data-node-id={node.id}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-gray-800 truncate">صفحة «{node.name_ar}»</h2>
          <p className="text-xs text-gray-500">{NODE_TYPE_LABELS[node.type]}</p>
        </div>
        <a href={`${STOREFRONT_URL}${node.type === 'series' ? `/books?series=${node.id}` : `/books?node=${node.id}`}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1">
          افتحها في الموقع <ExternalLink size={12} />
        </a>
      </div>
      {hiddenOnSite && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2 flex items-center gap-2" data-testid="pages-hidden-note">
          <AlertTriangle size={14} /> العنصر ده مقفول أو مخفي عن الموقع، فصفحته مش بتفتح للزوار دلوقتي (المعاينة بتتعرض فاضية).
        </p>
      )}

      <Block title="1. الفيديو أو الصورة" hint="أول حاجة بتظهر في الصفحة، أو جنب الكلام (حسب ما تختار تحت)." testId="pages-media">
        <Pills<MediaChoice> label="نوع الميديا" value={form.media} onChange={(media) => set({ media })} options={[
          { key: 'none', label: 'بدون', testId: 'media-none' },
          { key: 'video', label: 'فيديو', testId: 'media-video' },
          { key: 'image', label: 'صورة', testId: 'media-image' },
        ]} />
        {form.media === 'video' && (
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">رابط الفيديو (https)</span>
            <input value={form.videoUrl} onChange={(e) => set({ videoUrl: e.target.value })} className="input-field" dir="ltr" placeholder="https://www.youtube.com/watch?v=..." data-testid="field-video" />
            {problems.video && <span className="text-[11px] text-red-600 font-medium" data-testid="video-problem">{problems.video}</span>}
            <span className="block text-[11px] text-gray-400 mt-1">يوتيوب أو فيميو أو ملف فيديو. بيظهر صورة غلاف وزرار تشغيل.</span>
          </label>
        )}
        {form.media === 'image' && <PicturePicker value={form.imageUrl} onChange={(imageUrl) => set({ imageUrl })} label="صورة الصفحة" shape="wide" testId="pages-picture" />}
      </Block>

      <Block title="2. الكلام التعريفي" hint="فقرة أو أكتر (سطر فاضي بين كل فقرة). بيظهر تحت اسم العنصر." testId="pages-text">
        <textarea value={form.introAr} onChange={(e) => set({ introAr: e.target.value })} rows={6} className="input-field" placeholder="مثال: سلسلة الفتح الرباني، منهج متكامل لتعليم…" data-testid="field-intro-ar" aria-label="الكلام التعريفي بالعربي" />
        <label className="block">
          <span className="block text-xs font-semibold text-gray-600 mb-1">بالإنجليزي (اختياري)</span>
          <textarea value={form.introEn} onChange={(e) => set({ introEn: e.target.value })} rows={3} className="input-field" dir="ltr" data-testid="field-intro-en" />
        </label>
      </Block>

      <Block title="3. شكل الكلام" hint="المحاذاة والحجم والمسافات ومكانه بالنسبة للفيديو أو الصورة. بيتطبّق على الاسم والكلام كله." testId="pages-look">
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-gray-600 w-28">المحاذاة</span>
            <Pills<IntroAlign> label="محاذاة الكلام" value={form.align} onChange={(align) => set({ align })} options={[
              { key: 'right', label: 'يمين', testId: 'align-right' },
              { key: 'center', label: 'وسط', testId: 'align-center' },
              { key: 'left', label: 'شمال', testId: 'align-left' },
            ]} />
          </div>
          <Amount label="حجم الخط" value={form.fontPx} min={FONT_MIN} max={FONT_MAX} onChange={(fontPx) => set({ fontPx })} testId="field-font" />
          <Amount label="مسافة من اليمين" value={form.padRight} min={0} max={PAD_MAX} onChange={(padRight) => set({ padRight })} testId="field-pad-right" />
          <Amount label="مسافة من الشمال" value={form.padLeft} min={0} max={PAD_MAX} onChange={(padLeft) => set({ padLeft })} testId="field-pad-left" />
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-gray-600 w-28">مكان الكلام</span>
            <Pills<IntroTextPos> label="مكان الكلام" value={form.textPos} onChange={(textPos) => set({ textPos })} options={[
              { key: 'above', label: 'فوق الفيديو/الصورة', testId: 'pos-above' },
              { key: 'below', label: 'تحتها', testId: 'pos-below' },
              { key: 'side', label: 'جنبها', testId: 'pos-side' },
            ]} />
            {!hasMedia && <span className="text-[11px] text-gray-400" data-testid="pos-note">بيشتغل لما تختار فيديو أو صورة.</span>}
          </div>
          {!hasText && !hasMedia && <p className="text-[11px] text-gray-400">ما فيش كلام ولا ميديا: الصفحة هتعرض الاسم بس وبعده الكتب.</p>}
        </div>
      </Block>

      <Block title="4. الكتب تحت" hint="بعد الاسم والكلام والميديا بتيجي الكتب. رتّب الأشرطة أو اخفي اللي مش عايزه (الترتيب والإخفاء بيتحفظوا فورًا)." testId="pages-books">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">شكل الصفحة</span>
            <select value={form.pageLayout} onChange={(e) => set({ pageLayout: e.target.value as PageLayout })} className="input-field" data-testid="field-layout">
              {(Object.keys(PAGE_LAYOUT_LABELS) as PageLayout[]).map((k) => <option key={k} value={k}>{PAGE_LAYOUT_LABELS[k]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">عدد الكتب في كل شريط</span>
            <input type="number" min={1} max={60} value={form.stripsLimit} onChange={(e) => set({ stripsLimit: Number(e.target.value) })} className="input-field" data-testid="field-strips-limit" />
            {problems.strips && <span className="text-[11px] text-red-600 font-medium">{problems.strips}</span>}
          </label>
        </div>
        <NodePagePanel node={node} nodes={nodes} />
      </Block>

      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={() => void onSave()} disabled={!dirty || update.isPending || hasProblems} className="btn-primary flex items-center gap-2 disabled:opacity-50" data-testid="pages-save">
          {update.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} حفظ
        </button>
        <button type="button" onClick={() => setForm(formFromNode(node))} disabled={!dirty || update.isPending} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1.5" data-testid="pages-reset">
          <Undo2 size={14} /> تراجع
        </button>
        {dirty && <span className="text-xs text-amber-700 font-semibold" data-testid="pages-dirty">فيه تعديلات مش محفوظة (شايفها في المعاينة)</span>}
      </div>
    </div>
  ) : (
    <p className="text-sm text-gray-500 bg-white rounded-2xl shadow-sm px-4 py-8 text-center" data-testid="pages-empty">اختار صفحة من فوق عشان تضيف فيديو أو صورة وكلام تعريفي.</p>
  );

  return (
    <div className="space-y-5 xl:space-y-0 xl:grid xl:grid-cols-[minmax(0,1fr)_520px] xl:gap-5 xl:items-start" data-testid="pages-tab">
      <PreviewDock>
        <PreviewShell
          testId="pages-live-preview"
          title="معاينة حية"
          hint="صفحة القسم الحقيقية بالفيديو أو الصورة والكلام وتنسيقه اللي بتعدّله (قبل الحفظ)."
          controls={<Pills<'mobile' | 'desktop'> label="حجم الشاشة" value={device} onChange={setDevice} options={[{ key: 'desktop', label: 'كمبيوتر', testId: 'pages-device-desktop' }, { key: 'mobile', label: 'موبايل', testId: 'pages-device-mobile' }]} />}
        >
          {message && node ? (
            <LiveFrame
              key={`pages-${device}-${node.id}`}
              testId="pages-frame"
              title={`معاينة صفحة ${node.name_ar}`}
              src={sitePreviewUrl(node.type === 'series' ? `/books?series=${node.id}` : `/books?node=${node.id}`)}
              origin={siteOrigin}
              readyType={SITE_PREVIEW_READY}
              message={message}
              phone={device === 'mobile'}
              {...SIZE[device]}
            />
          ) : (
            <p className="text-xs text-gray-400 text-center py-16">اختار صفحة وهتظهر هنا.</p>
          )}
        </PreviewShell>
      </PreviewDock>
      <div className="xl:col-start-1 xl:row-start-1 min-w-0 space-y-4">
        {picker}
        {editor}
      </div>
    </div>
  );
}
