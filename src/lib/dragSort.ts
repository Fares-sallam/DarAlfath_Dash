// Drag-and-drop ordering: where a row is dropped (above it, below it, or inside it) and the order that results.
// Pure helpers; the React side is components/catalog/useDragRows.ts.

export type DropZone = 'before' | 'after' | 'inside';

/**
 * Which zone of a row the pointer is over. A row that can hold others has three zones (top quarter = before,
 * bottom quarter = after, the middle = inside); one that cannot has two halves.
 */
export function zoneFromPosition(offsetY: number, height: number, allowInside: boolean): DropZone {
  if (height <= 0) return 'after';
  const ratio = Math.min(Math.max(offsetY / height, 0), 1);
  if (!allowInside) return ratio < 0.5 ? 'before' : 'after';
  if (ratio < 0.25) return 'before';
  if (ratio > 0.75) return 'after';
  return 'inside';
}

/** The list with `moving` taken out and put just before or after `target` (null when nothing would change). */
export function reorderRelative<T>(list: readonly T[], moving: T, target: T, zone: 'before' | 'after'): T[] | null {
  if (moving === target || !list.includes(moving) || !list.includes(target)) return null;
  const without = list.filter((item) => item !== moving);
  const index = without.indexOf(target) + (zone === 'after' ? 1 : 0);
  const next = [...without.slice(0, index), moving, ...without.slice(index)];
  return next.every((item, i) => item === list[i]) ? null : next;
}

/** The list with `moving` at the end (dropped inside a parent: the parent's own list, without it, plus it last). */
export function appendLast<T>(list: readonly T[], moving: T): T[] {
  return [...list.filter((item) => item !== moving), moving];
}

/** One step with the keyboard: the list after moving an item up (-1) or down (1), or null when it cannot. */
export function stepInList<T>(list: readonly T[], item: T, direction: -1 | 1): T[] | null {
  const index = list.indexOf(item);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= list.length) return null;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
