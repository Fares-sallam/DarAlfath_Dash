import { describe, expect, it } from 'vitest';
import type { CatalogNode } from './catalogTree';
import { addableNodes, changedImages, departmentIssue, departmentsChanged } from './storeDepartments';

function node(id: string, over: Partial<CatalogNode> = {}): CatalogNode {
  return {
    id, parent_id: null, type: 'series', name_ar: id, name_en: null, slug: id, description_ar: null, description_en: null,
    image_url: null, icon: null, color: null, is_active: true, featured: false, show_web: true, show_app: true,
    sort_web: 0, sort_app: 0, show_in_menu_web: false, show_in_bar_web: true, show_in_bar_app: true, hide_when_empty: true,
    books_sort_web: 'manual', books_sort_app: 'manual', starts_at: null, ends_at: null, seo_title: null, seo_description: null, intro_ar: null, intro_en: null, video_url: null,
    intro_media: 'auto', intro_image_url: null, intro_align: 'right', intro_font_px: 16, intro_pad_right: 0, intro_pad_left: 0, intro_text_pos: 'side', page_layout: 'auto',
    strips_limit: 12, show_as_strip: true, legacy_table: null, legacy_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
  };
}

describe('departmentIssue', () => {
  it('a card the website draws has no issue', () => {
    expect(departmentIssue(node('a'), { total: 3 })).toBeNull();
    expect(departmentIssue(node('a'), undefined)).toBeNull();
  });
  it('says why a chosen card is not drawn', () => {
    expect(departmentIssue(undefined, undefined)).toBe('missing');
    expect(departmentIssue(node('a', { is_active: false }), { total: 3 })).toBe('inactive');
    expect(departmentIssue(node('a', { show_web: false }), { total: 3 })).toBe('hidden-web');
    expect(departmentIssue(node('a', { starts_at: '2099-01-01T00:00:00Z' }), { total: 3 })).toBe('out-of-dates');
    expect(departmentIssue(node('a'), { total: 0 })).toBe('empty');
  });
  it('an empty node that is not set to hide when empty is drawn', () => {
    expect(departmentIssue(node('a', { hide_when_empty: false }), { total: 0 })).toBeNull();
  });
});

describe('what changed', () => {
  const nodes = [node('a', { image_url: 'https://x/a.png' }), node('b'), node('c')];
  it('nothing edited, nothing changed', () => {
    expect(departmentsChanged(['a', 'b'], nodes, null)).toBe(false);
    expect(departmentsChanged(['a', 'b'], nodes, { ids: ['a', 'b'], images: {} })).toBe(false);
  });
  it('a list or an order that differs is a change', () => {
    expect(departmentsChanged(['a', 'b'], nodes, { ids: ['b', 'a'], images: {} })).toBe(true);
    expect(departmentsChanged(['a', 'b'], nodes, { ids: ['a'], images: {} })).toBe(true);
    expect(departmentsChanged(['a', 'b'], nodes, { ids: ['a', 'b', 'c'], images: {} })).toBe(true);
  });
  it('a picture counts only when it differs from the node\'s own', () => {
    expect(departmentsChanged(['a'], nodes, { ids: ['a'], images: { a: 'https://x/a.png' } })).toBe(false);
    expect(departmentsChanged(['a'], nodes, { ids: ['a'], images: { a: 'https://x/new.png' } })).toBe(true);
    expect(departmentsChanged(['a'], nodes, { ids: ['a'], images: { a: null } })).toBe(true);
    expect(departmentsChanged(['b'], nodes, { ids: ['b'], images: { b: null } })).toBe(false);
  });
  it('changedImages keeps only real changes of nodes still in the list', () => {
    expect(changedImages(nodes, { ids: ['a', 'b'], images: { a: 'https://x/a.png', b: 'https://x/b.png', c: 'https://x/c.png' } })).toEqual({ b: 'https://x/b.png' });
  });
});

describe('addableNodes', () => {
  const ordered = [node('s', { name_ar: 'سلسلة الرياحين' }), node('c', { name_ar: 'النحو', type: 'category' }), node('x', { name_ar: 'قسم', name_en: 'Section', type: 'section' })];
  it('lists what is not already a card, in order', () => {
    expect(addableNodes(ordered, ['c'], '').map((n) => n.id)).toEqual(['s', 'x']);
  });
  it('searches the Arabic and English names', () => {
    expect(addableNodes(ordered, [], 'رياحين').map((n) => n.id)).toEqual(['s']);
    expect(addableNodes(ordered, [], 'section').map((n) => n.id)).toEqual(['x']);
    expect(addableNodes(ordered, [], 'مش موجود')).toEqual([]);
  });
});
