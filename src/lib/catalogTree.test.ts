import { describe, expect, it } from 'vitest';
import {
  allowedParents, ancestorsOf, buildTree, childrenOf, descendantIds, healthIssues, homeShelfIssue, homeShelfNodes, moveWithinSiblings,
  nextSortFor, nodeFlags, nodeStatus, slugify, type CatalogNode, type NodeCounts, type ProductLink,
} from './catalogTree';

function node(id: string, over: Partial<CatalogNode> = {}): CatalogNode {
  return {
    id, parent_id: null, type: 'category', name_ar: id, name_en: null, slug: id, description_ar: null, description_en: null,
    image_url: null, icon: null, color: null, is_active: true, featured: false, show_web: true, show_app: true,
    sort_web: 0, sort_app: 0, show_in_menu_web: false, show_in_bar_web: true, show_in_bar_app: true, hide_when_empty: true,
    books_sort_web: 'manual', books_sort_app: 'manual', starts_at: null, ends_at: null, seo_title: null, seo_description: null, intro_ar: null, intro_en: null, video_url: null, page_layout: 'auto',
    strips_limit: 12, show_as_strip: true, legacy_table: null, legacy_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
  };
}

const tree: CatalogNode[] = [
  node('s1', { type: 'series', sort_web: 0, sort_app: 1 }),
  node('s2', { type: 'series', sort_web: 1, sort_app: 0 }),
  node('c1', { parent_id: 's1', sort_web: 3, sort_app: 3 }),
  node('c2', { parent_id: 's1', sort_web: 2, sort_app: 4 }),
  node('c3', { parent_id: 'c1', sort_web: 5, sort_app: 5 }),
];

describe('ordering by channel', () => {
  it('home shelf choices follow the selected channel, not the website switch', () => {
    const candidates = [
      node('web', { show_app: false }),
      node('app', { show_web: false }),
      node('hidden', { is_active: false }),
    ];
    expect(homeShelfNodes(candidates, 'web').map((n) => n.id)).toEqual(['web']);
    expect(homeShelfNodes(candidates, 'app').map((n) => n.id)).toEqual(['app']);
  });
  it('explains why a saved shelf cannot show on its channel', () => {
    const candidates = [
      node('web', { show_app: false }),
      node('app', { show_web: false }),
      node('off', { is_active: false }),
      node('empty'),
    ];
    const counts = new Map<string, NodeCounts>([['empty', { direct: 0, total: 0 }]]);
    expect(homeShelfIssue('gone', candidates, 'web', counts)).toBe('missing');
    expect(homeShelfIssue('off', candidates, 'web', counts)).toBe('inactive');
    expect(homeShelfIssue('web', candidates, 'app', counts)).toBe('hidden');
    expect(homeShelfIssue('app', candidates, 'app', counts)).toBeNull();
    expect(homeShelfIssue('empty', candidates, 'web', counts)).toBe('empty');
    expect(homeShelfIssue('empty', candidates, 'web')).toBeNull();
  });
  it('roots follow the chosen channel', () => {
    expect(childrenOf(tree, null, 'web').map((n) => n.id)).toEqual(['s1', 's2']);
    expect(childrenOf(tree, null, 'app').map((n) => n.id)).toEqual(['s2', 's1']);
  });
  it('children follow the chosen channel', () => {
    expect(childrenOf(tree, 's1', 'web').map((n) => n.id)).toEqual(['c2', 'c1']);
    expect(childrenOf(tree, 's1', 'app').map((n) => n.id)).toEqual(['c1', 'c2']);
  });
  it('"both" shows the website order', () => {
    expect(childrenOf(tree, null, 'both').map((n) => n.id)).toEqual(['s1', 's2']);
  });
});

describe('tree walking', () => {
  it('descendants include every level and never the node itself', () => {
    expect([...descendantIds(tree, 's1')].sort()).toEqual(['c1', 'c2', 'c3']);
    expect([...descendantIds(tree, 'c3')]).toEqual([]);
  });
  it('ancestors go from the root down', () => {
    expect(ancestorsOf(tree, 'c3').map((n) => n.id)).toEqual(['s1', 'c1']);
    expect(ancestorsOf(tree, 's1')).toEqual([]);
  });
  it('survives a loop in bad data', () => {
    const loop = [node('a', { parent_id: 'b' }), node('b', { parent_id: 'a' })];
    expect(descendantIds(loop, 'a').size).toBeLessThanOrEqual(2);
    expect(ancestorsOf(loop, 'a').length).toBeLessThanOrEqual(2);
  });
  it('a node can go anywhere except under itself or its descendants', () => {
    expect(allowedParents(tree, 's1').map((n) => n.id).sort()).toEqual(['s2']);
    expect(allowedParents(tree, 'c1').map((n) => n.id).sort()).toEqual(['c2', 's1', 's2']);
    expect(allowedParents(tree, null).length).toBe(tree.length);
  });
});

describe('buildTree', () => {
  it('shows only open branches', () => {
    expect(buildTree(tree, 'web', new Set()).map((r) => r.node.id)).toEqual(['s1', 's2']);
    expect(buildTree(tree, 'web', new Set(['s1'])).map((r) => [r.node.id, r.depth])).toEqual([['s1', 0], ['c2', 1], ['c1', 1], ['s2', 0]]);
    expect(buildTree(tree, 'web', new Set(['s1', 'c1'])).map((r) => r.node.id)).toEqual(['s1', 'c2', 'c1', 'c3', 's2']);
  });
  it('marks rows that have children', () => {
    const rows = buildTree(tree, 'web', new Set());
    expect(rows.find((r) => r.node.id === 's1')!.hasChildren).toBe(true);
    expect(rows.find((r) => r.node.id === 's2')!.hasChildren).toBe(false);
  });
  it('a search keeps matches with their parents, all open', () => {
    expect(buildTree(tree, 'web', new Set(), 'c3').map((r) => r.node.id)).toEqual(['s1', 'c1', 'c3']);
    expect(buildTree(tree, 'web', new Set(), 'nothing')).toEqual([]);
  });
  it('a node whose parent is unreadable is shown as a root', () => {
    expect(buildTree([node('x', { parent_id: 'gone' })], 'web', new Set()).map((r) => r.node.id)).toEqual(['x']);
  });
  it('keeps the path of names', () => {
    const rows = buildTree(tree, 'web', new Set(), 'c3');
    expect(rows.find((r) => r.node.id === 'c3')!.path).toEqual(['s1', 'c1']);
  });
});

describe('moving', () => {
  it('swaps with the neighbour', () => {
    const sibs = childrenOf(tree, 's1', 'web'); // c2, c1
    expect(moveWithinSiblings(sibs, 'c1', -1)).toEqual(['c1', 'c2']);
    expect(moveWithinSiblings(sibs, 'c2', 1)).toEqual(['c1', 'c2']);
  });
  it('cannot leave the list', () => {
    const sibs = childrenOf(tree, 's1', 'web');
    expect(moveWithinSiblings(sibs, 'c2', -1)).toBeNull();
    expect(moveWithinSiblings(sibs, 'c1', 1)).toBeNull();
    expect(moveWithinSiblings(sibs, 'zzz', 1)).toBeNull();
  });
  it('a new node goes after the last of its family', () => {
    expect(nextSortFor(tree, 'series', 'web')).toBe(2);
    expect(nextSortFor(tree, 'category', 'app')).toBe(6);
    expect(nextSortFor(tree, 'collection', 'web')).toBe(6);
    expect(nextSortFor([], 'series', 'web')).toBe(0);
  });
});

describe('slugify', () => {
  it('matches the database function', () => {
    expect(slugify('سلسلة الفتح الرباني')).toBe('سلسلة-الفتح-الرباني');
    expect(slugify('  Hello, World! ')).toBe('hello-world');
    expect(slugify('اللغة   العربية (جديد)')).toBe('اللغة-العربية-جديد');
    expect(slugify('!!!')).toBe('');
  });
});

describe('status and flags', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  it('is visible, hidden, scheduled or expired', () => {
    expect(nodeStatus(node('a'), now)).toBe('visible');
    expect(nodeStatus(node('a', { is_active: false }), now)).toBe('hidden');
    expect(nodeStatus(node('a', { starts_at: '2026-07-01T00:00:00Z' }), now)).toBe('scheduled');
    expect(nodeStatus(node('a', { ends_at: '2026-05-01T00:00:00Z' }), now)).toBe('expired');
  });
  it('lists the per-channel flags', () => {
    expect(nodeFlags(node('a', { featured: true, show_app: false }))).toEqual(['مميّز', 'مخفي عن التطبيق']);
    expect(nodeFlags(node('a', { is_active: false, show_web: false }))).toEqual([]);
  });
});

describe('health checks', () => {
  const nodes = [
    node('s1', { type: 'series', name_ar: 'إصدارات متنوعة' }),
    node('c1', { parent_id: 's1', name_ar: 'إصدارات متنوعة' }),
    node('c2', { name_ar: 'سلسلة النحو ' }),
    node('c3', { parent_id: 's1', name_ar: 'فاضي', is_active: false }),
  ];
  const links: ProductLink[] = [
    { product_id: 'p1', node_id: 'c1', is_primary: true, sort_order: 0 },
    { product_id: 'p1', node_id: 's1', is_primary: false, sort_order: 0 },
    { product_id: 'p2', node_id: 's1', is_primary: false, sort_order: 0 },
    { product_id: 'p4', node_id: 'c3', is_primary: true, sort_order: 0 },
  ];
  const products = [
    { id: 'p1', title: 'أ', is_active: true },
    { id: 'p2', title: 'ب', is_active: true },
    { id: 'p3', title: 'ج', is_active: false },
    { id: 'p4', title: 'د', is_active: true },
  ];
  const counts = new Map<string, NodeCounts>([
    ['s1', { direct: 2, total: 3 }], ['c1', { direct: 1, total: 1 }], ['c2', { direct: 0, total: 0 }], ['c3', { direct: 1, total: 1 }],
  ]);
  const issues = healthIssues(nodes, links, products, counts);
  const byId = Object.fromEntries(issues.map((i) => [i.id, i]));

  it('finds empty nodes', () => expect(byId['empty-nodes'].nodeIds).toEqual(['c2']));
  it('finds duplicate names across types', () => expect(byId['duplicate-names'].nodeIds.sort()).toEqual(['c1', 's1']));
  it('finds padded names', () => expect(byId['padded-names'].nodeIds).toEqual(['c2']));
  it('finds series-like category names', () => expect(byId['series-like-names'].nodeIds).toEqual(['c2']));
  it('finds root categories', () => expect(byId['orphan-categories'].nodeIds).toEqual(['c2']));
  it('finds hidden nodes that hold books', () => expect(byId['hidden-with-books'].nodeIds).toEqual(['c3']));
  it('finds active books with no primary category (inactive ones are ignored)', () => expect(byId['no-primary-category'].productIds).toEqual(['p2']));
  it('finds active books with no series', () => expect(byId['no-series'].productIds).toEqual(['p4']));
  it('reports nothing when everything is fine', () => {
    const fine = [node('s', { type: 'series' }), node('c', { parent_id: 's' })];
    const fineLinks: ProductLink[] = [
      { product_id: 'p', node_id: 'c', is_primary: true, sort_order: 0 },
      { product_id: 'p', node_id: 's', is_primary: false, sort_order: 0 },
    ];
    const fineCounts = new Map<string, NodeCounts>([['s', { direct: 1, total: 1 }], ['c', { direct: 1, total: 1 }]]);
    expect(healthIssues(fine, fineLinks, [{ id: 'p', title: 'x', is_active: true }], fineCounts)).toEqual([]);
  });
});
