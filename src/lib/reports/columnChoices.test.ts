import { describe, expect, it } from 'vitest';
import { parseDecisions, pickColumns, resolveSelection, setAll, setColumn, setGroupEnabled, type ColumnGroup } from './columnChoices';

const groups: ColumnGroup[] = [
  { id: 'list', title: 'قائمة', choices: [
    { id: 'title', label: 'الكتاب', defaultOn: true, locked: true },
    { id: 'cost', label: 'سعر التكلفة', defaultOn: true },
    { id: 'min', label: 'أقل سعر', defaultOn: false },
  ] },
  { id: 'copies', title: 'النسخ', optional: true, choices: [
    { id: 'book', label: 'الكتاب', defaultOn: true, locked: true },
    { id: 'sku', label: 'SKU', defaultOn: true },
  ] },
];

describe('column choices', () => {
  it('shows the standard columns when nothing was decided, a locked one always', () => {
    const s = resolveSelection(groups);
    expect([...s.list.ids]).toEqual(['title', 'cost']);
    expect([...s.copies.ids]).toEqual(['book', 'sku']);
    expect(s.list.enabled).toBe(true);
    expect(s.copies.enabled).toBe(true);
  });

  it('follows what the owner turned on or off, and forgets a decision that is back to the standard', () => {
    let d = setColumn(groups, {}, 'list', 'min', true);
    d = setColumn(groups, d, 'list', 'cost', false);
    expect(d).toEqual({ 'list.min': true, 'list.cost': false });
    expect([...resolveSelection(groups, d).list.ids]).toEqual(['title', 'min']);
    d = setColumn(groups, d, 'list', 'min', false);
    expect(d).toEqual({ 'list.cost': false });
  });

  it('never turns a locked column off, and ignores a column that does not exist', () => {
    expect(setColumn(groups, {}, 'list', 'title', false)).toEqual({});
    expect(setColumn(groups, {}, 'list', 'nope', true)).toEqual({});
    expect(setColumn(groups, {}, 'nope', 'min', true)).toEqual({});
  });

  it('switches a whole sheet off and on (only a sheet that is optional)', () => {
    const off = setGroupEnabled(groups, {}, 'copies', false);
    expect(resolveSelection(groups, off).copies.enabled).toBe(false);
    expect(resolveSelection(groups, setGroupEnabled(groups, off, 'copies', true)).copies.enabled).toBe(true);
    expect(setGroupEnabled(groups, {}, 'list', false)).toEqual({});
  });

  it('turns every column of a group on, or back to the standard, without touching the other group', () => {
    const base = { 'copies.sku': false, 'list.cost': false };
    const all = setAll(groups, base, 'list', 'all');
    expect(all).toEqual({ 'copies.sku': false, 'list.min': true });
    expect(setAll(groups, all, 'list', 'standard')).toEqual({ 'copies.sku': false });
  });

  it('reads stored decisions safely', () => {
    expect(parseDecisions(null, groups)).toEqual({});
    expect(parseDecisions([1], groups)).toEqual({});
    expect(parseDecisions({ 'list.min': true, 'list.title': false, 'list.nope': true, copies: false, list: false, 'list.cost': 'yes' }, groups)).toEqual({ 'list.min': true, copies: false });
  });

  it('keeps a catalog\'s own order when picking columns', () => {
    const catalog = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(pickColumns(catalog, { enabled: true, ids: new Set(['c', 'a']) }).map((c) => c.id)).toEqual(['a', 'c']);
    expect(pickColumns(catalog, undefined)).toHaveLength(3);
  });
});
