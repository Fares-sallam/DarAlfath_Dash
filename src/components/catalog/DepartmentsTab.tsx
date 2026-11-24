import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Loader2, Plus, Save, Search, Trash2, Undo2, X } from 'lucide-react';
import LiveFrame from '@/components/preview/LiveFrame';
import { Pills, PreviewShell } from '@/components/preview/PreviewControls';
import PreviewDock from '@/components/preview/PreviewDock';
import { useCatalogCounts, useCatalogNodes } from '@/hooks/useCatalog';
import { useSaveStoreDepartments, useStoreDepartments } from '@/hooks/useStoreDepartments';
import { NODE_TYPE_LABELS, buildTree, type CatalogNode, type NodeType } from '@/lib/catalogTree';
import { reorderRelative, stepInList } from '@/lib/dragSort';
import { SITE_PREVIEW_READY, buildDepartmentsMessage, siteOrigin, sitePreviewUrl } from '@/lib/livePreview';
import {
  addableNodes, changedImages, departmentIssueChips, departmentsChanged, type DepartmentsDraft,
} from '@/lib/storeDepartments';
import PicturePicker from './PicturePicker';
import { Grip, gripButtonClass, useDragRows } from './useDragRows';

const TYPE_CHIP: Record<NodeType, string> = {
  section: 'bg-violet-100 text-violet-700',
  series: 'bg-blue-100 text-blue-700',
  category: 'bg-emerald-100 text-emerald-700',
  collection: 'bg-amber-100 text-amber-700',
};

const NO_IMAGES: Record<string, string | null> = {};
const SIZE = { mobile: { width: 390, height: 560 }, desktop: { width: 1100, height: 520 } } as const;

/**
 * «أقسام المتجر»: the cards in the strip under the home page's banner. Pick them from what already exists (sections, series,
 * categories), put them in order, give each its picture, and see the real strip with the unsaved changes before saving.
 */
export default function DepartmentsTab() {
  const { data: nodes = [], isLoading: loadingNodes } = useCatalogNodes();
  const { data: counts } = useCatalogCounts();
  const { data: saved = [], isLoading: loadingCards } = useStoreDepartments();
  const save = useSaveStoreDepartments();

  const [draft, setDraft] = useState<DepartmentsDraft | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [device, setDevice] = useState<'mobile' | 'desktop'>('desktop');

  const ids = draft?.ids ?? saved;
  const images = draft?.images ?? NO_IMAGES;
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const ordered = useMemo(() => buildTree(nodes, 'web', new Set(nodes.map((n) => n.id))).map((r) => r.node), [nodes]);
  const dirty = departmentsChanged(saved, nodes, draft);
  const candidates = useMemo(() => addableNodes(ordered, ids, query), [ordered, ids, query]);

  const edit = (next: Partial<DepartmentsDraft>) => setDraft({ ids: draft?.ids ?? saved, images: draft?.images ?? {}, ...next });
  const imageOf = (node: CatalogNode): string | null => (node.id in images ? images[node.id] : node.image_url);

  const dnd = useDragRows({
    onDrop: (dragId, targetId, zone) => {
      const next = reorderRelative(ids, dragId, targetId, zone === 'after' ? 'after' : 'before');
      if (next) edit({ ids: next });
    },
  });
  const step = (id: string, dir: -1 | 1) => {
    const next = stepInList(ids, id, dir);
    if (next) edit({ ids: next });
  };

  const onSave = () => {
    if (!draft) return;
    save.mutate({ ids: draft.ids, images: changedImages(nodes, draft) }, { onSuccess: () => setDraft(null) });
  };

  const message = useMemo(() => buildDepartmentsMessage({ ids, images }), [ids, images]);
  const loading = loadingNodes || loadingCards;

  const list = (
    <div className="space-y-4 min-w-0">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-xs text-gray-500 max-w-xl leading-relaxed">
          كل كارت بيفتح صفحة العنصر بتاعه، وصورته هي صورة العنصر نفسه (بتظهر في التطبيق كمان). اللي بتضيفه هو عنصر موجود بالفعل، مش بيتعمل جديد، وشيله من هنا مش بيحذفه.
          عنوان الشريط وإخفاؤه ومكانه بين رفوف الرئيسية من <Link to="/catalog?tab=home" className="text-blue-600 hover:underline font-semibold">«الصفحة الرئيسية»</Link>.
        </p>
        <button type="button" onClick={() => setAdding((v) => !v)} className="btn-primary flex items-center gap-2" data-testid="dept-add" aria-expanded={adding}>
          <Plus size={16} /> إضافة
        </button>
      </div>

      {adding && (
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-3 space-y-2" data-testid="dept-add-panel">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث في الأقسام والسلاسل والتصنيفات..." className="input-field pr-9 text-sm py-2 h-auto" data-testid="dept-add-search" />
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
            <button type="button" onClick={() => { setAdding(false); setQuery(''); }} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="إغلاق"><X size={16} /></button>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-gray-50 rounded-xl border border-gray-100">
            {candidates.length === 0 && <p className="text-sm text-gray-400 text-center py-6">مفيش عناصر تانية تتضاف.</p>}
            {candidates.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => edit({ ids: [...ids, node.id] })}
                className="w-full flex items-center gap-2 px-3 py-2 text-right hover:bg-blue-50/50"
                data-testid="dept-add-item"
                data-node-id={node.id}
              >
                <Plus size={14} className="text-emerald-600 flex-shrink-0" />
                <span className="text-sm font-semibold text-gray-800 flex-1 truncate">{node.name_ar}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${TYPE_CHIP[node.type]}`}>{NODE_TYPE_LABELS[node.type]}</span>
                <span className="text-[11px] text-gray-400 tabular-nums">{counts?.get(node.id)?.total ?? 0} كتاب</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-50" data-testid="dept-list">
        {loading && <div className="flex items-center justify-center gap-2 py-10 text-gray-400"><Loader2 size={18} className="animate-spin" /> جارٍ التحميل...</div>}
        {!loading && ids.length === 0 && <p className="text-center text-gray-400 py-10 text-sm">مفيش كروت. الشريط مش هيظهر في الرئيسية لحد ما تضيف. اضغط «إضافة».</p>}
        {!loading && ids.map((id, index) => {
          const node = byId.get(id);
          const chips = departmentIssueChips(node, counts?.get(id));
          return (
            <div key={id} className={`flex items-center gap-3 px-3 py-2.5 ${dnd.rowClass(id)}`} data-testid="dept-row" data-node-id={id} {...dnd.rowProps(id)}>
              <button type="button" className={gripButtonClass} data-testid="drag-handle" {...dnd.handleProps(id, node?.name_ar ?? 'كارت', (dir) => step(id, dir))}><Grip /></button>
              <span className="w-5 text-center text-xs font-bold text-blue-700">{index + 1}</span>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-gray-800 truncate">{node?.name_ar ?? 'عنصر محذوف'}</p>
                  {node && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${TYPE_CHIP[node.type]}`}>{NODE_TYPE_LABELS[node.type]}</span>}
                  {chips.map((chip) => (
                    <span key={chip.key} className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 flex items-center gap-1" data-testid="dept-issue" data-channel={chip.key} title={chip.title}>
                      <AlertTriangle size={11} /> {chip.label}
                    </span>
                  ))}
                </div>
                {node && <PicturePicker value={imageOf(node)} onChange={(url) => edit({ images: { ...images, [node.id]: url } })} testId="dept-picture" />}
              </div>
              <button type="button" onClick={() => edit({ ids: ids.filter((x) => x !== id) })} className="p-2 rounded-xl hover:bg-red-50 text-red-500" title="شيل من الشريط (العنصر نفسه مش بيتحذف)" aria-label={`شيل ${node?.name_ar ?? 'الكارت'} من الشريط`} data-testid="dept-remove">
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 flex-wrap" data-testid="dept-actions">
        <button type="button" onClick={onSave} disabled={!dirty || save.isPending} className="btn-primary flex items-center gap-2 disabled:opacity-50" data-testid="dept-save">
          {save.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} حفظ
        </button>
        <button type="button" onClick={() => { setDraft(null); setAdding(false); }} disabled={!draft || save.isPending} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1.5" data-testid="dept-reset">
          <Undo2 size={14} /> تراجع
        </button>
        {dirty && <span className="text-xs text-amber-700 font-semibold" data-testid="dept-dirty">فيه تعديلات مش محفوظة (شايفها في المعاينة)</span>}
      </div>
    </div>
  );

  return (
    <div className="space-y-5 xl:space-y-0 xl:grid xl:grid-cols-[minmax(0,1fr)_520px] xl:gap-5 xl:items-start" data-testid="departments-tab">
      <PreviewDock>
        <PreviewShell
          testId="dept-live-preview"
          title="معاينة حية"
          hint="الرئيسية الحقيقية على آخر الكروت اللي بتعدّلها (قبل الحفظ)."
          controls={<Pills<'mobile' | 'desktop'> label="حجم الشاشة" value={device} onChange={setDevice} options={[{ key: 'desktop', label: 'كمبيوتر', testId: 'dept-device-desktop' }, { key: 'mobile', label: 'موبايل', testId: 'dept-device-mobile' }]} />}
        >
          <LiveFrame
            key={`dept-${device}`}
            testId="dept-frame"
            title="معاينة أقسام المتجر"
            src={sitePreviewUrl('/')}
            origin={siteOrigin}
            readyType={SITE_PREVIEW_READY}
            message={message}
            phone={device === 'mobile'}
            {...SIZE[device]}
          />
        </PreviewShell>
      </PreviewDock>
      <div className="xl:col-start-1 xl:row-start-1 min-w-0">{list}</div>
    </div>
  );
}
