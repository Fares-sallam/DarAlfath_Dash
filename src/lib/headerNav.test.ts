import { describe, expect, it } from 'vitest';
import { defaultHeaderNav, resolveHeaderNav } from './headerNav';

const keys = (list: { key: string }[]) => list.map((e) => e.key);

describe('resolveHeaderNav', () => {
  it('nothing saved: home, books, the series in order, contact', () => {
    expect(keys(resolveHeaderNav(null, ['a', 'b']))).toEqual(['home', 'books', 'series:a', 'series:b', 'contact']);
    expect(resolveHeaderNav([], ['a'])).toEqual(defaultHeaderNav(['a']));
  });

  it('keeps the saved order and visibility', () => {
    const saved = [
      { key: 'series:b', visible: true },
      { key: 'home', visible: true },
      { key: 'contact', visible: false },
      { key: 'series:a', visible: true },
      { key: 'books', visible: true },
    ];
    expect(resolveHeaderNav(saved, ['a', 'b'])).toEqual(saved);
  });

  it('drops deleted series and junk, and adds a new series after the last one', () => {
    const saved = [
      { key: 'home', visible: true },
      { key: 'books', visible: true },
      { key: 'series:gone', visible: true },
      { key: 'series:a', visible: true },
      { key: 'contact', visible: true },
      { key: 'bogus', visible: true },
      { key: 'series:a', visible: false },
    ];
    expect(keys(resolveHeaderNav(saved, ['a', 'new']))).toEqual(['home', 'books', 'series:a', 'series:new', 'contact']);
  });

  it('puts missing fixed links back in their usual places', () => {
    expect(keys(resolveHeaderNav([{ key: 'series:a', visible: true }], ['a']))).toEqual(['home', 'books', 'series:a', 'contact']);
  });

  it('a new series goes before contact when no series was saved', () => {
    const saved = [{ key: 'home', visible: true }, { key: 'books', visible: true }, { key: 'contact', visible: true }];
    expect(keys(resolveHeaderNav(saved, ['x']))).toEqual(['home', 'books', 'series:x', 'contact']);
  });
});
