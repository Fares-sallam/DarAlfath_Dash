import { describe, expect, it } from 'vitest';
import { ALWAYS, type HomeBlock } from './homeBlocks';
import { DRAFT_KEY, blockFromDraft, blocksWithDraft, draftFromBlock, fieldsFor, fromLocalInput, newDraft, toLocalInput } from './homeBlockDraft';

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

describe('the look in the form', () => {
  const offers = saved({ key: 'offers', std: 'offers', kind: 'standard', title: null, config: {}, visible: true, sortOrder: 3 });

  it('saves the look the block can have, and ignores the rest', () => {
    const draft = { ...draftFromBlock(offers), look: { layout: 'grid' as const, background: 'mint' as const, divider: 'none' as const, linkLabel: 'شوف الكل', linkHidden: false, linkUrl: '/search' } };
    const made = blockFromDraft(draft, offers, 'web', 0);
    expect(made).toMatchObject({ ok: true, block: { config: { look: { layout: 'grid', background: 'mint', divider: 'none', link_label: 'شوف الكل', link_url: '/search' } } } });
    // the app has no dividers
    const app = blockFromDraft(draft, offers, 'app', 0);
    if ('block' in app) expect((app.block.config.look as Record<string, unknown>).divider).toBeUndefined();
    // the series strip has no look at all
    const departments = saved({ key: 'departments', std: 'departments', kind: 'standard', title: null, config: {} });
    const none = blockFromDraft({ ...draftFromBlock(departments), look: draft.look }, departments, 'web', 0);
    expect(none).toMatchObject({ ok: true, block: { config: {} } });
  });

  it('keeps a promo strip\'s own settings next to its look, and refuses a bad link', () => {
    const d = { ...newDraft('promo'), title: 'خصم', look: { ...newDraft('promo').look, divider: 'none' as const } };
    expect(blockFromDraft(d, null, 'web', 1)).toMatchObject({ ok: true, block: { config: { tone: 'light', look: { divider: 'none' } } } });
    const bad = { ...newDraft('book-shelf'), productIds: [ID1], look: { ...newDraft('book-shelf').look, linkUrl: 'https://evil.example' } };
    expect(blockFromDraft(bad, null, 'web', 1)).toMatchObject({ ok: false });
    const longLabel = { ...newDraft('book-shelf'), productIds: [ID1], look: { ...newDraft('book-shelf').look, linkLabel: 'ا'.repeat(30) } };
    expect(blockFromDraft(longLabel, null, 'web', 1)).toEqual({ ok: false, problem: 'كلمة الرابط أطول من 24 حرف.' });
  });

  it('shows the blocks as they would be with the open form: edited in place, or a new one at the end', () => {
    const a = saved({ key: 'block:a', kind: 'promo', title: 'قديم', visible: true, sortOrder: 0 });
    const b = saved({ key: 'block:b', kind: 'promo', title: 'ب', visible: true, sortOrder: 1 });
    const edited = blocksWithDraft([a, b], { ...draftFromBlock(a), title: 'جديد' }, 'web');
    expect(edited.blocks.map((x) => x.title)).toEqual(['جديد', 'ب']);
    expect(edited.focus).toBe('block:a');
    const added = blocksWithDraft([a, b], { ...newDraft('promo'), title: 'مضاف' }, 'web');
    expect(added.blocks.map((x) => x.key)).toEqual(['block:a', 'block:b', DRAFT_KEY]);
    expect(added.focus).toBe(DRAFT_KEY);
    // a form with a problem leaves the blocks alone
    expect(blocksWithDraft([a, b], newDraft('promo'), 'web').blocks.map((x) => x.key)).toEqual(['block:a', 'block:b']);
    expect(blocksWithDraft([a, b], null, 'web')).toEqual({ blocks: [a, b], focus: null });
  });
});
