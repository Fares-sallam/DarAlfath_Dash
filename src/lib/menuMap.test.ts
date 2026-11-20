import { describe, expect, it } from 'vitest';
import type { CatalogNode } from './catalogTree';
import { itemLabel, moveWithinParent, nextMenuSort, placementProblem, placementText, resolveMenu, validMenuUrl, type MenuItem } from './menuMap';

function node(id: string, over: Partial<CatalogNode> = {}): CatalogNode {
  return {
    id, parent_id: null, type: 'category', name_ar: id, name_en: null, slug: id, description_ar: null, description_en: null,
    image_url: null, icon: null, color: null, is_active: true, featured: false, show_web: true, show_app: true,
    sort_web: 0, sort_app: 0, show_in_menu_web: false, show_in_bar_web: true, show_in_bar_app: true, hide_when_empty: true,
    books_sort_web: 'manual', books_sort_app: 'manual', starts_at: null, ends_at: null, seo_title: null, seo_description: null,
    intro_ar: null, intro_en: null, video_url: null, page_layout: 'auto', strips_limit: 12, show_as_strip: true,
    legacy_table: null, legacy_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
  };
}
function item(id: string, over: Partial<MenuItem> = {}): MenuItem {
  return {
    id, channel: 'web', parent_id: null, kind: 'group', node_id: null, label_ar: id, label_en: null, url: null,
    sort_order: 0, visible: true, auto_children: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
  };
}

const nodes = [
  node('s1', { type: 'series', name_ar: 'الفتح', sort_web: 0 }),
  node('c1', { parent_id: 's1', name_ar: 'الكتابة', sort_web: 2 }),
  node('c2', { parent_id: 's1', name_ar: 'الحساب', sort_web: 1 }),
  node('c3', { parent_id: 's1', name_ar: 'مخفي', sort_web: 3, is_active: false }),
];

describe('resolveMenu', () => {
  it('orders main items and puts manual sub-items before the automatic ones', () => {
    const items = [
      item('m2', { kind: 'contact', label_ar: null, sort_order: 2 }),
      item('m1', { kind: 'node', node_id: 's1', label_ar: null, sort_order: 1, auto_children: true }),
      item('sub', { parent_id: 'm1', kind: 'link', url: '/x', label_ar: 'رابط يدوي', sort_order: 0 }),
    ];
    const menu = resolveMenu(items, nodes);
    expect(menu.map((m) => m.label)).toEqual(['الفتح', 'تواصل معنا']);
    expect(menu[0].children.map((c) => [c.label, c.auto])).toEqual([['رابط يدوي', false], ['الحساب', true], ['الكتابة', true]]);
  });

  it('skips inactive tree children and fills nothing when auto is off', () => {
    const on = resolveMenu([item('m', { kind: 'node', node_id: 's1', auto_children: true })], nodes);
    expect(on[0].children.map((c) => c.label)).toEqual(['الحساب', 'الكتابة']);
    const off = resolveMenu([item('m', { kind: 'node', node_id: 's1', auto_children: false })], nodes);
    expect(off[0].children).toEqual([]);
  });

  it('a manual row for a child wins over the automatic one (hidden, re-labelled)', () => {
    const items = [
      item('m', { kind: 'node', node_id: 's1', auto_children: true }),
      item('hide', { parent_id: 'm', kind: 'node', node_id: 'c2', label_ar: null, visible: false }),
    ];
    const kids = resolveMenu(items, nodes)[0].children;
    expect(kids.map((c) => [c.label, c.visible, c.auto])).toEqual([['الحساب', false, false], ['الكتابة', true, true]]);
  });

  it('every sub-item knows which main item it sits inside', () => {
    const menu = resolveMenu([item('m', { kind: 'node', node_id: 's1', label_ar: null, auto_children: true })], nodes);
    expect(menu[0].children.every((c) => c.parent === menu[0])).toBe(true);
    expect(placementText(menu[0])).toBe('رئيسي');
    expect(placementText(menu[0].children[0])).toBe('فرعي داخل: الفتح');
  });

  it('only the chosen channel', () => {
    expect(resolveMenu([item('a', { channel: 'app' })], nodes, 'web')).toEqual([]);
  });
});

describe('labels', () => {
  it('own label, then the node name, then the fixed page name', () => {
    expect(itemLabel({ kind: 'node', node_id: 's1', label_ar: ' اسم مخصص ' }, nodes)).toBe('اسم مخصص');
    expect(itemLabel({ kind: 'node', node_id: 's1', label_ar: null }, nodes)).toBe('الفتح');
    expect(itemLabel({ kind: 'home', node_id: null, label_ar: null }, nodes)).toBe('الرئيسية');
    expect(itemLabel({ kind: 'node', node_id: 'gone', label_ar: null }, nodes)).toBe('عنصر محذوف');
  });
});

describe('placement', () => {
  const items = [item('a'), item('b'), item('sub', { parent_id: 'a' })];
  it('a main item can go inside another main item', () => expect(placementProblem(items, 'b', 'a')).toBeNull());
  it('can always become main', () => expect(placementProblem(items, 'sub', null)).toBeNull());
  it('not inside itself, not inside a sub-item, not when it holds sub-items', () => {
    expect(placementProblem(items, 'a', 'a')).toMatch(/نفسه/);
    expect(placementProblem(items, 'b', 'sub')).toMatch(/مستويين/);
    expect(placementProblem(items, 'a', 'b')).toMatch(/جواه فروع/);
  });
});

describe('moving and ordering', () => {
  const items = [item('a', { sort_order: 0 }), item('b', { sort_order: 1 }), item('c', { sort_order: 2 }), item('s1', { parent_id: 'a', sort_order: 0 }), item('s2', { parent_id: 'a', sort_order: 1 })];
  it('swaps with the neighbour inside the same parent', () => {
    expect(moveWithinParent(items, 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveWithinParent(items, 's1', 1)).toEqual(['s2', 's1']);
  });
  it('cannot leave its list', () => {
    expect(moveWithinParent(items, 'a', -1)).toBeNull();
    expect(moveWithinParent(items, 's2', 1)).toBeNull();
    expect(moveWithinParent(items, 'zzz', 1)).toBeNull();
  });
  it('the next position after the last', () => {
    expect(nextMenuSort(items, 'web', null)).toBe(3);
    expect(nextMenuSort(items, 'web', 'a')).toBe(2);
    expect(nextMenuSort(items, 'web', 'b')).toBe(0);
  });
});

describe('validMenuUrl', () => {
  it('accepts a page of the site or an https address', () => {
    expect(validMenuUrl('/books?series=1')).toBe(true);
    expect(validMenuUrl('https://example.com/x')).toBe(true);
  });
  it('refuses anything else', () => {
    for (const bad of ['', 'javascript:alert(1)', 'http://example.com', '//evil.com', 'books', 'ftp://x.y']) expect(validMenuUrl(bad)).toBe(false);
  });
});
