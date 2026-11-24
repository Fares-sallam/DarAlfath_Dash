import { ChevronDown, Plus } from 'lucide-react';
import { headerStatusHint, type HeaderEntry, type HeaderStatus } from '@/lib/headerPlacement';

/** The node the pointer (or the keyboard) is on in the tree, and where the header stands for it. */
export interface HeaderFocus {
  nodeId: string;
  name: string;
  status: HeaderStatus;
}

function contains(entry: HeaderEntry, nodeId: string): boolean {
  return entry.nodeId === nodeId || entry.children.some((c) => contains(c, nodeId));
}

/** The sub-items of a main item as the open menu lists them, in drawing order, with their depth. */
function listed(entries: readonly HeaderEntry[], depth = 0): { entry: HeaderEntry; depth: number }[] {
  return entries.flatMap((entry) => [{ entry, depth }, ...listed(entry.children, depth + 1)]);
}

const SCROLL_ROW = { scrollbarWidth: 'none' } as const;

/**
 * The website's top menu as it stands now (the strip under the logo), with the tree row being looked at shown where it sits:
 * its main item lit and, for a sub-item, the open menu with that line marked; a node that is not in the header appears as a
 * dashed chip at the end of the strip, where a new main item would land.
 *
 * Small and of a constant height (three single lines: the strip, the words, the open menu), so it can stay in view above a long
 * tree without eating the screen and the rows do not jump under the pointer.
 */
export default function HeaderPreview({ entries, focus }: { entries: HeaderEntry[]; focus: HeaderFocus | null }) {
  const lit = focus && focus.status.state === 'in' ? entries.find((e) => contains(e, focus.nodeId)) ?? null : null;
  const open = lit ? listed(lit.children) : [];
  const ghost = focus && focus.status.state === 'none';

  return (
    <div className="sticky top-2 z-10 bg-white rounded-2xl shadow-sm border border-gray-100 px-3 py-2 space-y-1.5" aria-label="معاينة الهيدر" data-testid="header-preview">
      {/* one row, like the website's: a long menu scrolls here instead of making a second line */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-gray-500 flex-shrink-0">شريط الموقع دلوقتي</span>
        <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto flex-1 [&::-webkit-scrollbar]:hidden" style={SCROLL_ROW} data-testid="header-preview-strip">
          {entries.length === 0 && <span className="text-xs text-gray-400">الشريط فاضي.</span>}
          {entries.map((entry) => {
            const isLit = lit?.key === entry.key;
            return (
              <span
                key={entry.key}
                data-testid="header-preview-main"
                data-lit={isLit ? 'true' : 'false'}
                className={`inline-flex flex-shrink-0 items-center gap-1 px-2.5 py-0.5 rounded-lg border-2 border-transparent text-xs font-semibold whitespace-nowrap transition-colors ${
                  isLit ? 'bg-blue-600 text-white ring-2 ring-blue-300' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {entry.label}
                {entry.children.length > 0 && <ChevronDown size={12} className={isLit ? 'text-blue-100' : 'text-gray-500'} aria-label="فيه فروع" />}
              </span>
            );
          })}
          {ghost && focus && (
            <span
              data-testid="header-preview-ghost"
              className="inline-flex flex-shrink-0 items-center gap-1 px-2.5 py-0.5 rounded-lg border-2 border-dashed border-blue-400 text-xs font-semibold whitespace-nowrap text-blue-700 bg-blue-50"
            >
              <Plus size={12} /> {focus.name}
            </span>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500 h-4 truncate" data-testid="header-preview-caption">
        {focus
          ? <><b className="text-gray-700">«{focus.name}»</b>{' '}
            {focus.status.state === 'in'
              ? (focus.status.path.length === 0 ? 'بتظهر على الشريط نفسه.' : `بتظهر جوه: ${focus.status.path.join(' ‹ ')}.`)
              : ghost ? 'مش على الشريط. لو أضفتها هتظهر هنا، في آخره.' : headerStatusHint(focus.status)}</>
          : 'وقّف على أي صف تحت. الأسهم ▾ معناها إن العنصر ليه قايمة، والمخفي أو الفاضي مش بيظهر.'}
      </p>

      <ul
        className="flex flex-nowrap items-center gap-1 overflow-x-auto h-5 [&::-webkit-scrollbar]:hidden"
        style={SCROLL_ROW}
        data-testid="header-preview-open"
        aria-label={lit ? `القايمة المفتوحة تحت ${lit.label}` : 'القايمة المفتوحة'}
      >
        {open.map(({ entry, depth }) => {
          const here = !!focus && entry.nodeId === focus.nodeId;
          return (
            <li
              key={entry.key}
              data-here={here ? 'true' : 'false'}
              className={`flex-shrink-0 whitespace-nowrap px-2 rounded-md text-[11px] leading-5 ${here ? 'bg-blue-600 text-white font-bold' : 'bg-gray-50 border border-gray-200 text-gray-600'}`}
            >
              {depth > 0 && <span className={here ? 'text-blue-200' : 'text-gray-300'}>{'‹ '.repeat(depth)}</span>}
              {entry.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
