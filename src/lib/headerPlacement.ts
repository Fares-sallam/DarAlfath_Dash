// Whether a catalog node shows in the website's top menu (the header strip), and if not, why. The header is not read from the
// tree: it is built from the menu rows of «خريطة العرض», so a series that has no row there never appears. These helpers mirror
// the rules the storefront's header applies (a switched-off row hides everything inside it; a node the website hides, or one with
// no books and nothing below it, is left out) so the tree can say it. Pure, no React, no Supabase.
import { nodeStatus, type CatalogNode, type NodeCounts } from './catalogTree';
import { flattenMenu, placementPath, type MenuKind, type ResolvedMenuItem } from './menuMap';

export interface HeaderEntry {
  key: string;
  label: string;
  kind: MenuKind;
  nodeId: string | null;
  /** names of the items it sits inside, outermost first (empty for a main item) */
  path: string[];
  children: HeaderEntry[];
}

export type HeaderStatus =
  /** drawn in the header; `path` is what it sits inside ([] = on the strip itself) */
  | { state: 'in'; path: string[] }
  /** a menu row points at it, but that row (or one it sits inside) is switched off */
  | { state: 'row-hidden' }
  /** a menu row points at it, but the node is switched off for the website (hidden, or outside its dates) */
  | { state: 'node-hidden' }
  /** a menu row points at it, but it holds no books and has nothing below it */
  | { state: 'empty' }
  /** no menu row points at it */
  | { state: 'none' };

/** The website draws a node only while it is switched on and inside its dates. */
export function shownOnWeb(node: CatalogNode, now: Date = new Date()): boolean {
  return node.is_active && node.show_web && nodeStatus(node, now) === 'visible';
}

function rowVisible(entry: ResolvedMenuItem): boolean {
  return entry.visible && (!entry.parent || rowVisible(entry.parent));
}

/** The menu as the header draws it. Without counts (not loaded yet) an empty node is kept rather than guessed away. */
export function headerView(
  menu: readonly ResolvedMenuItem[],
  nodes: readonly CatalogNode[],
  counts?: ReadonlyMap<string, Pick<NodeCounts, 'total'>>,
  now: Date = new Date(),
): HeaderEntry[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const build = (entry: ResolvedMenuItem): HeaderEntry | null => {
    if (!entry.visible) return null;
    const children = entry.children.map(build).filter((c): c is HeaderEntry => c !== null);
    const base = { key: entry.key, label: entry.label, kind: entry.kind, nodeId: entry.nodeId, path: placementPath(entry), children };
    if (entry.kind === 'group') return children.length > 0 ? base : null;
    if (entry.kind === 'node') {
      const node = entry.nodeId ? byId.get(entry.nodeId) : undefined;
      if (!node || !shownOnWeb(node, now)) return null;
      if (counts && (counts.get(node.id)?.total ?? 0) === 0 && children.length === 0) return null;
      return base;
    }
    if (entry.kind === 'link') return entry.item?.url?.trim() ? base : null;
    return base;
  };
  return menu.map(build).filter((e): e is HeaderEntry => e !== null);
}

function walk(entries: readonly HeaderEntry[], visit: (entry: HeaderEntry) => void) {
  for (const entry of entries) {
    visit(entry);
    walk(entry.children, visit);
  }
}

/** One status for every node of the catalog. */
export function headerStatuses(
  menu: readonly ResolvedMenuItem[],
  nodes: readonly CatalogNode[],
  counts?: ReadonlyMap<string, Pick<NodeCounts, 'total'>>,
  now: Date = new Date(),
): Map<string, HeaderStatus> {
  const view = headerView(menu, nodes, counts, now);
  const shown = new Map<string, HeaderEntry>(); // the first drawn entry of each node
  walk(view, (entry) => {
    if (entry.nodeId && !shown.has(entry.nodeId)) shown.set(entry.nodeId, entry);
  });
  const shownKeys = new Set<string>();
  walk(view, (entry) => shownKeys.add(entry.key));

  const rows = new Map<string, ResolvedMenuItem[]>();
  for (const entry of flattenMenu(menu)) {
    if (entry.kind !== 'node' || !entry.nodeId) continue;
    rows.set(entry.nodeId, [...(rows.get(entry.nodeId) ?? []), entry]);
  }

  const out = new Map<string, HeaderStatus>();
  for (const node of nodes) {
    const entry = shown.get(node.id);
    if (entry) {
      out.set(node.id, { state: 'in', path: entry.path });
      continue;
    }
    const mine = rows.get(node.id);
    if (!mine || mine.length === 0) {
      out.set(node.id, { state: 'none' });
    } else if (!mine.some(rowVisible)) {
      out.set(node.id, { state: 'row-hidden' });
    } else if (!shownOnWeb(node, now)) {
      out.set(node.id, { state: 'node-hidden' });
    } else {
      out.set(node.id, { state: 'empty' });
    }
  }
  return out;
}

/** Plain words for a status, as the tree's badge says it. */
export function headerStatusLabel(status: HeaderStatus): string {
  switch (status.state) {
    case 'in': return status.path.length === 0 ? 'في الهيدر' : `في الهيدر ‹ ${status.path[status.path.length - 1]}`;
    case 'row-hidden': return 'مخفي من الهيدر';
    case 'node-hidden': return 'مخفي عن الموقع';
    case 'empty': return 'فاضي: مش بيظهر';
    case 'none': return 'مش في الهيدر';
  }
}

/** Why a node is not drawn, for the badge's tooltip (and what to do about it). */
export function headerStatusHint(status: HeaderStatus): string {
  switch (status.state) {
    case 'in': return status.path.length === 0 ? 'بيظهر على الشريط نفسه.' : `بيظهر في قايمة: ${status.path.join(' ‹ ')}`;
    case 'row-hidden': return 'ليه صف في «خريطة العرض» لكنه (أو اللي فوقه) مقفول. فعّل «إظهار» هناك.';
    case 'node-hidden': return 'ليه صف في «خريطة العرض» لكن العنصر نفسه مخفي عن الموقع (أو خارج تواريخه).';
    case 'empty': return 'ليه صف في «خريطة العرض» لكن مفيهوش كتب ولا حاجة تحته، فالهيدر بيشيله.';
    case 'none': return 'مفيش صف ليه في «خريطة العرض»، فمش بيظهر على الشريط. اضغط «إضافة».';
  }
}
