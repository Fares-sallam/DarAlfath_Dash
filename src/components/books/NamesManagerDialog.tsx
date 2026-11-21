import { useMemo, useState } from 'react';
import { ArrowRightLeft, Check, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import {
  useDeleteName, useListName, useMergeNames, useNameUsage, useRenameName,
  type NameKind, type NameUsageRow,
} from '@/hooks/useNameLists';
import { cleanName } from '@/lib/nameLists';

const KINDS: { key: NameKind; label: string; noun: string; empty: string }[] = [
  { key: 'author', label: 'المؤلفون', noun: 'مؤلف', empty: 'مفيش مؤلفين.' },
  { key: 'publisher', label: 'الناشرون', noun: 'ناشر', empty: 'مفيش ناشرين لسه. أضف أول واحد من فوق، أو من نموذج الكتاب.' },
];

/**
 * The authors' and publishers' lists the book form chooses from: how many books each name has, a name changed for all its
 * books at once, two names merged, a name nobody uses removed, and the names found on books that are not in the list yet.
 */
export default function NamesManagerDialog({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<NameKind>('author');
  const info = KINDS.find((k) => k.key === kind)!;
  const { data: rows = [], isLoading, isError } = useNameUsage(kind);
  const add = useListName(kind);
  const rename = useRenameName(kind);
  const merge = useMergeNames(kind);
  const remove = useDeleteName(kind);

  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  /** the row being renamed, or merged: by id (or by name for an unlisted row, which can only be added) */
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [merging, setMerging] = useState<string | null>(null);
  const [mergeInto, setMergeInto] = useState('');

  const listed = rows.filter((r) => r.listed);
  const shown = useMemo(() => {
    const q = cleanName(query).toLowerCase();
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  }, [rows, query]);
  const busy = add.isPending || rename.isPending || merge.isPending || remove.isPending;

  const switchKind = (next: NameKind) => { setKind(next); setQuery(''); setRenaming(null); setMerging(null); setDraft(''); };

  const submitAdd = async () => {
    if (!cleanName(draft)) return;
    try { await add.mutateAsync(draft); setDraft(''); } catch { /* shown */ }
  };
  const submitRename = async (row: NameUsageRow) => {
    const next = cleanName(renameText);
    if (!row.id || !next || next === row.name) { setRenaming(null); return; }
    if (row.books > 0 && !window.confirm(`تغيير «${row.name}» إلى «${next}» هيتطبّق على ${row.books} كتاب. تكمل؟`)) return;
    try { await rename.mutateAsync({ id: row.id, name: next }); setRenaming(null); } catch { /* shown */ }
  };
  const submitMerge = async (row: NameUsageRow) => {
    const target = listed.find((r) => r.id === mergeInto);
    if (!row.id || !target?.id) return;
    if (!window.confirm(`نقل ${row.books} كتاب من «${row.name}» إلى «${target.name}»، وحذف «${row.name}» من القايمة؟`)) return;
    try { await merge.mutateAsync({ from: row.id, into: target.id }); setMerging(null); setMergeInto(''); } catch { /* shown */ }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true" aria-label="المؤلفون والناشرون" data-testid="names-manager" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3">
          <div>
            <h2 className="text-lg font-bold text-gray-800">المؤلفون والناشرون</h2>
            <p className="text-xs text-gray-400 mt-0.5">القوايم اللي بتختار منها في نموذج الكتاب. أي اسم مكتوب بشكل تاني لاسم هنا بيتحفظ بشكل القايمة تلقائيًا.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500" aria-label="إغلاق"><X size={18} /></button>
        </div>

        <div className="px-6 flex items-center gap-2 border-b border-gray-100" role="tablist">
          {KINDS.map((k) => (
            <button
              key={k.key} type="button" role="tab" aria-selected={kind === k.key} onClick={() => switchKind(k.key)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${kind === k.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              data-testid={`names-tab-${k.key}`}
            >{k.label}</button>
          ))}
        </div>

        <div className="px-6 py-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث في الأسماء…" className="input-field pr-9" aria-label="بحث" data-testid="names-search" />
          </div>
          <div className="flex items-center gap-2 flex-1">
            <input
              value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={160}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submitAdd(); } }}
              placeholder={`اسم ${info.noun} جديد`} className="input-field flex-1 min-w-0" aria-label={`اسم ${info.noun} جديد`} data-testid="names-new"
            />
            <button type="button" onClick={() => void submitAdd()} disabled={busy || !cleanName(draft)} className="btn-primary flex items-center gap-1.5 disabled:opacity-40 whitespace-nowrap" data-testid="names-add">
              <Plus size={14} /> إضافة
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-5">
          {isLoading ? (
            <div className="py-12 flex justify-center text-gray-400"><Loader2 className="animate-spin" /></div>
          ) : isError ? (
            <p className="py-10 text-center text-sm text-red-500">تعذّر تحميل القايمة.</p>
          ) : shown.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400" data-testid="names-empty">{query ? 'مفيش نتيجة.' : info.empty}</p>
          ) : (
            <ul className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden" data-testid="names-list">
              {shown.map((row) => {
                const key = row.id ?? `unlisted:${row.name}`;
                const isRenaming = renaming === key;
                const isMerging = merging === key;
                return (
                  <li key={key} className={`px-4 py-3 ${row.listed ? '' : 'bg-amber-50/60'}`} data-testid="names-row" data-listed={row.listed}>
                    <div className="flex items-center gap-3 flex-wrap">
                      {isRenaming ? (
                        <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                          <input
                            value={renameText} onChange={(e) => setRenameText(e.target.value)} autoFocus maxLength={160} className="input-field flex-1 min-w-0"
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submitRename(row); } if (e.key === 'Escape') setRenaming(null); }}
                            aria-label={`الاسم الجديد لـ ${row.name}`} data-testid="names-rename-input"
                          />
                          <button type="button" onClick={() => void submitRename(row)} disabled={busy} className="p-2 rounded-lg bg-blue-600 text-white disabled:opacity-50" aria-label="حفظ الاسم" data-testid="names-rename-save"><Check size={14} /></button>
                          <button type="button" onClick={() => setRenaming(null)} className="p-2 rounded-lg border border-gray-200 text-gray-500" aria-label="إلغاء"><X size={14} /></button>
                        </div>
                      ) : (
                        <div className="flex-1 min-w-[160px]">
                          <p className="text-sm font-semibold text-gray-800">{row.name}</p>
                          {!row.listed && <p className="text-xs text-amber-700">مكتوب على كتب ومش في القايمة</p>}
                        </div>
                      )}
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg ${row.books > 0 ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'}`} data-testid="names-books">{row.books} كتاب</span>
                      {!isRenaming && (
                        row.listed ? (
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => { setRenaming(key); setRenameText(row.name); setMerging(null); }} className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-600" title="تغيير الاسم" aria-label={`تغيير اسم ${row.name}`}><Pencil size={14} /></button>
                            <button type="button" onClick={() => { setMerging(isMerging ? null : key); setMergeInto(''); setRenaming(null); }} disabled={listed.length < 2} className="p-1.5 rounded-lg hover:bg-violet-100 text-violet-600 disabled:opacity-30" title="دمج في اسم تاني" aria-label={`دمج ${row.name} في اسم تاني`}><ArrowRightLeft size={14} /></button>
                            <button
                              type="button" disabled={busy || row.books > 0}
                              onClick={() => { if (row.id && window.confirm(`حذف «${row.name}» من القايمة؟`)) remove.mutate(row.id); }}
                              className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 disabled:opacity-30"
                              title={row.books > 0 ? 'عليه كتب: ادمجه في اسم تاني الأول' : 'حذف من القايمة'} aria-label={`حذف ${row.name}`}
                            ><Trash2 size={14} /></button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => add.mutate(row.name)} disabled={busy} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50" data-testid="names-list-it">إضافة للقايمة</button>
                        )
                      )}
                    </div>
                    {isMerging && (
                      <div className="mt-3 flex items-center gap-2 flex-wrap" data-testid="names-merge">
                        <span className="text-sm text-gray-600">انقل كتبه إلى:</span>
                        <select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} className="input-field max-w-[260px]" aria-label="الاسم اللي هيتدمج فيه" data-testid="names-merge-into">
                          <option value="">— اختار —</option>
                          {listed.filter((r) => r.id !== row.id).map((r) => <option key={r.id} value={r.id!}>{r.name}</option>)}
                        </select>
                        <button type="button" onClick={() => void submitMerge(row)} disabled={busy || !mergeInto} className="btn-primary disabled:opacity-40" data-testid="names-merge-go">دمج</button>
                        <button type="button" onClick={() => setMerging(null)} className="btn-secondary">إلغاء</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
