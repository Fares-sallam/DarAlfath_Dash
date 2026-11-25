import type { KeyboardEvent, MouseEvent } from 'react';

// A table row that opens its details when it is clicked anywhere (orders, customers). A control inside the row (a button, a link, an input)
// keeps doing its own thing, and nothing opens while text is selected (the owner dragging over a number to copy it).

const CONTROLS = 'a, button, input, select, textarea, label, [role="button"]';

/** True when the click should open the row: it did not land on a control inside it and no text is selected. */
export function shouldOpenRow(target: EventTarget | null, selectedText: string): boolean {
  if (selectedText) return false;
  return !(target instanceof Element && target.closest(CONTROLS));
}

/** The props that make a `<tr>` open `onOpen` on a click anywhere in it (and on Enter / Space when the row itself has the focus). */
export function rowOpenProps(onOpen: () => void) {
  return {
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (shouldOpenRow(e.target, window.getSelection()?.toString() ?? '')) onOpen();
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        onOpen();
      }
    },
    tabIndex: 0,
  } as const;
}

export const ROW_OPEN_CLASS = 'cursor-pointer focus:outline-none focus-visible:bg-blue-50';
