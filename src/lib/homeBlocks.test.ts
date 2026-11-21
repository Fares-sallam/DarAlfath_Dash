import { describe, expect, it } from 'vitest';
import {
  ALWAYS, BLOCK_DEFAULTS, BLOCK_KEYS, BOOK_RELATED_KEY, blockDefaults, blockProblem, blockStatus, blockText, bookShelfIds, configFor, copyLayout,
  DEFAULT_LOOK, filterSourceOf, hasCustomLook, hasHomeLayout, lookFieldsFor, lookOf, normalizeLook, withLook, pageStripOf, promoOf, resolveHomeBlocks, rowsFor, scheduleState, windowOf, type HomeBlock, type HomeLayoutRow, type LiveContext,
} from './homeBlocks';

const row = (key: string, order: number, over: Partial<HomeLayoutRow> = {}): HomeLayoutRow => ({
  section_key: key, kind: key.startsWith('shelf:') ? 'category-shelf' : key, node_id: key.startsWith('shelf:') ? key.slice(6) : null,
  title_ar: null, subtitle_ar: null, item_limit: null, visible: true, sort_order: order, ...over,
});

describe('home blocks', () => {
  it('knows whether the saved rows are a layout the website can follow', () => {
    expect(hasHomeLayout([])).toBe(false);
    expect(hasHomeLayout([row('shelf:a', 0)])).toBe(false); // shelves alone are not a layout
    expect(hasHomeLayout([row('offers', 0)])).toBe(true);
    expect(hasHomeLayout([row('page:book-related', 0, { kind: 'page-strip' })])).toBe(false);
  });

  it('puts standard blocks and shelves in one order by their numbers', () => {
    const blocks = resolveHomeBlocks([
      row('features', 6), row('shelf:b', 3), row('departments', 0), row('shelf:a', 1), row('best-sellers', 2),
      row('new-arrivals', 4), row('offers', 5), row('categories', 7), row('intro-videos', 8),
    ]);
    expect(blocks.map((b) => b.key)).toEqual(['departments', 'shelf:a', 'best-sellers', 'shelf:b', 'new-arrivals', 'offers', 'features', 'categories', 'intro-videos']);
    expect(blocks[1]).toMatchObject({ std: null, nodeId: 'a', saved: true });
  });

  it('adds a standard block that has no row yet at the end, with its defaults', () => {
    const blocks = resolveHomeBlocks([row('departments', 0), row('offers', 1)]);
    expect(blocks.map((b) => b.key)).toEqual(['departments', 'offers', 'best-sellers', 'new-arrivals', 'categories', 'intro-videos', 'features']);
    expect(blocks.slice(0, 2).every((b) => b.saved)).toBe(true);
    expect(blocks.slice(2).every((b) => !b.saved && b.visible)).toBe(true);
    // nothing saved at all: the house order
    expect(resolveHomeBlocks([]).map((b) => b.key)).toEqual(['departments', 'best-sellers', 'new-arrivals', 'offers', 'categories', 'intro-videos', 'features']);
  });

  it('ignores other kinds of rows and a repeated key', () => {
    const blocks = resolveHomeBlocks([row('offers', 0), row('offers', 5, { visible: false }), row('page:book-related', 1, { kind: 'page-strip' }), row('bogus', 2)]);
    expect(blocks.filter((b) => b.key === 'offers')).toHaveLength(1);
    expect(blocks.find((b) => b.key === 'offers')!.visible).toBe(true);
    expect(blocks.some((b) => b.key === 'bogus' || b.key === 'page:book-related')).toBe(false);
  });

  it('numbers a new order and writes every block as a row', () => {
    const blocks = resolveHomeBlocks([row('departments', 0), row('shelf:a', 1, { title_ar: 'رف أ', item_limit: 6 })]);
    const rows = rowsFor([blocks[1], blocks[0], ...blocks.slice(2)]);
    expect(rows[0]).toEqual({
      section_key: 'shelf:a', kind: 'category-shelf', node_id: 'a', title_ar: 'رف أ', subtitle_ar: null, item_limit: 6, visible: true, sort_order: 0,
      starts_at: null, ends_at: null, countries: null, devices: 'all', config: {},
    });
    expect(rows[1]).toMatchObject({ section_key: 'departments', kind: 'departments', sort_order: 1 });
    expect(rows.map((r) => r.sort_order)).toEqual(rows.map((_, i) => i));
  });

  it('uses what was written, else the standard text and count', () => {
    expect(blockText(undefined, 'new-arrivals')).toEqual({ title: 'وصل حديثًا', subtitle: 'أحدث إصدارات الدار', limit: 12 });
    const written = resolveHomeBlocks([row('new-arrivals', 0, { title_ar: 'جديدنا', item_limit: 6 })])[0];
    expect(blockText(written, 'new-arrivals')).toEqual({ title: 'جديدنا', subtitle: 'أحدث إصدارات الدار', limit: 6 });
    expect(BLOCK_DEFAULTS.features.editable).toEqual([]);
  });

  it('reads another page\'s strip', () => {
    expect(pageStripOf([], BOOK_RELATED_KEY)).toBeNull();
    expect(pageStripOf([row(BOOK_RELATED_KEY, 0, { kind: 'page-strip', title_ar: ' ممكن يعجبك ', item_limit: 6, visible: false })], BOOK_RELATED_KEY))
      .toEqual({ visible: false, title: 'ممكن يعجبك', limit: 6 });
  });
});

describe('app blocks', () => {
  it('has its own set: the e-book card in, the same order the app always had', () => {
    expect(BLOCK_KEYS.app).toEqual(['departments', 'best-sellers', 'new-arrivals', 'offers', 'ebook-library', 'categories', 'intro-videos', 'features']);
    expect(resolveHomeBlocks([], 'app').map((b) => b.key)).toEqual(BLOCK_KEYS.app);
    expect(resolveHomeBlocks([], 'web').map((b) => b.key)).not.toContain('ebook-library');
  });
  it('only reads a block that belongs to the channel', () => {
    const rows = [row('ebook-library', 0), row('offers', 1)];
    expect(hasHomeLayout([row('ebook-library', 0)], 'web')).toBe(false);
    expect(hasHomeLayout([row('ebook-library', 0)], 'app')).toBe(true);
    expect(resolveHomeBlocks(rows, 'web').some((b) => b.key === 'ebook-library' && b.saved)).toBe(false);
    expect(resolveHomeBlocks(rows, 'app').find((b) => b.key === 'ebook-library')!.saved).toBe(true);
  });
  it('draws four automatic category shelves in the app, three on the website', () => {
    expect(blockDefaults('categories', 'app').limit).toBe(4);
    expect(blockDefaults('categories', 'web').limit).toBe(3);
    expect(blockText(undefined, 'categories', 'app').limit).toBe(4);
    expect(BLOCK_DEFAULTS['ebook-library'].editable).toEqual(['title', 'subtitle']);
  });
});

const ctx = (over: Partial<LiveContext> = {}): LiveContext => ({ now: new Date('2026-12-10T12:00:00Z'), country: 'EG', device: 'desktop', ...over });
const block = (over: Partial<HomeBlock> = {}): HomeBlock => ({
  key: 'block:x', std: null, kind: 'promo', config: {}, window: ALWAYS, nodeId: null, title: 'عرض', subtitle: null, limit: null, visible: true, sortOrder: 0, saved: true, ...over,
});
const ID1 = '11111111-1111-1111-1111-111111111111';
const ID2 = '22222222-2222-2222-2222-222222222222';

describe('when a block shows', () => {
  it('is live with no limits, and says why when it is switched off', () => {
    expect(blockStatus(block(), ctx())).toEqual({ live: true, reason: null });
    expect(blockStatus(block({ visible: false }), ctx())).toEqual({ live: false, reason: 'switched-off' });
  });

  it('follows its dates: not before it starts, not once it has ended', () => {
    const win = { ...ALWAYS, startsAt: '2026-12-11T00:00:00Z', endsAt: '2026-12-20T00:00:00Z' };
    expect(blockStatus(block({ window: win }), ctx()).reason).toBe('not-started');
    expect(blockStatus(block({ window: win }), ctx({ now: new Date('2026-12-15T00:00:00Z') })).live).toBe(true);
    expect(blockStatus(block({ window: win }), ctx({ now: new Date('2026-12-20T00:00:00Z') })).reason).toBe('ended');
    // only an end, only a start
    expect(blockStatus(block({ window: { ...ALWAYS, endsAt: '2026-12-09T00:00:00Z' } }), ctx()).reason).toBe('ended');
    expect(blockStatus(block({ window: { ...ALWAYS, startsAt: '2026-12-01T00:00:00Z' } }), ctx()).live).toBe(true);
  });

  it('limits to countries (an unknown country hides a limited block) and to a device (an unknown device is ignored)', () => {
    const eg = block({ window: { ...ALWAYS, countries: ['EG'] } });
    expect(blockStatus(eg, ctx({ country: 'EG' })).live).toBe(true);
    expect(blockStatus(eg, ctx({ country: 'eg' })).live).toBe(true);
    expect(blockStatus(eg, ctx({ country: 'SA' })).reason).toBe('country');
    expect(blockStatus(eg, ctx({ country: null })).reason).toBe('country');
    const phone = block({ window: { ...ALWAYS, devices: 'mobile' } });
    expect(blockStatus(phone, ctx({ device: 'mobile' })).live).toBe(true);
    expect(blockStatus(phone, ctx({ device: 'desktop' })).reason).toBe('device');
    expect(blockStatus(phone, ctx({ device: null })).live).toBe(true);
    // a block with no limits shows to someone whose country is unknown
    expect(blockStatus(block(), ctx({ country: null })).live).toBe(true);
  });

  it('names where the dates stand', () => {
    const now = new Date('2026-12-10T12:00:00Z');
    expect(scheduleState(ALWAYS, now)).toBe('always');
    expect(scheduleState({ startsAt: '2026-12-11T00:00:00Z', endsAt: null }, now)).toBe('upcoming');
    expect(scheduleState({ startsAt: '2026-12-01T00:00:00Z', endsAt: '2026-12-20T00:00:00Z' }, now)).toBe('running');
    expect(scheduleState({ startsAt: null, endsAt: '2026-12-10T12:00:00Z' }, now)).toBe('ended');
  });

  it('reads a saved window safely', () => {
    expect(windowOf({})).toEqual(ALWAYS);
    expect(windowOf({ starts_at: 'not a date', ends_at: '', countries: ['eg', 'EG', 'sa', 'xyz', ''], devices: 'tablet' }))
      .toEqual({ startsAt: null, endsAt: null, countries: ['EG', 'SA'], devices: 'all' });
    expect(windowOf({ starts_at: '2026-12-01T00:00:00Z', countries: [], devices: 'mobile' }))
      .toEqual({ startsAt: '2026-12-01T00:00:00Z', endsAt: null, countries: null, devices: 'mobile' });
  });
});

describe('owner-added blocks', () => {
  it('keeps them in the one order with their settings, and writes them back whole', () => {
    const rows: HomeLayoutRow[] = [
      row('departments', 0),
      row('block:a', 1, { kind: 'book-shelf', title_ar: 'مختارات', config: { product_ids: [ID1, ID2] }, countries: ['EG'], devices: 'mobile', starts_at: '2026-12-01T00:00:00Z' }),
      row('block:b', 2, { kind: 'promo', title_ar: 'خصم', config: { tone: 'brand', link_url: '/search' } }),
      row('block:c', 3, { kind: 'filter-shelf', config: { source: 'offers' }, node_id: 'n1' }),
      row('block:d', 4, { kind: 'mystery' }),
    ];
    const blocks = resolveHomeBlocks(rows);
    expect(blocks.slice(0, 4).map((b) => [b.key, b.kind, b.std])).toEqual([
      ['departments', 'standard', 'departments'], ['block:a', 'book-shelf', null], ['block:b', 'promo', null], ['block:c', 'filter-shelf', null],
    ]);
    expect(blocks.some((b) => b.key === 'block:d')).toBe(false);
    expect(blocks[1].window).toEqual({ startsAt: '2026-12-01T00:00:00Z', endsAt: null, countries: ['EG'], devices: 'mobile' });
    const back = rowsFor(blocks);
    expect(back[1]).toMatchObject({ section_key: 'block:a', kind: 'book-shelf', countries: ['EG'], devices: 'mobile', config: { product_ids: [ID1, ID2] } });
    expect(back[3]).toMatchObject({ kind: 'filter-shelf', node_id: 'n1', config: { source: 'offers' } });
  });

  it('reads the books, the rule and the promo from the config safely', () => {
    expect(bookShelfIds({ product_ids: [ID1.toUpperCase(), 'nope', ID2, ID1, 5] })).toEqual([ID1, ID2]);
    expect(bookShelfIds(null)).toEqual([]);
    expect(bookShelfIds({ product_ids: 'x' })).toEqual([]);
    expect(filterSourceOf({ source: 'ebooks' })).toBe('ebooks');
    expect(filterSourceOf({ source: 'bogus' })).toBe('newest');
    expect(promoOf({ image_url: ' https://a/b.png ', link_url: '', button_label: 'تصفح', tone: 'dark' }))
      .toEqual({ imageUrl: 'https://a/b.png', linkUrl: null, buttonLabel: 'تصفح', tone: 'dark' });
    expect(promoOf(undefined).tone).toBe('light');
  });

  it('builds the config to save', () => {
    expect(configFor('book-shelf', { productIds: [ID1, ID1, 'x'] })).toEqual({ product_ids: [ID1] });
    expect(configFor('filter-shelf', { source: 'ebooks' })).toEqual({ source: 'ebooks' });
    expect(configFor('promo', { promo: { tone: 'brand', linkUrl: '/search', buttonLabel: '', imageUrl: null } })).toEqual({ tone: 'brand', link_url: '/search' });
    expect(configFor('category-shelf', {})).toEqual({});
  });

  it('says what is wrong before saving', () => {
    expect(blockProblem(block({ kind: 'book-shelf', config: {} }))).toMatch(/كتاب واحد/);
    expect(blockProblem(block({ kind: 'book-shelf', config: { product_ids: [ID1] } }))).toBeNull();
    expect(blockProblem(block({ kind: 'promo', title: null, config: {} }))).toMatch(/عنوان/);
    expect(blockProblem(block({ kind: 'promo', title: 'x', config: { button_label: 'اضغط' } }))).toMatch(/وجهة/);
    expect(blockProblem(block({ kind: 'promo', title: 'x', config: { link_url: 'https://evil.example' } }))).toMatch(/جوه التطبيق/);
    expect(blockProblem(block({ kind: 'promo', title: 'x', config: { link_url: '//evil.example' } }))).toMatch(/جوه التطبيق/);
    expect(blockProblem(block({ kind: 'promo', title: 'x', window: { ...ALWAYS, startsAt: '2026-12-10T00:00:00Z', endsAt: '2026-12-09T00:00:00Z' } }))).toMatch(/بعد تاريخ البداية/);
    expect(blockProblem(block({ kind: 'filter-shelf', config: { source: 'offers' } }))).toBeNull();
  });
});

describe('copying a layout to the other channel', () => {
  const web: HomeLayoutRow[] = [
    row('offers', 0, { title_ar: 'عروض الموقع', item_limit: 6 }),
    row('block:p', 1, { kind: 'promo', title_ar: 'خصم', config: { tone: 'brand' }, countries: ['EG'], devices: 'mobile', starts_at: '2026-12-01T00:00:00Z' }),
    row('departments', 2, { visible: false }),
    row('shelf:n1', 3, { title_ar: 'نحو' }),
    row('page:book-related', 4, { kind: 'page-strip' }),
  ];
  const app: HomeLayoutRow[] = [
    row('departments', 0), row('ebook-library', 1, { title_ar: 'مكتبتي' }), row('shelf:old', 2), row('best-sellers', 3), row('offers', 4),
  ];

  it('makes the app follow the website: same blocks and order, the app\'s own e-book card kept at the end, old shelves removed', () => {
    const { rows, remove } = copyLayout(web, app, 'web', 'app');
    expect(rows.map((r) => r.section_key).slice(0, 4)).toEqual(['offers', 'block:p', 'departments', 'shelf:n1']);
    expect(rows.find((r) => r.section_key === 'offers')).toMatchObject({ title_ar: 'عروض الموقع', item_limit: 6, sort_order: 0 });
    expect(rows.find((r) => r.section_key === 'departments')!.visible).toBe(false);
    // the e-book card stays, after the copied blocks, with its own settings
    const ebook = rows.find((r) => r.section_key === 'ebook-library')!;
    expect(ebook.title_ar).toBe('مكتبتي');
    expect(ebook.sort_order).toBeGreaterThan(3);
    // blocks only the website has a place for (every standard block exists in both here), the promo goes with no country and no device
    expect(rows.find((r) => r.section_key === 'block:p')).toMatchObject({ countries: null, devices: 'all', starts_at: '2026-12-01T00:00:00Z', config: { tone: 'brand' } });
    expect(remove).toEqual(['shelf:old']);
    // the strip of another page is not part of it
    expect(rows.some((r) => r.section_key === 'page:book-related')).toBe(false);
    expect(remove).not.toContain('page:book-related');
  });

  it('makes the website follow the app: the app-only e-book card is left out', () => {
    const { rows, remove } = copyLayout(app, web, 'app', 'web');
    expect(rows.some((r) => r.section_key === 'ebook-library')).toBe(false);
    expect(rows.slice(0, 4).map((r) => r.section_key)).toEqual(['departments', 'shelf:old', 'best-sellers', 'offers']);
    // the website's own promo and shelf are not in the app's list, so they go
    expect(remove.sort()).toEqual(['block:p', 'shelf:n1']);
  });
});

describe('the look of a block', () => {
  it('reads a saved look safely, and the standard one when there is none', () => {
    expect(lookOf(undefined)).toEqual(DEFAULT_LOOK);
    expect(lookOf({})).toEqual(DEFAULT_LOOK);
    expect(lookOf({ look: 'x' })).toEqual(DEFAULT_LOOK);
    expect(lookOf({ look: [1] })).toEqual(DEFAULT_LOOK);
    expect(lookOf({ look: { layout: 'grid', background: 'mint', divider: 'none', link_label: '  شوف المزيد ', link_hidden: true, link_url: '/search?sort=newest' } }))
      .toEqual({ layout: 'grid', background: 'mint', divider: 'none', linkLabel: 'شوف المزيد', linkHidden: true, linkUrl: '/search?sort=newest' });
    // anything unknown or unsafe counts as the standard
    expect(lookOf({ look: { layout: 'masonry', background: 'red', divider: 'fancy', link_label: '   ', link_hidden: 'yes', link_url: 'https://evil.example' } })).toEqual(DEFAULT_LOOK);
    expect(lookOf({ look: { link_url: '//evil.example' } }).linkUrl).toBeNull();
    expect(lookOf({ look: { link_label: 'ا'.repeat(40) } }).linkLabel).toHaveLength(24);
  });

  it('writes only what differs from the standard, keeps the other settings, and drops a look that is all standard', () => {
    expect(withLook({ source: 'offers' }, DEFAULT_LOOK)).toEqual({ source: 'offers' });
    expect(withLook({ source: 'offers', look: { layout: 'grid' } }, DEFAULT_LOOK)).toEqual({ source: 'offers' });
    expect(withLook({ source: 'offers' }, { ...DEFAULT_LOOK, layout: 'grid', linkLabel: ' الكل ', linkUrl: '/search' }))
      .toEqual({ source: 'offers', look: { layout: 'grid', link_label: 'الكل', link_url: '/search' } });
    expect(withLook(null, { ...DEFAULT_LOOK, linkHidden: true, divider: 'none' })).toEqual({ look: { divider: 'none', link_hidden: true } });
    // an address that is not a page inside the app is never written
    expect(withLook({}, { ...DEFAULT_LOOK, linkUrl: 'https://evil.example' })).toEqual({});
    // what it writes reads back the same
    const look = { layout: 'grid' as const, background: 'soft' as const, divider: 'none' as const, linkLabel: 'المزيد', linkHidden: false, linkUrl: '/cart' };
    expect(lookOf(withLook({}, look))).toEqual(look);
  });

  it('knows which parts of the look a block has', () => {
    const web = (std: string | null, kind: string) => lookFieldsFor({ std: std as never, kind: kind as never }, 'web');
    expect(web('departments', 'standard')).toEqual([]);
    expect(web('best-sellers', 'standard')).toEqual(['layout', 'background', 'divider', 'link']);
    expect(web('categories', 'standard')).toEqual(['layout', 'background', 'divider', 'linkText']);
    expect(web('features', 'standard')).toEqual(['background', 'divider']);
    expect(web(null, 'category-shelf')).toContain('link');
    expect(web(null, 'book-shelf')).toContain('layout');
    expect(web(null, 'promo')).toEqual(['divider']);
    // the app draws no dividers
    expect(lookFieldsFor({ std: 'new-arrivals', kind: 'standard' }, 'app')).toEqual(['layout', 'background', 'link']);
    expect(lookFieldsFor({ std: null, kind: 'promo' }, 'app')).toEqual([]);
  });

  it('puts back to the standard what a block has no use for', () => {
    const everything = { layout: 'grid' as const, background: 'mint' as const, divider: 'none' as const, linkLabel: 'x', linkHidden: true, linkUrl: '/search' };
    expect(normalizeLook(everything, [])).toEqual(DEFAULT_LOOK);
    expect(normalizeLook(everything, ['layout', 'linkText'])).toEqual({ ...DEFAULT_LOOK, layout: 'grid', linkHidden: true }); // hidden: no words, no destination
    expect(normalizeLook({ ...everything, linkHidden: false }, ['layout', 'linkText'])).toEqual({ ...DEFAULT_LOOK, layout: 'grid', linkLabel: 'x' });
    expect(normalizeLook({ ...everything, linkHidden: false }, ['background', 'divider', 'link', 'layout'])).toEqual({ ...everything, linkHidden: false });
  });

  it('marks a block with a non-standard look', () => {
    expect(hasCustomLook({})).toBe(false);
    expect(hasCustomLook({ look: { layout: 'rail' } })).toBe(false);
    expect(hasCustomLook({ look: { layout: 'grid' } })).toBe(true);
    expect(hasCustomLook({ look: { link_hidden: true } })).toBe(true);
  });

  it('survives a trip through the rows and the copy button', () => {
    const rows: HomeLayoutRow[] = [row('offers', 0, { config: { look: { layout: 'grid', background: 'soft' } } }), row('departments', 1)];
    const blocks = resolveHomeBlocks(rows);
    expect(rowsFor(blocks)[0].config).toEqual({ look: { layout: 'grid', background: 'soft' } });
    expect(copyLayout(rows, [], 'web', 'app').rows.find((r) => r.section_key === 'offers')!.config).toEqual({ look: { layout: 'grid', background: 'soft' } });
  });
});
