import { describe, expect, it } from 'vitest';
import { BLOCK_DEFAULTS, BLOCK_KEYS, BOOK_RELATED_KEY, blockDefaults, blockText, hasHomeLayout, pageStripOf, resolveHomeBlocks, rowsFor, type HomeLayoutRow } from './homeBlocks';

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
    expect(rows[0]).toEqual({ section_key: 'shelf:a', kind: 'category-shelf', node_id: 'a', title_ar: 'رف أ', subtitle_ar: null, item_limit: 6, visible: true, sort_order: 0 });
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
