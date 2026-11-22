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

import { applyColumnChoices, baseLabel, labelGroup } from './columnChoices';
import { makeSection, type ReportDocument } from './types';
import { resolvePeriod } from './period';

describe('applying the choices to a built report', () => {
  type Row = { id: string; name: string; units: number; total: number; status: string };
  const rows: Row[] = [
    { id: 'A1', name: 'أحمد', units: 2, total: 100, status: 'تم' },
    { id: 'A2', name: 'منى', units: 3, total: 50.5, status: 'ملغي' },
  ];
  const doc = (): ReportDocument => ({
    title: 'تقرير', fileBase: 'تقرير', period: resolvePeriod({ preset: 'thisMonth' }, new Date(2026, 10, 22)), generatedAt: new Date(2026, 10, 22), currencySymbol: 'ج.م',
    meta: [], summary: [], notes: [],
    sections: [
      makeSection('الطلبات', [
        { header: 'رقم', value: (r: Row) => r.id },
        { header: 'العميل', value: (r: Row) => r.name },
        { header: 'النسخ', type: 'number', total: 'sum', value: (r: Row) => r.units },
        { header: 'الإجمالي (ج.م)', type: 'money', total: 'sum', value: (r: Row) => r.total },
        { header: 'الحالة', value: (r: Row) => r.status, tone: (r: Row) => (r.status === 'ملغي' ? 'bad' : 'good') },
        { header: 'عمود من البيانات', value: () => 'x' },
      ], rows),
      makeSection('ملخص', [{ header: 'الحالة', value: (r: Row) => r.status }, { header: 'عدد', type: 'number', total: 'sum', value: (r: Row) => r.units }], rows),
    ],
  });
  const groups = [
    labelGroup('orders', 'الطلبات', ['رقم', 'العميل', 'النسخ', 'الإجمالي', 'الحالة'], { locked: 'رقم' }),
    labelGroup('summary', 'ملخص', ['الحالة', 'عدد'], { optional: true, locked: 'الحالة' }),
  ];

  it('names a button by the column\'s own header, without the currency', () => {
    expect(baseLabel('الإجمالي (ج.م)', 'ج.م')).toBe('الإجمالي');
    expect(baseLabel('الوزن (كجم)', 'ج.م')).toBe('الوزن (كجم)');
    expect(baseLabel('الإجمالي (ج.م)', '')).toBe('الإجمالي (ج.م)');
    expect(labelGroup('g', 'g', ['أ', { label: 'ب', defaultOn: false }], { locked: 'أ' }).choices).toEqual([
      { id: 'أ', label: 'أ', defaultOn: true, hint: undefined, locked: true },
      { id: 'ب', label: 'ب', defaultOn: false, hint: undefined, locked: false },
    ]);
  });

  it('changes nothing when everything is on', () => {
    const out = applyColumnChoices(doc(), groups, resolveSelection(groups));
    expect(out.sections).toEqual(doc().sections);
  });

  it('takes a column that is off out of the sheet, with its cells, and keeps the others lined up (a column the groups don\'t know stays)', () => {
    const d = setColumn(groups, setColumn(groups, {}, 'orders', 'العميل', false), 'orders', 'الإجمالي', false);
    const s = applyColumnChoices(doc(), groups, resolveSelection(groups, d)).sections[0];
    expect(s.columns.map((c) => c.header)).toEqual(['رقم', 'النسخ', 'الحالة', 'عمود من البيانات']);
    expect(s.rows[0].cells).toEqual(['A1', 2, 'تم', 'x']);
    expect(s.rows[1].tones).toEqual([undefined, undefined, 'bad', undefined]);
    expect(s.totals).toEqual(['الإجمالي (2)', 5, null, null]);
  });

  it('keeps the totals row\'s label when the column that carried it is gone, and drops the totals when no summed column is left', () => {
    const noId = labelGroup('orders', 'الطلبات', [{ label: 'رقم', defaultOn: false }, 'العميل', 'النسخ', 'الإجمالي', 'الحالة']);
    const noIdSection = applyColumnChoices(doc(), [noId, groups[1]], resolveSelection([noId, groups[1]])).sections[0];
    expect(noIdSection.columns.map((c) => c.header)).toEqual(['العميل', 'النسخ', 'الإجمالي (ج.م)', 'الحالة', 'عمود من البيانات']);
    expect(noIdSection.totals).toEqual(['الإجمالي (2)', 5, 150.5, null, null]);

    let d = setColumn(groups, {}, 'orders', 'النسخ', false);
    d = setColumn(groups, d, 'orders', 'الإجمالي', false);
    expect(applyColumnChoices(doc(), groups, resolveSelection(groups, d)).sections[0].totals).toBeNull();
  });

  it('leaves out a sheet that is switched off', () => {
    const out = applyColumnChoices(doc(), groups, resolveSelection(groups, setGroupEnabled(groups, {}, 'summary', false)));
    expect(out.sections.map((s) => s.title)).toEqual(['الطلبات']);
  });

  it('leaves a sheet no group is made for as it is', () => {
    const out = applyColumnChoices(doc(), [groups[0]], resolveSelection([groups[0]], setColumn([groups[0]], {}, 'orders', 'العميل', false)));
    expect(out.sections[1]).toEqual(doc().sections[1]);
  });
});
