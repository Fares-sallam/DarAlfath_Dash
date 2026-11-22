import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';

/** How long a frame may take to say it is ready before the preview says it could not load. */
const READY_WAIT_MS = 15_000;
/** The draft is sent a moment after the last change, not on every key. */
const SEND_AFTER_MS = 150;

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

  const scale = Math.min(1, boxWidth > 0 ? boxWidth / width : 1);
  const bezel = phone ? 'rounded-[28px] border-[6px] border-gray-800 bg-gray-800 shadow-lg' : 'rounded-xl border border-gray-200 bg-gray-50';

  return (
    <div className="space-y-2" data-testid={testId} data-ready={ticks > 0 ? 'true' : 'false'}>
      <div ref={boxRef} className={`relative mx-auto overflow-hidden ${bezel}`} dir="ltr" style={{ width: '100%', maxWidth: width + (phone ? 12 : 0), height: Math.round(height * scale) + (phone ? 12 : 0) }}>
        <iframe
          ref={frameRef}
          title={title}
          src={src}
          sandbox="allow-scripts allow-same-origin"
          data-testid={`${testId}-iframe`}
          style={{ width, height, border: 0, transform: `scale(${scale})`, transformOrigin: 'top left', background: '#fff', borderRadius: phone ? 20 : 0 }}
        />
        {ticks === 0 && !failed && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-white/70" data-testid={`${testId}-loading`}><Loader2 className="animate-spin" /></div>
        )}
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
