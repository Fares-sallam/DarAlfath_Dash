import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Loader2, Monitor, Smartphone } from 'lucide-react';
import { useCountries } from '@/hooks/useSettings';
import { fromLocalInput } from '@/lib/homeBlockDraft';
import {
  BOOK_SHELF_KIND, FILTER_SHELF_KIND, FILTER_SOURCES, HIDDEN_REASON_LABELS, PROMO_KIND, BLOCK_META, CUSTOM_META, blockDefaults, blockStatus,
  bookShelfIds, filterSourceOf, lookOf, promoOf, rowsFor, type HomeBlock, type HomeChannel, type HomeLayoutRow,
} from '@/lib/homeBlocks';
import { SHELF_KIND } from '@/lib/homeShelves';
import { STOREFRONT_URL } from '@/lib/storefront';

/** The messages between the dashboard and the website's preview page (the same names on the website's side). */
export const PREVIEW_MESSAGE = 'daralfath:home-preview';
export const PREVIEW_READY = 'daralfath:home-preview-ready';
export const PREVIEW_PATH = '/?preview=home';

const storeOrigin = (() => {
  try { return new URL(STOREFRONT_URL).origin; } catch { return ''; }
})();
const previewUrl = `${STOREFRONT_URL}${PREVIEW_PATH}`;
const DESKTOP_WIDTH = 1280;
const FRAME_HEIGHT = 720;
const READY_WAIT_MS = 9000;

interface Props {
  channel: HomeChannel;
  /** the blocks as they would be if the open form were saved */
  blocks: HomeBlock[];
  /** the rows of the other pages' strips (kept as saved) */
  extraRows: HomeLayoutRow[];
  /** the block the preview scrolls to (the one being edited) */
  focus: string | null;
  /** the names to show for a block in the app's sketch */
  nameOf: (block: HomeBlock) => string;
  /** the website's frame width: a phone's or a computer's (the editor widens the column for a computer) */
  device: 'mobile' | 'desktop';
  onDeviceChange: (device: 'mobile' | 'desktop') => void;
}

/**
 * The home page as the visitors will see it, next to the editor. The website: the real page in a frame (phone or computer
 * width), fed the unsaved rows by message, with the country and the date to look at it «as of» (for blocks with dates).
 * The app: a sketch of the order, the words and the colours (the app itself can't be shown here).
 */
export default function HomePreview({ channel, blocks, extraRows, focus, nameOf, device, onDeviceChange }: Props) {
  const { data: countries = [] } = useCountries();
  const [country, setCountry] = useState('');
  const [at, setAt] = useState('');
  const isApp = channel === 'app';
  const atIso = fromLocalInput(at);

  return (
    <aside className="bg-white rounded-2xl shadow-sm overflow-hidden" data-testid="home-preview" data-channel={channel}>
      <div className="p-4 border-b border-gray-50 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-bold text-gray-800">{isApp ? 'معاينة تقريبية للتطبيق' : 'معاينة الموقع'}</h3>
          {!isApp && (
            <div className="flex rounded-xl bg-gray-100 p-0.5" role="group" aria-label="حجم الشاشة">
              <button type="button" onClick={() => onDeviceChange('mobile')} aria-pressed={device === 'mobile'} data-testid="preview-mobile"
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 ${device === 'mobile' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}><Smartphone size={13} /> موبايل</button>
              <button type="button" onClick={() => onDeviceChange('desktop')} aria-pressed={device === 'desktop'} data-testid="preview-desktop"
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 ${device === 'desktop' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}><Monitor size={13} /> كمبيوتر</button>
            </div>
          )}
        </div>
        <div className={`grid gap-2 ${isApp ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {!isApp && (
            <label className="block">
              <span className="block text-[11px] font-semibold text-gray-500 mb-1">دولة الزائر</span>
              <select value={country} onChange={(e) => setCountry(e.target.value)} className="input-field !py-1.5 text-sm" data-testid="preview-country">
                <option value="">الافتراضية</option>
                {countries.map((c) => <option key={c.id} value={c.code.toUpperCase()}>{c.name}</option>)}
              </select>
            </label>
          )}
          <label className="block">
            <span className="block text-[11px] font-semibold text-gray-500 mb-1">شوفها بتاريخ</span>
            <div className="flex gap-1">
              <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="input-field !py-1.5 text-sm flex-1 min-w-0" data-testid="preview-at" />
              {at && <button type="button" onClick={() => setAt('')} className="btn-secondary !px-2 text-xs" data-testid="preview-now">دلوقتي</button>}
            </div>
          </label>
        </div>
      </div>
      {isApp
        ? <AppSketch blocks={blocks} at={atIso} nameOf={nameOf} />
        : <WebFrame device={device} blocks={blocks} extraRows={extraRows} focus={focus} country={country} at={atIso} />}
    </aside>
  );
}

// ─── The website: the real page in a frame ────────────────────────────────────────────────────────────────────────────────

function WebFrame({ device, blocks, extraRows, focus, country, at }: { device: 'mobile' | 'desktop'; blocks: HomeBlock[]; extraRows: HomeLayoutRow[]; focus: string | null; country: string; at: string | null }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const popupRef = useRef<Window | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [ticks, setTicks] = useState(0);
  const [failed, setFailed] = useState(false);
  const [boxWidth, setBoxWidth] = useState(0);
  const rows = useMemo(() => [...rowsFor(blocks), ...extraRows], [blocks, extraRows]);

  // the page says it is ready (again after every reload of the frame or of a separate window)
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== storeOrigin) return;
      if (event.data && typeof event.data === 'object' && (event.data as { type?: string }).type === PREVIEW_READY) {
        setFailed(false);
        setTicks((n) => n + 1);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  useEffect(() => {
    if (ticks > 0) return undefined;
    const id = window.setTimeout(() => setFailed(true), READY_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [ticks]);

  // the rows (and the country, the date, where to scroll) are sent whenever any of them changes
  useEffect(() => {
    if (ticks === 0) return undefined;
    const id = window.setTimeout(() => {
      const message = { type: PREVIEW_MESSAGE, rows, now: at, country: country || null, scrollTo: focus };
      const windows = [frameRef.current?.contentWindow, popupRef.current && !popupRef.current.closed ? popupRef.current : null];
      for (const target of windows) target?.postMessage(message, storeOrigin);
    }, 200);
    return () => window.clearTimeout(id);
  }, [ticks, rows, at, country, focus]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width));
    observer.observe(el);
    setBoxWidth(el.clientWidth);
    return () => observer.disconnect();
  }, [device]);

  const openWindow = useCallback(() => {
    popupRef.current = window.open(previewUrl, 'daralfath-home-preview', 'popup,width=460,height=900');
  }, []);

  const mobile = device === 'mobile';
  const scale = mobile ? 1 : Math.min(1, boxWidth > 0 ? boxWidth / DESKTOP_WIDTH : 0.35);
  const frameWidth = mobile ? 390 : DESKTOP_WIDTH;
  const frameHeight = mobile ? FRAME_HEIGHT : Math.round(FRAME_HEIGHT / scale);

  return (
    <div className="p-4 space-y-3">
      <div ref={boxRef} className="relative mx-auto overflow-hidden rounded-xl border border-gray-200 bg-gray-50" dir="ltr"
        style={{ width: mobile ? 392 : '100%', maxWidth: '100%', height: mobile ? FRAME_HEIGHT : Math.round(FRAME_HEIGHT) }}>
        <iframe
          ref={frameRef}
          title="معاينة الصفحة الرئيسية"
          src={previewUrl}
          sandbox="allow-scripts allow-same-origin"
          data-testid="preview-frame"
          style={{ width: frameWidth, height: frameHeight, border: 0, transform: `scale(${scale})`, transformOrigin: 'top left', background: '#fff' }}
        />
        {ticks === 0 && !failed && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-white/70" data-testid="preview-loading"><Loader2 className="animate-spin" /></div>
        )}
      </div>
      {failed && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2" data-testid="preview-failed">
          المعاينة ما ردّتش في الوقت المناسب (ممكن المتصفح بيمنع إطار الموقع). افتحها في نافذة مستقلة وهتتحدّث برضه وإنت بتعدّل.
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-gray-400">التعديلات اللي في الفورم بتظهر هنا قبل الحفظ.</p>
        <button type="button" onClick={openWindow} className="btn-secondary !px-2.5 text-xs flex items-center gap-1 whitespace-nowrap" data-testid="preview-popup"><ExternalLink size={12} /> نافذة مستقلة</button>
      </div>
    </div>
  );
}

// ─── The app: a sketch of the order, the words and the colours ──────────────────────────────────────────────────────────────

const BAND = { none: 'bg-transparent', soft: 'bg-gray-100', mint: 'bg-emerald-50' } as const;

function AppSketch({ blocks, at, nameOf }: { blocks: HomeBlock[]; at: string | null; nameOf: (block: HomeBlock) => string }) {
  const now = at ? new Date(at) : new Date();
  const ctx = { now, country: null, device: null } as const;
  const shown = blocks.map((block) => ({ block, status: blockStatus(block, ctx) }));

  const tiles = (n: number, cols: string) => (
    <div className={`grid ${cols} gap-1.5`}>{Array.from({ length: n }, (_, i) => <div key={i} className="aspect-[3/4] rounded-md bg-gray-200" />)}</div>
  );

  const shelf = (block: HomeBlock, title: string, subtitle: string | null, count: number) => {
    const look = lookOf(block.config);
    const link = look.linkHidden ? null : look.linkLabel ?? 'عرض الكل';
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-800 truncate">{title}</p>
            {subtitle && <p className="text-[10px] text-gray-400 truncate">{subtitle}</p>}
          </div>
          {link && <span className="text-[10px] font-semibold text-blue-600 whitespace-nowrap">{link}</span>}
        </div>
        {look.layout === 'grid' ? tiles(Math.min(4, Math.max(2, count)), 'grid-cols-2') : tiles(3, 'grid-cols-3')}
      </div>
    );
  };

  const body = (block: HomeBlock) => {
    const name = nameOf(block);
    if (block.std === 'departments') {
      return <div className="space-y-2"><p className="text-xs font-bold text-gray-800">{name}</p><div className="grid grid-cols-4 gap-1.5">{[0, 1, 2, 3].map((i) => <div key={i} className="aspect-square rounded-lg bg-gray-200" />)}</div></div>;
    }
    if (block.std === 'categories') return <p className="text-[11px] text-gray-500 text-center py-1">{blockDefaults('categories', 'app').title}: {block.limit ?? blockDefaults('categories', 'app').limit} رفوف تلقائية</p>;
    if (block.std === 'ebook-library') return <div className="rounded-lg bg-sky-100 text-sky-800 text-xs font-bold px-3 py-3">{block.title ?? BLOCK_META['ebook-library'].label}</div>;
    if (block.std === 'intro-videos') return <div className="space-y-2"><p className="text-xs font-bold text-gray-800">{name}</p><div className="grid grid-cols-2 gap-1.5"><div className="aspect-video rounded-md bg-gray-300" /><div className="aspect-video rounded-md bg-gray-300" /></div></div>;
    if (block.std === 'features') return <div className="grid grid-cols-2 gap-1.5">{[0, 1, 2, 3].map((i) => <div key={i} className="h-7 rounded-md bg-gray-200" />)}</div>;
    if (block.kind === PROMO_KIND) {
      const promo = promoOf(block.config);
      const tone = promo.tone === 'brand' ? 'bg-blue-800 text-white' : promo.tone === 'dark' ? 'bg-slate-900 text-white' : 'bg-white text-gray-800 border border-gray-200';
      return (
        <div className={`rounded-xl px-3 py-3 space-y-1 ${tone}`}>
          {block.title && <p className="text-xs font-bold">{block.title}</p>}
          {block.subtitle && <p className="text-[10px] opacity-80 line-clamp-2">{block.subtitle}</p>}
          {promo.buttonLabel && promo.linkUrl && <span className="inline-block text-[10px] font-bold rounded-full bg-white/90 text-blue-900 px-2.5 py-1">{promo.buttonLabel}</span>}
          {promo.imageUrl && <p className="text-[9px] opacity-60">+ صورة</p>}
        </div>
      );
    }
    if (block.kind === BOOK_SHELF_KIND) return shelf(block, name, block.subtitle, Math.min(bookShelfIds(block.config).length, block.limit ?? 40) || 3);
    if (block.kind === FILTER_SHELF_KIND) return shelf(block, name, block.subtitle ?? FILTER_SOURCES[filterSourceOf(block.config)].subtitle, block.limit ?? 4);
    if (block.kind === SHELF_KIND) return shelf(block, name, block.subtitle ?? 'كتب مختارة من هذا التصنيف', block.limit ?? 4);
    const defaults = block.std ? blockDefaults(block.std, 'app') : null;
    return shelf(block, name, block.subtitle ?? defaults?.subtitle ?? null, block.limit ?? defaults?.limit ?? 4);
  };

  return (
    <div className="p-4 space-y-3" data-testid="app-sketch">
      <div className="mx-auto w-[300px] max-w-full rounded-[28px] border-4 border-gray-800 bg-white p-2.5 space-y-2.5 max-h-[640px] overflow-y-auto">
        <div className="h-20 rounded-xl bg-gradient-to-br from-teal-500 to-blue-800 text-white text-[10px] font-bold flex items-center justify-center">البانر</div>
        {shown.map(({ block, status }) => (
          status.live ? (
            <div key={block.key} className={`rounded-xl p-2 ${BAND[lookOf(block.config).background]}`} data-testid="sketch-block" data-key={block.key}>{body(block)}</div>
          ) : (
            <div key={block.key} className="rounded-lg border border-dashed border-gray-200 px-2 py-1.5 text-[10px] text-gray-400 flex items-center justify-between gap-2" data-testid="sketch-hidden" data-key={block.key}>
              <span className="truncate">{block.std ? nameOf(block) : block.kind === SHELF_KIND ? nameOf(block) : block.title ?? CUSTOM_META[block.kind as 'promo'].label}</span>
              <span className="whitespace-nowrap">{status.reason ? HIDDEN_REASON_LABELS[status.reason] : ''}</span>
            </div>
          )
        ))}
      </div>
      <p className="text-[11px] text-gray-400 text-center">شكل تقريبي: الترتيب والنصوص والألوان. تصميم الكروت في التطبيق نفسه ممكن يختلف شوية.</p>
    </div>
  );
}
