import { describe, expect, it } from 'vitest';
import { ALWAYS, type HomeBlock } from './homeBlocks';
import { blockFromDraft, draftFromBlock, fieldsFor, fromLocalInput, newDraft, toLocalInput } from './homeBlockDraft';

const ID1 = '11111111-1111-1111-1111-111111111111';
const ID2 = '22222222-2222-2222-2222-222222222222';
const saved = (over: Partial<HomeBlock> = {}): HomeBlock => ({
  key: 'block:a', std: null, kind: 'promo', config: {}, window: ALWAYS, nodeId: null, title: 'خصم', subtitle: null, limit: null, visible: false, sortOrder: 4, saved: true, ...over,
});

describe('the block form', () => {
  it('turns a local time into an ISO time and back (in the same time zone)', () => {
    const local = '2026-12-10T09:30';
    const iso = fromLocalInput(local)!;
    expect(new Date(iso).getHours()).toBe(9);
    expect(toLocalInput(iso)).toBe(local);
    expect(fromLocalInput('')).toBeNull();
    expect(fromLocalInput('tomorrow')).toBeNull();
    expect(toLocalInput(null)).toBe('');
    expect(toLocalInput('garbage')).toBe('');
  });

  it('adds a hand-picked shelf: needs a book, keeps the order and the dates', () => {
    const draft = { ...newDraft('book-shelf'), title: ' مختارات ', productIds: [ID2, ID1], startsAt: '2026-12-01T00:00', endsAt: '2026-12-31T23:59', countries: ['sa', 'eg'], devices: 'mobile' as const };
    const made = blockFromDraft(draft, null, 'web', 7);
    expect(made.ok).toBe(true);
    if (made.ok) {
      expect(made.block).toMatchObject({ kind: 'book-shelf', title: 'مختارات', sortOrder: 7, visible: true, saved: false, config: { product_ids: [ID2, ID1] } });
      expect(made.block.window).toMatchObject({ countries: ['EG', 'SA'], devices: 'mobile' });
      expect(made.block.window.startsAt).not.toBeNull();
    }
    expect(blockFromDraft(newDraft('book-shelf'), null, 'web', 0)).toEqual({ ok: false, problem: 'اختار كتاب واحد على الأقل.' });
  });

  it('refuses a rule shelf with a wrong count, and a category shelf with no node', () => {
    expect(blockFromDraft({ ...newDraft('filter-shelf'), limit: '99' }, null, 'web', 0)).toMatchObject({ ok: false });
    const ok = blockFromDraft({ ...newDraft('filter-shelf'), source: 'offers', nodeId: 'n1', limit: '8' }, null, 'web', 2);
    expect(ok).toMatchObject({ ok: true, block: { kind: 'filter-shelf', nodeId: 'n1', limit: 8, config: { source: 'offers' } } });
    expect(blockFromDraft(newDraft('category-shelf'), null, 'web', 0)).toEqual({ ok: false, problem: 'اختار التصنيف أو السلسلة الأول.' });
  });

  it('builds a promo strip, and stops a bad one', () => {
    const draft = { ...newDraft('promo'), title: 'خصم الشتاء', subtitle: 'على كل الكتب', imageUrl: 'https://x.example/a.webp', linkUrl: '/search?sort=newest', buttonLabel: 'تصفح', tone: 'brand' as const };
    expect(blockFromDraft(draft, null, 'app', 1)).toMatchObject({
      ok: true, block: { kind: 'promo', title: 'خصم الشتاء', subtitle: 'على كل الكتب', config: { image_url: 'https://x.example/a.webp', link_url: '/search?sort=newest', button_label: 'تصفح', tone: 'brand' } },
    });
    expect(blockFromDraft({ ...draft, linkUrl: 'https://evil.example' }, null, 'web', 1)).toMatchObject({ ok: false });
    expect(blockFromDraft(newDraft('promo'), null, 'web', 1)).toMatchObject({ ok: false });
    expect(blockFromDraft({ ...draft, startsAt: '2026-12-10T10:00', endsAt: '2026-12-10T09:00' }, null, 'web', 1)).toEqual({ ok: false, problem: 'تاريخ النهاية لازم يبقى بعد تاريخ البداية.' });
  });

  it('keeps what the form does not show, and drops what the app cannot use', () => {
    const base = saved({ visible: false, sortOrder: 4 });
    const edited = blockFromDraft({ ...draftFromBlock(base), title: 'جديد', countries: ['EG'], devices: 'desktop' }, base, 'app', 9);
    expect(edited).toMatchObject({ ok: true, block: { key: 'block:a', title: 'جديد', visible: false, sortOrder: 4, saved: true } });
    if (edited.ok) expect(edited.block.window).toMatchObject({ countries: null, devices: 'all' });
    // a standard block keeps its own texts the form can't edit
    const features = saved({ key: 'features', std: 'features', kind: 'standard', title: null });
    expect(fieldsFor(draftFromBlock(features), 'web')).toEqual([]);
  });

  it('reads a saved block back into the form', () => {
    const block = saved({ kind: 'book-shelf', title: 'مختارات', config: { product_ids: [ID1, 'bad', ID2] }, window: { startsAt: '2026-12-01T10:00:00Z', endsAt: null, countries: ['EG'], devices: 'mobile' }, limit: 6 });
    const draft = draftFromBlock(block);
    expect(draft).toMatchObject({ key: 'block:a', kind: 'book-shelf', productIds: [ID1, ID2], limit: '6', countries: ['EG'], devices: 'mobile', endsAt: '' });
    expect(draft.startsAt).toMatch(/^2026-12-01T\d\d:\d\d$/);
  });
});
