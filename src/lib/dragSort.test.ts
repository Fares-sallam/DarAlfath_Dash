import { describe, expect, it } from 'vitest';
import { appendLast, reorderRelative, stepInList, zoneFromPosition } from './dragSort';

describe('zoneFromPosition', () => {
  it('two halves for a row that cannot hold others', () => {
    expect(zoneFromPosition(5, 40, false)).toBe('before');
    expect(zoneFromPosition(25, 40, false)).toBe('after');
  });
  it('three zones for a row that can', () => {
    expect(zoneFromPosition(4, 40, true)).toBe('before');
    expect(zoneFromPosition(20, 40, true)).toBe('inside');
    expect(zoneFromPosition(36, 40, true)).toBe('after');
  });
  it('is safe outside the row and on an empty one', () => {
    expect(zoneFromPosition(-10, 40, true)).toBe('before');
    expect(zoneFromPosition(90, 40, true)).toBe('after');
    expect(zoneFromPosition(0, 0, true)).toBe('after');
  });
});

describe('reorderRelative', () => {
  const list = ['a', 'b', 'c', 'd'];
  it('moves before and after the target', () => {
    expect(reorderRelative(list, 'd', 'b', 'before')).toEqual(['a', 'd', 'b', 'c']);
    expect(reorderRelative(list, 'a', 'c', 'after')).toEqual(['b', 'c', 'a', 'd']);
  });
  it('returns null when nothing changes', () => {
    expect(reorderRelative(list, 'b', 'a', 'after')).toBeNull();
    expect(reorderRelative(list, 'a', 'b', 'before')).toBeNull();
    expect(reorderRelative(list, 'a', 'a', 'after')).toBeNull();
  });
  it('returns null for something that is not in the list', () => {
    expect(reorderRelative(list, 'z', 'a', 'after')).toBeNull();
    expect(reorderRelative(list, 'a', 'z', 'after')).toBeNull();
  });
  it('does not change the original', () => {
    const copy = [...list];
    reorderRelative(list, 'd', 'a', 'before');
    expect(list).toEqual(copy);
  });
});

describe('appendLast and stepInList', () => {
  it('puts an item last, even when it was already inside', () => {
    expect(appendLast(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    expect(appendLast(['a', 'b', 'c'], 'a')).toEqual(['b', 'c', 'a']);
  });
  it('steps one place for the keyboard', () => {
    expect(stepInList(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(stepInList(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(stepInList(['a', 'b'], 'a', -1)).toBeNull();
    expect(stepInList(['a', 'b'], 'b', 1)).toBeNull();
    expect(stepInList(['a', 'b'], 'x', 1)).toBeNull();
  });
});
