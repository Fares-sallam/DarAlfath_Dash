import { useEffect, useRef, useState, type ReactNode } from 'react';

/** From this window width (Tailwind's `xl`) the preview is docked beside the form instead of sitting above it. */
const DOCK_FROM_WIDTH = 1280;
/** How far below the top of the window the docked preview stays once the page has scrolled past its place (the header is 5rem). */
export const DOCK_STUCK_TOP = 96;

/**
 * Where a live preview sits next to its form. Below the `xl` breakpoint it is an ordinary block above the form. From `xl` it takes
 * its place in the form's second column, and once the page is scrolled it stays at the left of the window, below the header, however
 * far the page goes (the form is the long part, and what is being edited is often far down it).
 *
 * It is `fixed` rather than `sticky`: a sticky box is carried away with the end of the form it sits beside, and the box the page
 * itself is drawn in is not one a sticky box can follow. The place is worked out from where its column is on screen (the column
 * stays in the page's grid to keep the room), so at the top of the page it sits level with the form, not over the page's title.
 */
export default function PreviewDock({ children }: { children: ReactNode }) {
  const anchor = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const el = anchor.current;
      if (!el || window.innerWidth < DOCK_FROM_WIDTH) { setPlace(null); return; }
      const r = el.getBoundingClientRect();
      const next = { top: Math.round(Math.max(DOCK_STUCK_TOP, r.top)), left: Math.round(r.left), width: Math.round(r.width) };
      setPlace((prev) => (prev && prev.top === next.top && prev.left === next.left && prev.width === next.width ? prev : next));
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    measure();
    // any scroll (the page's, or a box inside it) and any resize moves or resizes the column
    document.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule);
    if (anchor.current) observer.observe(anchor.current);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={anchor} className="xl:col-start-2 xl:row-start-1" data-testid="preview-dock-anchor">
      <div
        data-testid="preview-dock"
        data-docked={place ? 'true' : 'false'}
        className={place ? 'fixed z-20' : ''}
        style={place ? { top: place.top, left: place.left, width: place.width } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
