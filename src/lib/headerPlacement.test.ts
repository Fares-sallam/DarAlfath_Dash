import { describe, expect, it } from 'vitest';
import type { CatalogNode } from './catalogTree';
import { headerStatuses, headerStatusHint, headerStatusLabel, headerView } from './headerPlacement';
import { resolveMenu, type MenuItem } from './menuMap';

function node(id: string, over: Partial<CatalogNode> = {}): CatalogNode {
  return {
    id, parent_id: null, type: 'category', name_ar: id, name_en: null, slug: id, description_ar: null, description_en: null,
    image_url: null, icon: null, color: null, is_active: true, featured: false, show_web: true, show_app: true,
    sort_web: 0, sort_app: 0, show_in_menu_web: false, show_in_bar_web: true, show_in_bar_app: true, hide_when_empty: true,
    books_sort_web: 'manual', books_sort_app: 'manual', starts_at: null, ends_at: null, seo_title: null, seo_description: null, intro_ar: null, intro_en: null, video_url: null, intro_media: 'auto', intro_image_url: null, intro_align: 'right', intro_font_px: 16, intro_pad_right: 0, intro_pad_left: 0, intro_text_pos: 'side', page_layout: 'auto',
    strips_limit: 12, show_as_strip: true, legacy_table: null, legacy_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
  };
}
function row(id: string, over: Partial<MenuItem> = {}): MenuItem {
  return {
    id, channel: 'web', parent_id: null, kind: 'node', node_id: null, label_ar: null, label_en: null, url: null, sort_order: 0,
    visible: true, auto_children: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
  };
}

// قسم ← سلسلة ← تصنيف؛ سلسلة برا؛ سلسلة تانية مالهاش صف
const nodes = [
  node('sec', { type: 'section', name_ar: 'قسم' }),
  node('ser', { type: 'series', parent_id: 'sec', name_ar: 'سلسلة جوه' }),
  node('cat', { parent_id: 'ser', name_ar: 'تصنيف' }),
  node('lonely', { type: 'series', name_ar: 'سلسلة برا' }),
  node('empty', { type: 'series', name_ar: 'فاضية' }),
  node('off', { type: 'series', name_ar: 'مخفية', is_active: false }),
  node('nobody', { type: 'series', name_ar: 'من غير صف' }),
];
const counts = new Map([['sec', { total: 5 }], ['ser', { total: 5 }], ['cat', { total: 5 }], ['lonely', { total: 3 }], ['empty', { total: 0 }], ['off', { total: 2 }], ['nobody', { total: 3 }]]);

const items = [
  row('m-home', { kind: 'home', sort_order: 0 }),
  row('m-sec', { node_id: 'sec', auto_children: true, sort_order: 1 }),
  row('m-lonely', { node_id: 'lonely', sort_order: 2 }),
  row('m-empty', { node_id: 'empty', sort_order: 3 }),
  row('m-off', { node_id: 'off', sort_order: 4 }),
  row('m-contact', { kind: 'contact', sort_order: 5 }),
];
const menu = resolveMenu(items, nodes, 'web');

describe('headerStatuses', () => {
  const status = headerStatuses(menu, nodes, counts);

  it('a node with its own row is on the strip; one filled in below it sits inside it', () => {
    expect(status.get('sec')).toEqual({ state: 'in', path: [] });
    expect(status.get('lonely')).toEqual({ state: 'in', path: [] });
    expect(status.get('ser')).toEqual({ state: 'in', path: ['قسم'] });
    expect(status.get('cat')).toEqual({ state: 'in', path: ['قسم', 'سلسلة جوه'] });
  });
  it('a node with no row is not there, and says so', () => {
    expect(status.get('nobody')).toEqual({ state: 'none' });
    expect(headerStatusLabel({ state: 'none' })).toBe('مش في الهيدر');
    expect(headerStatusHint({ state: 'none' })).toContain('خريطة العرض');
  });
  it('a row for a node with no books and nothing below is left out by the header', () => {
    expect(status.get('empty')).toEqual({ state: 'empty' });
  });
  it('a node switched off for the website is left out even with a row', () => {
    expect(status.get('off')).toEqual({ state: 'node-hidden' });
  });
  it('a switched-off row hides itself and everything inside it', () => {
    const hiddenSec = resolveMenu(items.map((i) => (i.id === 'm-sec' ? { ...i, visible: false } : i)), nodes, 'web');
    const hidden = headerStatuses(hiddenSec, nodes, counts);
    expect(hidden.get('sec')).toEqual({ state: 'row-hidden' });
    // the series below only had the automatic entry, which is inside the hidden row: it is not drawn but has no stored row of its own
    expect(hidden.get('ser')?.state).toBe('row-hidden');
    expect(hidden.get('cat')?.state).toBe('row-hidden');
  });
  it('a node outside its dates is hidden from the website', () => {
    const later = [node('sched', { type: 'series', starts_at: '2099-01-01T00:00:00Z' })];
    const menuSched = resolveMenu([row('m', { node_id: 'sched' })], later, 'web');
    expect(headerStatuses(menuSched, later, new Map([['sched', { total: 1 }]])).get('sched')).toEqual({ state: 'node-hidden' });
  });
  it('without counts (still loading) an empty node is kept, not guessed away', () => {
    expect(headerStatuses(menu, nodes).get('empty')).toEqual({ state: 'in', path: [] });
  });
});

describe('headerView', () => {
  it('draws the strip the way the header does', () => {
    const view = headerView(menu, nodes, counts);
    expect(view.map((e) => e.label)).toEqual(['الرئيسية', 'قسم', 'سلسلة برا', 'تواصل معنا']);
    const sec = view.find((e) => e.label === 'قسم')!;
    expect(sec.children.map((c) => c.label)).toEqual(['سلسلة جوه']);
    expect(sec.children[0].children.map((c) => c.label)).toEqual(['تصنيف']);
  });
  it('a group with nothing drawn inside it is left out, and one with something is kept', () => {
    const groupItems = [row('g', { kind: 'group', label_ar: 'مجموعة' }), row('g-lonely', { parent_id: 'g', node_id: 'lonely' }), row('g2', { kind: 'group', label_ar: 'فاضية', sort_order: 1 }), row('g2-off', { parent_id: 'g2', node_id: 'off' })];
    const view = headerView(resolveMenu(groupItems, nodes, 'web'), nodes, counts);
    expect(view.map((e) => e.label)).toEqual(['مجموعة']);
  });
  it('a link without an address is left out', () => {
    const view = headerView(resolveMenu([row('l', { kind: 'link', label_ar: 'رابط', url: null }), row('l2', { kind: 'link', label_ar: 'سليم', url: '/x', sort_order: 1 })], nodes, 'web'), nodes, counts);
    expect(view.map((e) => e.label)).toEqual(['سليم']);
  });
});
