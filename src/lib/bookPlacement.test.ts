import { describe, expect, it } from 'vitest';
import type { CatalogNode, ProductLink } from './catalogTree';
import { bookInNode, bookPlacement, indexNodes, linksFromProduct } from './bookPlacement';

function node(id: string, over: Partial<CatalogNode> = {}): CatalogNode {
  return {
    id, parent_id: null, type: 'category', name_ar: id, name_en: null, slug: id, description_ar: null, description_en: null,
    image_url: null, icon: null, color: null, is_active: true, featured: false, show_web: true, show_app: true,
    sort_web: 0, sort_app: 0, show_in_menu_web: false, show_in_bar_web: true, show_in_bar_app: true, hide_when_empty: true,
    books_sort_web: 'manual', books_sort_app: 'manual', starts_at: null, ends_at: null, seo_title: null, seo_description: null, intro_ar: null, intro_en: null, video_url: null, page_layout: 'auto',
    strips_limit: 12, show_as_strip: true, legacy_table: null, legacy_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
  };
}
const link = (node_id: string, is_primary = false): ProductLink => ({ product_id: 'p', node_id, is_primary, sort_order: 0 });

// قسم ← سلسلة ← تصنيف، وتصنيفات تانية برا
const nodes = [
  node('sec', { type: 'section' }),
  node('sec2', { type: 'section' }),
  node('ser-in', { type: 'series', parent_id: 'sec' }),
  node('cat-in', { parent_id: 'ser-in' }),
  node('cat-sec2', { parent_id: 'sec2' }),
  node('cat-free'),
  node('col-free', { type: 'collection' }),
  node('ser-free', { type: 'series' }),
];
const byId = indexNodes(nodes);
const ids = (list: CatalogNode[]) => list.map((n) => n.id);

describe('bookPlacement', () => {
  it('reads section, primary, extras, series in that order of meaning', () => {
    const place = bookPlacement([link('cat-in', true), link('cat-free'), link('col-free'), link('ser-free')], byId);
    expect(ids(place.sections)).toEqual(['sec']);
    expect(place.primary?.id).toBe('cat-in');
    expect(ids(place.extras)).toEqual(['cat-free', 'col-free']);
    expect(ids(place.series)).toEqual(['ser-free']);
  });
  it('a series above the category is shown as inherited, unless the book is linked to it directly', () => {
    expect(ids(bookPlacement([link('cat-in', true)], byId).inheritedSeries)).toEqual(['ser-in']);
    const direct = bookPlacement([link('cat-in', true), link('ser-in')], byId);
    expect(ids(direct.series)).toEqual(['ser-in']);
    expect(direct.inheritedSeries).toEqual([]);
  });
  it('a book in categories of two sections shows both, the primary category\'s first', () => {
    const place = bookPlacement([link('cat-in'), link('cat-sec2', true)], byId);
    expect(ids(place.sections)).toEqual(['sec2', 'sec']);
  });
  it('a book outside every section has none, and no primary stays null', () => {
    const place = bookPlacement([link('cat-free'), link('ser-free')], byId);
    expect(place.sections).toEqual([]);
    expect(place.primary).toBeNull();
    expect(bookPlacement([], byId)).toEqual({ sections: [], primary: null, extras: [], series: [], inheritedSeries: [] });
  });
  it('links to nodes that are gone are skipped, and a loop in the data does not hang', () => {
    const looped = indexNodes([node('a', { parent_id: 'b', type: 'section' }), node('b', { parent_id: 'a' })]);
    expect(bookPlacement([link('ghost', true), link('b')], looped).primary).toBeNull();
    expect(bookPlacement([link('b', true)], looped).sections.map((n) => n.id)).toEqual(['a']);
  });
});

describe('bookInNode', () => {
  it('matches the node itself and anything inside it', () => {
    const mine = [link('cat-in', true)];
    expect(bookInNode(mine, byId, 'cat-in')).toBe(true);
    expect(bookInNode(mine, byId, 'ser-in')).toBe(true);
    expect(bookInNode(mine, byId, 'sec')).toBe(true);
    expect(bookInNode(mine, byId, 'sec2')).toBe(false);
    expect(bookInNode(mine, byId, 'cat-free')).toBe(false);
    expect(bookInNode([], byId, 'sec')).toBe(false);
  });
});

describe('linksFromProduct', () => {
  it('turns the products query fields into links: primary first, then extras, then series, no repeats', () => {
    const links = linksFromProduct({
      id: 'p', category_id: 'cat-in', product_categories: [{ category_id: 'cat-free' }, { category_id: 'cat-in' }], product_series: [{ series_id: 'ser-free' }],
    });
    expect(links.map((l) => [l.node_id, l.is_primary])).toEqual([['cat-in', true], ['cat-free', false], ['ser-free', false]]);
  });
  it('copes with missing fields', () => {
    expect(linksFromProduct({ id: 'p' })).toEqual([]);
    expect(linksFromProduct({ id: 'p', category_id: null, product_categories: null, product_series: null })).toEqual([]);
  });
  it('is what the books page filters on: a section holds the books of what is inside it', () => {
    const links = linksFromProduct({ id: 'p', category_id: 'cat-in' });
    expect(bookInNode(links, byId, 'sec')).toBe(true);
    expect(bookInNode(links, byId, 'sec2')).toBe(false);
  });
});
