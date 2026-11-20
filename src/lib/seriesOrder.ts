// Ordering helpers for series and for the books inside a series.
//
// Several rows used to share the same sort_order (every book of four series had 0), and swapping two equal
// numbers moves nothing. Moving an item therefore renumbers the whole list 0…n-1 in its new order, and only
// the rows whose number changes are written.

/** The next free position after the existing ones (0 for an empty list). */
export function nextSortOrder(orders: number[]): number {
  const valid = orders.filter((n) => Number.isFinite(n));
  return valid.length === 0 ? 0 : Math.max(...valid) + 1;
}

/** The list with the item at `index` moved one step (-1 up, 1 down), or null when it cannot move. */
export function moveItem<T>(list: readonly T[], index: number, direction: -1 | 1): T[] | null {
  const target = index + direction;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return null;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** The items whose stored sort_order differs from their position in the list: the only rows that need writing. */
export function changedPositions<T extends { sort_order: number }>(list: readonly T[]): { item: T; position: number }[] {
  return list.flatMap((item, position) => (item.sort_order !== position ? [{ item, position }] : []));
}

/**
 * Which series links to remove and which to add when a book's series are saved, so a link that stays keeps its
 * place in that series (the old save deleted every link and re-inserted them all with the position in the book's own list).
 */
export function planSeriesLinks(existing: readonly string[], desired: readonly string[]): { remove: string[]; add: string[] } {
  const wanted = Array.from(new Set(desired.filter(Boolean)));
  const have = new Set(existing);
  return {
    remove: existing.filter((id) => !wanted.includes(id)),
    add: wanted.filter((id) => !have.has(id)),
  };
}
