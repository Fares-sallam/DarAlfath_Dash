// Merging two catalog items into one: which items can be merged with a given one, and what the merge will do (shown before it is
// done). Pure helpers for the tree's «دمج» dialog; the merge itself is one database call (catalog_merge_nodes).
import { descendantIds, type CatalogNode, type NodeType, type ProductLink } from './catalogTree';
import type { MenuItem } from './menuMap';

/** A category and a collection are the same kind of thing here (both are filed in the old categories table); the others stand alone. */
export function mergeGroup(type: NodeType): 'category' | 'series' | 'section' {
  return type === 'category' || type === 'collection' ? 'category' : type;
}

/** What `item` can be merged into: the same kind, not itself, and nothing that sits inside it. Alphabetical. */
export function mergeTargets(nodes: readonly CatalogNode[], item: CatalogNode): CatalogNode[] {
  const inside = descendantIds(nodes, item.id);
  return nodes
    .filter((n) => n.id !== item.id && mergeGroup(n.type) === mergeGroup(item.type) && !inside.has(n.id))
    .sort((a, b) => a.name_ar.localeCompare(b.name_ar, 'ar'));
}

export interface MergePreview {
  /** books that move to the surviving item */
  booksMoved: number;
  /** of those, the ones that have the vanishing item as their primary category (it becomes the surviving item) */
  primaryMoved: number;
  /** books already in both: they end up once, in the surviving item */
  booksInBoth: number;
  /** items sitting directly under the vanishing one, which move under the surviving one */
  children: number;
  /** header links that point at the vanishing item (they point at the surviving one afterwards) */
  menuItems: number;
  /** the vanishing item has a card in «أقسام المتجر» */
  inDepartments: boolean;
}

/** What merging `from` into `into` will do, counted from what the dashboard has already loaded. */
export function mergePreview(
  from: CatalogNode,
  into: CatalogNode,
  nodes: readonly CatalogNode[],
  links: readonly ProductLink[],
  menuItems: readonly MenuItem[],
  departmentIds: readonly string[],
): MergePreview {
  const inTarget = new Set(links.filter((l) => l.node_id === into.id).map((l) => l.product_id));
  const fromLinks = links.filter((l) => l.node_id === from.id);
  const both = fromLinks.filter((l) => inTarget.has(l.product_id));
  const moving = fromLinks.filter((l) => !inTarget.has(l.product_id));
  return {
    booksMoved: moving.length,
    primaryMoved: moving.filter((l) => l.is_primary).length,
    booksInBoth: both.length,
    children: nodes.filter((n) => n.parent_id === from.id).length,
    menuItems: menuItems.filter((m) => m.node_id === from.id).length,
    inDepartments: departmentIds.includes(from.id),
  };
}

export interface MergeResult {
  source_name: string;
  target_name: string;
  books_moved: number;
  books_already_in_target: number;
  children_moved: number;
  menu_items: number;
  home_blocks: number;
  departments: number;
}

/** The sentence shown after a merge. */
export function mergeSummary(r: MergeResult): string {
  const parts: string[] = [];
  const total = r.books_moved + r.books_already_in_target;
  if (total > 0) parts.push(`${total} كتاب في «${r.target_name}»`);
  if (r.children_moved > 0) parts.push(`${r.children_moved} عنصر تحته اتنقل`);
  return `تم دمج «${r.source_name}» في «${r.target_name}»${parts.length ? ': ' + parts.join('، ') : ''}`;
}
