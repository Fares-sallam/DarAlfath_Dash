import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { DOCK_STUCK_TOP } from '@/components/preview/PreviewDock';

/** How long a frame may take to say it is ready before the preview says it could not load. */
const READY_WAIT_MS = 15_000;
/** The draft is sent a moment after the last change, not on every key. */
const SEND_AFTER_MS = 150;
/** From this window width the previews are docked beside the form (see DisplayDetails / AppControlAdmin: the `xl` breakpoint). */
const DOCK_FROM_WIDTH = 1280;
/** A docked preview stays this far below the top of the window once the page has scrolled (see PreviewDock) and keeps this much below it. */
const DOCK_BOTTOM = 16;
/** The least height the picture is shrunk to (below it the box scrolls inside itself instead). */
const MIN_ROOM = 300;

interface Props {
  title: string;
  /** the address the frame opens (its page is moved by messages afterwards, so this rarely changes) */
  src: string;
  /** the framed page's origin: messages go only there and only from there are heard */
  origin: string;
  /** the type of the message the framed page sends when it is ready */
  readyType: string;
  /** what is sent to the framed page (again whenever it changes, and again after a reload of the frame) */
  message: unknown;
  /** the framed page's own width and height in CSS pixels; the frame is scaled down to fit the box it is in */
  width: number;
  height: number;
  testId: string;
  /** a phone-shaped bezel around it */
  phone?: boolean;
}

/**
 * A page of ours shown in a frame and fed a draft. It waits for the page to say it is ready (the page only answers this
 * dashboard), sends the draft, and sends it again after every change; if the page never answers, it says so and offers the
 * page in a tab. Nothing a frame receives is written anywhere.
 */
export default function LiveFrame({ title, src, origin, readyType, message, width, height, testId, phone = false }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [ticks, setTicks] = useState(0);
  const [failed, setFailed] = useState(false);
  const [boxWidth, setBoxWidth] = useState(0);

  // the page says it is ready (again after every reload of the frame)
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== frameRef.current?.contentWindow) return;
      if (event.data && typeof event.data === 'object' && (event.data as { type?: string }).type === readyType) {
        setFailed(false);
        setTicks((n) => n + 1);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [origin, readyType]);

  useEffect(() => {
    if (ticks > 0) return undefined;
    const id = window.setTimeout(() => setFailed(true), READY_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [ticks]);

  // the draft goes whenever it changes (once the page is ready)
  const payload = JSON.stringify(message);
  const post = useCallback(() => frameRef.current?.contentWindow?.postMessage(JSON.parse(payload), origin), [payload, origin]);
  useEffect(() => {
    if (ticks === 0) return undefined;
    const id = window.setTimeout(post, SEND_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [ticks, post]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width));
    observer.observe(el);
    setBoxWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  // beside the form (a wide screen) the preview stays in view while the page scrolls, so it must also fit the window's height
  const [view, setView] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setView({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const docked = view.w >= DOCK_FROM_WIDTH;
  // what the box around the picture takes besides the picture (title, controls, hint, padding): measured, so the picture gets the rest
  const [chrome, setChrome] = useState(300);
  useEffect(() => {
    const shell = boxRef.current?.closest('[data-dock-shell]') as HTMLElement | null;
    if (!shell || !boxRef.current) return undefined;
    const measure = () => { if (boxRef.current) setChrome(Math.max(0, shell.offsetHeight - boxRef.current.offsetHeight)); };
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    measure();
    return () => observer.disconnect();
  }, []);
  const room = Math.max(MIN_ROOM, view.h - DOCK_STUCK_TOP - DOCK_BOTTOM - chrome);

  const pad = phone ? 12 : 0;
  const fullW = width + pad;
  const fullH = height + pad;
  const scale = Math.min(1, boxWidth > 0 ? boxWidth / fullW : 1, docked ? room / fullH : 1);
  const bezel = phone ? 'rounded-[28px] bg-gray-800 shadow-lg p-[6px]' : 'rounded-xl bg-gray-50 ring-1 ring-gray-200';

  return (
    <div className="space-y-2" data-testid={testId} data-ready={ticks > 0 ? 'true' : 'false'} data-scale={scale.toFixed(2)}>
      <div ref={boxRef} className="w-full">
        {/* left-to-right and positioned from the top left: the page around is right to left, where a box wider than its parent would
            hang out of its left side and the shrinking would pull it further that way */}
        <div className="relative mx-auto" dir="ltr" style={{ width: Math.round(fullW * scale), height: Math.round(fullH * scale) }}>
          <div className={`absolute left-0 top-0 overflow-hidden ${bezel}`} style={{ width: fullW, height: fullH, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <iframe
              ref={frameRef}
              title={title}
              src={src}
              sandbox="allow-scripts allow-same-origin"
              data-testid={`${testId}-iframe`}
              style={{ width, height, border: 0, background: '#fff', borderRadius: phone ? 22 : 12, display: 'block' }}
            />
            {ticks === 0 && !failed && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-white/70" data-testid={`${testId}-loading`}><Loader2 className="animate-spin" /></div>
            )}
          </div>
        </div>
      </div>
      {failed && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2" data-testid={`${testId}-failed`}>
          المعاينة ما ردّتش في الوقت المناسب (ممكن النت بطيء أو المتصفح بيمنع الإطار).{' '}
          <a href={src} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline">افتحها في تبويب <ExternalLink size={11} /></a>
        </p>
      )}
    </div>
  );
}
