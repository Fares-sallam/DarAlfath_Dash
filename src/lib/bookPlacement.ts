// Where a book sits in the catalog tree, in the order the owner reads it: its section (when the series or category it is
// filed under sits inside one), then the primary category, then the extra categories, then its series. Pure helpers for the
// «السلاسل والتصنيفات» books tab; no React, no Supabase.
import type { CatalogNode, ProductLink } from './catalogTree';

export interface BookPlacement {
  /** every section the book sits under (its own node or any node above it), outermost first, no repeats */
  sections: CatalogNode[];
  /** the one category the book is mainly filed under */
  primary: CatalogNode | null;
  /** the other categories and collections it also shows in (never the primary) */
  extras: CatalogNode[];
  /** series it is linked to directly */
  series: CatalogNode[];
  /** series that sit above one of its categories without the book being linked to them */
  inheritedSeries: CatalogNode[];
}

export function indexNodes(nodes: readonly CatalogNode[]): Map<string, CatalogNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

/** From the root down to (not including) the node; bad data (a loop, a missing parent) stops the walk instead of looping. */
function ancestorChain(byId: ReadonlyMap<string, CatalogNode>, node: CatalogNode): CatalogNode[] {
  const out: CatalogNode[] = [];
  const seen = new Set<string>([node.id]);
  let cursor = node.parent_id;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const parent = byId.get(cursor);
    if (!parent) break;
    out.unshift(parent);
    cursor = parent.parent_id;
  }
  return out;
}

function pushUnique(list: CatalogNode[], node: CatalogNode) {
  if (!list.some((n) => n.id === node.id)) list.push(node);
}

export function bookPlacement(links: readonly ProductLink[], byId: ReadonlyMap<string, CatalogNode>): BookPlacement {
  const linked = links
    .map((link) => ({ link, node: byId.get(link.node_id) }))
    .filter((x): x is { link: ProductLink; node: CatalogNode } => !!x.node);

  const primary = linked.find((x) => x.link.is_primary)?.node ?? null;
  const series = linked.filter((x) => x.node.type === 'series').map((x) => x.node);
  const extras = linked
    .filter((x) => !x.link.is_primary && x.node.type !== 'series' && x.node.type !== 'section')
    .map((x) => x.node);

  // the primary category's place comes first, so a book filed under one section reads that section first
  const inOrder = [...(primary ? [primary] : []), ...extras, ...series, ...linked.filter((x) => x.node.type === 'section').map((x) => x.node)];
  const sections: CatalogNode[] = [];
  const inheritedSeries: CatalogNode[] = [];
  for (const node of inOrder) {
    const chain = ancestorChain(byId, node);
    for (const above of [...chain, node]) {
      if (above.type === 'section') pushUnique(sections, above);
    }
    if (node.type !== 'series') {
      for (const above of chain) {
        if (above.type === 'series' && !series.some((s) => s.id === above.id)) pushUnique(inheritedSeries, above);
      }
    }
  }
  return { sections, primary, extras, series, inheritedSeries };
}

/** True when the book is linked to the node itself or to anything inside it (a section holds the series and categories under it). */
export function bookInNode(links: readonly ProductLink[], byId: ReadonlyMap<string, CatalogNode>, nodeId: string): boolean {
  for (const link of links) {
    if (link.node_id === nodeId) return true;
    const node = byId.get(link.node_id);
    if (node && ancestorChain(byId, node).some((a) => a.id === nodeId)) return true;
  }
  return false;
}
