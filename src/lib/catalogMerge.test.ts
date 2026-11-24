import { describe, expect, it } from 'vitest';
import type { CatalogNode, ProductLink } from './catalogTree';
import type { MenuItem } from './menuMap';
import { mergeGroup, mergePreview, mergeSummary, mergeTargets } from './catalogMerge';

function node(id: string, type: CatalogNode['type'], over: Partial<CatalogNode> = {}): CatalogNode {
  return {
    id, parent_id: null, type, name_ar: id, name_en: null, slug: id, description_ar: null, description_en: null,
    image_url: null, icon: null, color: null, is_active: true, featured: false, show_web: true, show_app: true,
    sort_web: 0, sort_app: 0, show_in_menu_web: false, show_in_bar_web: true, show_in_bar_app: true, hide_when_empty: true,
    books_sort_web: 'manual', books_sort_app: 'manual', starts_at: null, ends_at: null, seo_title: null, seo_description: null, intro_ar: null, intro_en: null, video_url: null,
    intro_media: 'auto', intro_image_url: null, intro_align: 'right', intro_font_px: 16, intro_pad_right: 0, intro_pad_left: 0, intro_text_pos: 'side', page_layout: 'auto',
    strips_limit: 12, show_as_strip: true, legacy_table: null, legacy_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
  };
}
const link = (product_id: string, node_id: string, is_primary = false): ProductLink => ({ product_id, node_id, is_primary, sort_order: 0 });
const menu = (id: string, node_id: string | null): MenuItem => ({
  id, channel: 'web', parent_id: null, kind: 'node', node_id, label_ar: null, label_en: null, url: null, sort_order: 0, visible: true, auto_children: false,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
});

const NODES = [
  node('sec', 'section'),
  node('ser', 'series', { parent_id: 'sec' }),
  node('a', 'category', { parent_id: 'ser', name_ar: 'ب' }),
  node('b', 'category', { parent_id: 'ser', name_ar: 'أ' }),
  node('c', 'collection', { name_ar: 'ج' }),
  node('a-kid', 'category', { parent_id: 'a' }),
];

describe('mergeTargets', () => {
  it('a category can be merged with categories and collections only, in alphabetical order', () => {
    expect(mergeTargets(NODES, NODES[2]).map((n) => n.id)).toEqual(['b', 'c']);
  });
  it('never offers itself or anything inside it', () => {
    const ids = mergeTargets(NODES, NODES[2]).map((n) => n.id);
    expect(ids).not.toContain('a');
    expect(ids).not.toContain('a-kid');
  });
  it('a series only with series, a section only with sections', () => {
    expect(mergeTargets([...NODES, node('ser2', 'series')], NODES[1]).map((n) => n.id)).toEqual(['ser2']);
    expect(mergeTargets([...NODES, node('sec2', 'section')], NODES[0]).map((n) => n.id)).toEqual(['sec2']);
  });
  it('a category and a collection are one kind', () => {
    expect(mergeGroup('category')).toBe('category');
    expect(mergeGroup('collection')).toBe('category');
    expect(mergeGroup('series')).toBe('series');
  });
});

describe('mergePreview', () => {
  const links = [link('p1', 'a', true), link('p2', 'a'), link('p3', 'a', true), link('p3', 'b'), link('p4', 'b', true), link('p2', 'b', true)];
  it('counts what moves, what is already in both, and what hangs on the item', () => {
    const p = mergePreview(NODES[2], NODES[3], NODES, links, [menu('m1', 'a'), menu('m2', 'a'), menu('m3', 'b')], ['a', 'x']);
    // p1 (primary) moves; p2 is an extra on a but already in b; p3 (primary on a) is also an extra on b
    expect(p).toEqual({ booksMoved: 1, primaryMoved: 1, booksInBoth: 2, children: 1, menuItems: 2, inDepartments: true });
  });
  it('nothing hangs on an item that has nothing', () => {
    expect(mergePreview(NODES[3], NODES[2], NODES, [], [], [])).toEqual({ booksMoved: 0, primaryMoved: 0, booksInBoth: 0, children: 0, menuItems: 0, inDepartments: false });
  });
});

describe('mergeSummary', () => {
  it('says what was merged and what moved', () => {
    expect(mergeSummary({ source_name: 'الإملاء', target_name: 'النحو', books_moved: 3, books_already_in_target: 1, children_moved: 0, menu_items: 0, home_blocks: 0, departments: 0 }))
      .toBe('تم دمج «الإملاء» في «النحو»: 4 كتاب في «النحو»');
    expect(mergeSummary({ source_name: 'أ', target_name: 'ب', books_moved: 0, books_already_in_target: 0, children_moved: 2, menu_items: 0, home_blocks: 0, departments: 0 }))
      .toBe('تم دمج «أ» في «ب»: 2 عنصر تحته اتنقل');
  });
});
