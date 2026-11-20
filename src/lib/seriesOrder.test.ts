import { describe, expect, it } from 'vitest';
import { changedPositions, moveItem, nextSortOrder, planSeriesLinks } from './seriesOrder';

describe('nextSortOrder', () => {
  it('starts at 0 for an empty list', () => expect(nextSortOrder([])).toBe(0));
  it('goes one past the highest', () => expect(nextSortOrder([0, 4, 2])).toBe(5));
  it('works when every row is 0', () => expect(nextSortOrder([0, 0, 0])).toBe(1));
  it('ignores non-numbers', () => expect(nextSortOrder([NaN, 3])).toBe(4));
});

describe('moveItem', () => {
  it('moves up and down', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });
  it('refuses to leave the list', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toBeNull();
    expect(moveItem(['a', 'b'], 1, 1)).toBeNull();
    expect(moveItem(['a', 'b'], 5, -1)).toBeNull();
  });
  it('does not change the original list', () => {
    const original = ['a', 'b'];
    moveItem(original, 0, 1);
    expect(original).toEqual(['a', 'b']);
  });
});

describe('changedPositions', () => {
  it('renumbers rows that all share 0 (a swap of equal numbers would move nothing)', () => {
    const rows = [{ id: 'a', sort_order: 0 }, { id: 'b', sort_order: 0 }, { id: 'c', sort_order: 0 }];
    const moved = moveItem(rows, 2, -1)!; // c goes above b
    const writes = changedPositions(moved);
    expect(moved.map((r) => r.id)).toEqual(['a', 'c', 'b']);
    expect(writes.map((w) => [w.item.id, w.position])).toEqual([['c', 1], ['b', 2]]);
  });
  it('writes nothing when the numbers already match the positions', () => {
    expect(changedPositions([{ sort_order: 0 }, { sort_order: 1 }])).toEqual([]);
  });
});

describe('planSeriesLinks', () => {
  it('keeps the links that stay, removes the dropped, adds the new', () => {
    expect(planSeriesLinks(['s1', 's2'], ['s2', 's3'])).toEqual({ remove: ['s1'], add: ['s3'] });
  });
  it('does nothing when nothing changed (so no position is reset)', () => {
    expect(planSeriesLinks(['s1', 's2'], ['s2', 's1'])).toEqual({ remove: [], add: [] });
  });
  it('removes everything when none is wanted', () => {
    expect(planSeriesLinks(['s1'], [])).toEqual({ remove: ['s1'], add: [] });
  });
  it('adds all for a new book and ignores duplicates and blanks', () => {
    expect(planSeriesLinks([], ['s1', 's1', '', 's2'])).toEqual({ remove: [], add: ['s1', 's2'] });
  });
});
