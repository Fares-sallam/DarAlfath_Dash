import { useMemo, useState } from 'react';
import { ArrowLeftRight, GitMerge, Loader2, Search, X } from 'lucide-react';
import { useCatalogCounts, useCatalogLinks, useMergeNodes, useUnionNodes } from '@/hooks/useCatalog';
import { useMenuItems } from '@/hooks/useMenuItems';
import { useStoreDepartments } from '@/hooks/useStoreDepartments';
import { NODE_TYPE_LABELS, type CatalogNode } from '@/lib/catalogTree';
import { canUnion, mergePreview, mergeTargets, unionName, unionPreview, type MergeMode } from '@/lib/catalogMerge';

const TYPE_CHIP: Record<CatalogNode['type'], string> = {
  section: 'bg-violet-100 text-violet-700',
  series: 'bg-blue-100 text-blue-700',
  category: 'bg-emerald-100 text-emerald-700',
  collection: 'bg-amber-100 text-amber-700',
};

/**
 * «دمج»: put one item (a category, series or section) into another. Pick the other one, see exactly what will move, choose which
 * name stays, then confirm. The item that goes away is deleted; its books and what is under it end up in the other one.
 */
export default function MergeDialog({ item, nodes, onClose }: { item: CatalogNode; nodes: CatalogNode[]; onClose: () => void }) {
  const { data: counts } = useCatalogCounts();
  const { data: links = [] } = useCatalogLinks();
  const { data: menuItems = [] } = useMenuItems();
  const { data: departmentIds = [] } = useStoreDepartments();
  const merge = useMergeNodes();
  const union = useUnionNodes();

  const [mode, setMode] = useState<MergeMode>('merge');
  const [newName, setNewName] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [otherId, setOtherId] = useState<string | null>(null);
  // which of the two stays: the one picked (default) or the one the dialog was opened on
  const [keepOpened, setKeepOpened] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mergeTargets(nodes, item).filter((n) => !q || `${n.name_ar} ${n.name_en ?? ''}`.toLowerCase().includes(q));
  }, [nodes, item, query]);

  const other = nodes.find((n) => n.id === otherId) ?? null;
  const survivor = other ? (keepOpened ? item : other) : null;
  const vanishing = other ? (keepOpened ? other : item) : null;
  const finalName = name ?? survivor?.name_ar ?? '';
  const preview = survivor && vanishing ? mergePreview(vanishing, survivor, nodes, links, menuItems, departmentIds) : null;
  // without deleting: a new item made from the two (the opened one first), named «A وB» unless typed
  const unionAllowed = canUnion(item);
  const unionMode = mode === 'union' && unionAllowed;
  const unionFinalName = newName ?? (other ? unionName(item, other) : '');
  const unionInfo = other ? unionPreview(item, other, links) : null;

  const pick = (id: string) => {
    setOtherId(id);
    setKeepOpened(false);
    setName(null);
    setNewName(null);
    setConfirming(false);
  };
  const swap = () => {
    setKeepOpened((v) => !v);
    setName(null);
    setConfirming(false);
  };
  const chooseMode = (next: MergeMode) => {
    setMode(next);
    setConfirming(false);
  };

  const submit = () => {
    if (unionMode) {
      if (!other || !unionFinalName.trim()) return;
      union.mutate({ aId: item.id, bId: other.id, name: unionFinalName.trim() }, { onSuccess: onClose });
      return;
    }
    if (!survivor || !vanishing) return;
    merge.mutate(
      { sourceId: vanishing.id, targetId: survivor.id, newName: finalName.trim() && finalName.trim() !== survivor.name_ar ? finalName.trim() : undefined },
      { onSuccess: onClose },
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto" dir="rtl" data-testid="merge-dialog">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2"><GitMerge size={18} className="text-blue-600" /> دمج «{item.name_ar}» مع عنصر تاني</h2>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">كتب العنصرين وكل اللي تحتهم بيتجمعوا في عنصر واحد، والتاني بيتحذف. روابطه القديمة بتفتح العنصر اللي فضل.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="إغلاق"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <p className="text-sm font-bold text-gray-700 mb-2">ادمجه مع مين؟</p>
            <div className="relative mb-2">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم..." className="input-field pr-9 text-sm py-2 h-auto" data-testid="merge-search" />
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
            <div className="max-h-52 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50" role="radiogroup" aria-label="الدمج مع">
              {candidates.length === 0 && <p className="text-sm text-gray-400 text-center py-6">مفيش عناصر من نفس النوع تتدمج معاها.</p>}
              {candidates.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  role="radio"
                  aria-checked={n.id === otherId}
                  onClick={() => pick(n.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-right hover:bg-blue-50/60 ${n.id === otherId ? 'bg-blue-50' : ''}`}
                  data-testid="merge-candidate"
                  data-node-id={n.id}
                >
                  <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${n.id === otherId ? 'border-blue-600 bg-blue-600' : 'border-gray-300'}`} />
                  <span className="text-sm font-semibold text-gray-800 flex-1 truncate">{n.name_ar}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${TYPE_CHIP[n.type]}`}>{NODE_TYPE_LABELS[n.type]}</span>
                  <span className="text-[11px] text-gray-400 tabular-nums">{counts?.get(n.id)?.total ?? 0} كتاب</span>
                </button>
              ))}
            </div>
          </div>

          {other && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="نوع الدمج" data-testid="merge-modes">
              <button
                type="button"
                role="radio"
                aria-checked={!unionMode}
                onClick={() => chooseMode('merge')}
                className={`text-right rounded-xl border-2 px-3 py-2 ${!unionMode ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                data-testid="merge-mode-merge"
              >
                <p className="text-sm font-bold text-gray-800">دمج وحذف</p>
                <p className="text-[11px] text-gray-500 leading-relaxed">واحد منهم بيختفي جوه التاني، وكتبه وكل اللي تحته بيروحوا للي فضل.</p>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={unionMode}
                disabled={!unionAllowed}
                onClick={() => chooseMode('union')}
                className={`text-right rounded-xl border-2 px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed ${unionMode ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:bg-gray-50'}`}
                data-testid="merge-mode-union"
              >
                <p className="text-sm font-bold text-gray-800">دمج بدون حذف</p>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  {unionAllowed ? 'بيتعمل عنصر جديد باسم تختاره (زي «التربوي والحساب») فيه كتب الاتنين، والاتنين فاضلين زي ما هم.' : 'الأقسام ما ينفعش تتجمع من غير حذف.'}
                </p>
              </button>
            </div>
          )}

          {unionMode && other && unionInfo && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 space-y-3" data-testid="union-preview">
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold">«{item.name_ar}» هيفضل</span>
                <span className="text-gray-400">+</span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold">«{other.name_ar}» هيفضل</span>
                <span className="text-gray-400">←</span>
                <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 font-bold" data-testid="union-new">{item.type === 'series' ? 'سلسلة' : item.type === 'collection' && other.type === 'collection' ? 'مجموعة' : 'تصنيف'} جديد</span>
              </div>

              <ul className="text-sm text-gray-700 space-y-1 list-disc pr-5" data-testid="union-effects">
                <li>هيتعمل عنصر جديد باسم «{unionFinalName}» فيه {unionInfo.books} كتاب (كتب «{item.name_ar}» و«{other.name_ar}»).</li>
                {unionInfo.shared > 0 && <li>{unionInfo.shared} كتاب موجود في الاتنين، هيظهر مرة واحدة في الجديد.</li>}
                <li>«{item.name_ar}» و«{other.name_ar}» مش هيتحذفوا ولا يتغيروا، وكتبهم بتفضل فيهم.</li>
                <li>تصنيف الكتب الأساسي مش هيتغير: الكتب بتظهر في العنصر الجديد كمان.</li>
                <li>بيتحط في نفس مكان الاتنين لو هما في نفس المكان، وإلا في الأعلى. وتقدر تنقله بعدين.</li>
              </ul>

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1" htmlFor="union-name">اسم العنصر الجديد</label>
                <input id="union-name" value={unionFinalName} onChange={(e) => setNewName(e.target.value)} className="input-field text-sm py-2 h-auto w-full" data-testid="union-name" />
              </div>
            </div>
          )}

          {!unionMode && survivor && vanishing && preview && (
            <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4 space-y-3" data-testid="merge-preview">
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className="px-2.5 py-1 rounded-lg bg-red-100 text-red-700 font-bold" data-testid="merge-vanishing">«{vanishing.name_ar}» هيتحذف</span>
                <span className="text-gray-400">←</span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold" data-testid="merge-survivor">«{survivor.name_ar}» هيفضل</span>
                <button type="button" onClick={swap} className="mr-auto text-xs font-semibold text-blue-700 hover:underline flex items-center gap-1" data-testid="merge-swap">
                  <ArrowLeftRight size={12} /> اعكس الاتجاه
                </button>
              </div>

              <ul className="text-sm text-gray-700 space-y-1 list-disc pr-5" data-testid="merge-effects">
                <li>{preview.booksMoved} كتاب هينتقل لـ«{survivor.name_ar}»{preview.primaryMoved > 0 && <> (منهم {preview.primaryMoved} تصنيفه الأساسي «{vanishing.name_ar}»، وهيبقى أساسيه «{survivor.name_ar}»)</>}.</li>
                {preview.booksInBoth > 0 && <li>{preview.booksInBoth} كتاب موجود في الاتنين، هيتحسب مرة واحدة بس (ويبقى أساسي لو كان أساسي في أحدهم).</li>}
                {preview.children > 0 && <li>{preview.children} عنصر تحت «{vanishing.name_ar}» هينتقل تحت «{survivor.name_ar}».</li>}
                {preview.menuItems > 0 && <li>{preview.menuItems} رابط في قايمة الهيدر هيتحوّل لـ«{survivor.name_ar}».</li>}
                {preview.inDepartments && <li>كارت «{vanishing.name_ar}» في «أقسام المتجر» هيتحوّل لـ«{survivor.name_ar}» (أو يتشال لو ليه كارت).</li>}
                <li>أي رابط قديم لـ«{vanishing.name_ar}» هيفتح «{survivor.name_ar}».</li>
              </ul>

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1" htmlFor="merge-name">الاسم بعد الدمج</label>
                <div className="flex items-center gap-2 flex-wrap">
                  <input id="merge-name" value={finalName} onChange={(e) => setName(e.target.value)} className="input-field text-sm py-2 h-auto flex-1 min-w-[12rem]" data-testid="merge-name" />
                  {[survivor, vanishing].map((n) => (
                    <button key={n.id} type="button" onClick={() => setName(n.name_ar)} className="text-xs px-2 py-1 rounded-lg border border-gray-200 hover:bg-white" data-testid="merge-use-name">استخدم «{n.name_ar}»</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {confirming && unionMode && other && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" data-testid="union-confirm-box">
              هيتعمل «{unionFinalName.trim()}» ومفيش حاجة هتتحذف. تقدر تتراجع بعدها بزر «تراجع».
            </div>
          )}
          {confirming && !unionMode && survivor && vanishing && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" data-testid="merge-confirm-box">
              متأكد؟ «{vanishing.name_ar}» هيتحذف. تقدر تتراجع بعدها بزر «تراجع» (من الرسالة أو من «عمليات الدمج الأخيرة»).
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 justify-end p-5 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold hover:bg-gray-50" data-testid="merge-cancel">إلغاء</button>
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={unionMode ? !unionFinalName.trim() : !survivor || !finalName.trim()}
              className="btn-primary flex items-center gap-2 disabled:opacity-50"
              data-testid="merge-go"
            >
              <GitMerge size={15} /> {unionMode ? 'اعمل العنصر الجديد' : 'ادمج'}
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={merge.isPending || union.isPending}
              className={`px-4 py-2 rounded-xl text-white text-sm font-bold disabled:opacity-60 flex items-center gap-2 ${unionMode ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
              data-testid="merge-confirm"
            >
              {merge.isPending || union.isPending ? <Loader2 size={15} className="animate-spin" /> : <GitMerge size={15} />} {unionMode ? 'أيوه، اعمله' : 'أيوه، ادمج'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** The first step when a merge is started from the button above the tree: which item is going to be merged. */
export function MergePickDialog({ nodes, onPick, onClose }: { nodes: CatalogNode[]; onPick: (node: CatalogNode) => void; onClose: () => void }) {
  const { data: counts } = useCatalogCounts();
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return nodes
      .filter((n) => !q || `${n.name_ar} ${n.name_en ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => a.type.localeCompare(b.type) || a.name_ar.localeCompare(b.name_ar, 'ar'));
  }, [nodes, query]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto" dir="rtl" data-testid="merge-pick-dialog">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2"><GitMerge size={18} className="text-blue-600" /> أنهي عنصر عايز تدمجه؟</h2>
            <p className="text-xs text-gray-500 mt-1">اختار أي تصنيف أو سلسلة أو قسم، وفي الخطوة الجاية تختار هتدمجه مع مين.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="إغلاق"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-2">
          <div className="relative">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم..." className="input-field pr-9 text-sm py-2 h-auto" data-testid="merge-pick-search" autoFocus />
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
            {list.length === 0 && <p className="text-sm text-gray-400 text-center py-6">مفيش نتايج.</p>}
            {list.map((n) => (
              <button key={n.id} type="button" onClick={() => onPick(n)} className="w-full flex items-center gap-2 px-3 py-2 text-right hover:bg-blue-50/60" data-testid="merge-pick-item" data-node-id={n.id}>
                <span className="text-sm font-semibold text-gray-800 flex-1 truncate">{n.name_ar}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${TYPE_CHIP[n.type]}`}>{NODE_TYPE_LABELS[n.type]}</span>
                <span className="text-[11px] text-gray-400 tabular-nums">{counts?.get(n.id)?.total ?? 0} كتاب</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
