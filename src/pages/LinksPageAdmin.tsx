import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, Check, Copy, ExternalLink, Link2, Loader2, Save, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/layout/Layout';
import BlocksPanel from '@/components/links/admin/BlocksPanel';
import PreviewPhone from '@/components/links/admin/PreviewPhone';
import SettingsPanel from '@/components/links/admin/SettingsPanel';
import { useLinksPageAdmin, useSaveLinksPage } from '@/hooks/useLinksPageAdmin';
import { STOREFRONT_URL } from '@/lib/storefront';
import {
  DEFAULT_LINKS_SETTINGS, blockToRow, validateBlock, type LinksBlock, type LinksPageSettings,
} from '@/lib/linksPage';

const PAGE_URL = `${STOREFRONT_URL}/links`;

/** What the saved page and the page on screen are compared by (a block is compared as it would be saved). */
const signature = (settings: LinksPageSettings, blocks: LinksBlock[]) =>
  JSON.stringify([settings, blocks.map((b, i) => blockToRow(b, i))]);

const TABS = [
  { key: 'blocks', label: 'عناصر الصفحة' },
  { key: 'settings', label: 'إعدادات الصفحة' },
] as const;

/**
 * إدارة الصفحة والروابط: the company links page the store shows at /links. Everything is edited here
 * (the blocks, their order, the dividers, the page's look) and saved together; the preview beside it
 * is drawn by the same code the store uses, from what is on screen, saved or not.
 */
export default function LinksPageAdmin() {
  const { data, isLoading, isError, error } = useLinksPageAdmin();
  const save = useSaveLinksPage();

  const [settings, setSettings] = useState<LinksPageSettings>(DEFAULT_LINKS_SETTINGS);
  const [blocks, setBlocks] = useState<LinksBlock[]>([]);
  const [ready, setReady] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('blocks');
  const [copied, setCopied] = useState(false);

  const savedSig = useMemo(() => (data ? signature(data.settings, data.blocks) : ''), [data]);
  const dirty = ready && signature(settings, blocks) !== savedSig;

  // The saved page fills the editor when it first arrives, and again after a save; never over unsaved edits.
  const dirtyNow = useRef(false);
  dirtyNow.current = dirty;
  useEffect(() => {
    if (!data) return;
    if (!ready || !dirtyNow.current) {
      setSettings(data.settings);
      setBlocks(data.blocks);
      setReady(true);
    }
  }, [data, ready]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const invalid = useMemo(() => blocks.filter((b) => validateBlock(b).length > 0), [blocks]);

  const onSave = () => {
    if (!data || invalid.length > 0) return;
    const rows = (list: LinksBlock[]) => JSON.stringify(list.map((b, i) => blockToRow(b, i)));
    save.mutate({
      // an edit to the page's settings alone leaves the blocks as they are
      blocks: rows(blocks) === rows(data.blocks) ? [] : blocks,
      settings,
      settingsChanged: JSON.stringify(settings) !== JSON.stringify(data.settings),
      removedIds: data.blocks.filter((b) => !blocks.some((x) => x.id === b.id)).map((b) => b.id),
    });
  };

  const discard = () => {
    if (!data) return;
    setSettings(data.settings);
    setBlocks(data.blocks);
    setOpenId(null);
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(PAGE_URL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('تعذّر النسخ، انسخ الرابط يدويًا');
    }
  };

  const showFirstProblem = () => {
    const first = invalid[0];
    if (!first) return;
    setTab('blocks');
    setOpenId(first.id);
    window.setTimeout(() => document.getElementById(`links-block-${first.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  };

  return (
    <Layout>
      <div className="space-y-5 pb-28">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Link2 className="text-amber-500" size={24} />
              إدارة الصفحة والروابط
            </h1>
            <p className="text-sm text-gray-500 mt-1">صفحة واحدة فيها كل حاجة عن الدار: المتجر والتطبيق والسوشيال والعروض. التغييرات بتظهر في الموقع أول ما تحفظ.</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span dir="ltr" className="hidden md:inline-block max-w-[260px] truncate px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs text-gray-500" title={PAGE_URL}>
              {PAGE_URL.replace(/^https?:\/\//, '')}
            </span>
            <button type="button" onClick={copyUrl} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50">
              {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
              {copied ? 'تم النسخ' : 'نسخ رابط الصفحة'}
            </button>
            <a href={PAGE_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700">
              <ExternalLink size={14} /> فتح الصفحة
            </a>
            {/* beside the editor on a wide screen; below it on a phone, so a button goes there */}
            <button
              type="button"
              onClick={() => document.getElementById('links-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="xl:hidden flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              <ArrowDown size={14} /> المعاينة
            </button>
          </div>
        </div>

        {isLoading && (
          <div className="py-24 flex justify-center text-gray-400"><Loader2 className="animate-spin" /></div>
        )}

        {isError && (
          <div className="bg-white rounded-2xl border border-red-100 p-6 space-y-2" role="alert">
            <p className="text-sm font-bold text-red-600">تعذّر تحميل الصفحة</p>
            <p className="text-sm text-gray-600">{error instanceof Error ? error.message : 'خطأ غير معروف'}</p>
            <p className="text-xs text-gray-400">لو الرسالة بتقول إن الجدول مش موجود، يبقى تحديث قاعدة البيانات الخاص بالصفحة لسه ما اتطبقش.</p>
          </div>
        )}

        {ready && (
          <div className="xl:flex xl:items-start xl:gap-6">
            <section className="min-w-0 flex-1 space-y-4 xl:ml-[424px]">
              <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="أقسام الصفحة">
                {TABS.map((t) => {
                  const on = t.key === tab;
                  return (
                    <button
                      key={t.key}
                      role="tab"
                      aria-selected={on}
                      onClick={() => setTab(t.key)}
                      data-testid={`links-tab-${t.key}`}
                      className={`px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap border transition-colors ${
                        on ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {t.label}
                      {t.key === 'blocks' && <span className={`mr-2 text-[11px] ${on ? 'text-indigo-200' : 'text-gray-400'}`}>{blocks.length}</span>}
                    </button>
                  );
                })}
              </div>

              <div role="tabpanel" aria-label={TABS.find((t) => t.key === tab)?.label}>
                {tab === 'blocks' ? (
                  <BlocksPanel blocks={blocks} setBlocks={setBlocks} openId={openId} setOpenId={setOpenId} />
                ) : (
                  <SettingsPanel settings={settings} onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))} />
                )}
              </div>
            </section>

            {/* On a wide screen the preview stays on the left, in view while a block far down the list is edited. */}
            <aside className="mt-8 xl:mt-0 xl:fixed xl:left-6 xl:top-24 xl:w-[400px] xl:z-20">
              <PreviewPhone settings={settings} blocks={blocks} />
            </aside>
          </div>
        )}
      </div>

      {dirty && (
        <div className="fixed bottom-4 inset-x-0 z-40 flex justify-center pointer-events-none px-4 lg:pr-72">
          <div className="pointer-events-auto flex items-center gap-3 flex-wrap justify-center rounded-2xl bg-gray-900 text-white shadow-2xl px-4 py-3" role="status" data-testid="links-save-bar">
            {invalid.length > 0 ? (
              <button type="button" onClick={showFirstProblem} className="flex items-center gap-1.5 text-sm text-amber-300 hover:text-amber-200">
                <AlertTriangle size={15} /> {invalid.length} عنصر محتاج تكملة قبل الحفظ، اضغط تشوفه
              </button>
            ) : (
              <span className="text-sm">فيه تغييرات لسه ما اتحفظتش</span>
            )}
            <button type="button" onClick={discard} disabled={save.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-300 hover:bg-white/10 disabled:opacity-40">
              <Undo2 size={14} /> تراجع
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={invalid.length > 0 || save.isPending}
              data-testid="links-save"
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-500 text-sm font-semibold hover:bg-indigo-400 disabled:opacity-40 disabled:hover:bg-indigo-500"
            >
              {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              حفظ
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}
