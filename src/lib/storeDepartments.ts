// The cards of «أقسام المتجر» on the website's home page: chosen from the catalog tree's existing nodes, in an order, each with
// its picture. Pure helpers for the dashboard tab (no React, no Supabase).
import { nodeStatus, type CatalogNode, type NodeCounts } from './catalogTree';

/** What is being edited: the ids in order, and the pictures changed so far (null = the picture is taken off). */
export interface DepartmentsDraft {
  ids: string[];
  images: Record<string, string | null>;
}

export type DepartmentIssue = 'missing' | 'inactive' | 'hidden-web' | 'out-of-dates' | 'empty' | null;

/** Why a chosen card is not drawn on the website right now (null = it is). */
export function departmentIssue(node: CatalogNode | undefined, count: Pick<NodeCounts, 'total'> | undefined, now: Date = new Date()): DepartmentIssue {
  if (!node) return 'missing';
  if (!node.is_active) return 'inactive';
  if (!node.show_web) return 'hidden-web';
  if (nodeStatus(node, now) !== 'visible') return 'out-of-dates';
  if (node.hide_when_empty && count && count.total === 0) return 'empty';
  return null;
}

export const DEPARTMENT_ISSUE_LABEL: Record<Exclude<DepartmentIssue, null>, string> = {
  missing: 'العنصر اتحذف',
  inactive: 'مقفول (مش ظاهر في الموقع)',
  'hidden-web': 'مخفي عن الموقع',
  'out-of-dates': 'خارج مواعيد ظهوره',
  empty: 'فاضي ومتظبط يختفي لما يفضى',
};

/** Has anything been changed: the list or its order, or a picture. */
export function departmentsChanged(saved: readonly string[], nodes: readonly CatalogNode[], draft: DepartmentsDraft | null): boolean {
  if (!draft) return false;
  if (draft.ids.length !== saved.length || draft.ids.some((id, i) => id !== saved[i])) return true;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return Object.entries(draft.images).some(([id, url]) => (byId.get(id)?.image_url ?? null) !== url);
}

/** The pictures that really differ from what the nodes have (a picture put back to what it was is not a change). */
export function changedImages(nodes: readonly CatalogNode[], draft: DepartmentsDraft): Record<string, string | null> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: Record<string, string | null> = {};
  for (const [id, url] of Object.entries(draft.images)) {
    if (draft.ids.includes(id) && (byId.get(id)?.image_url ?? null) !== url) out[id] = url;
  }
  return out;
}

/** The nodes that can still be added: everything not already a card, matching what was typed, in the tree's reading order. */
export function addableNodes(ordered: readonly CatalogNode[], ids: readonly string[], query: string): CatalogNode[] {
  const taken = new Set(ids);
  const q = query.trim().toLowerCase();
  return ordered.filter((n) => !taken.has(n.id) && (!q || `${n.name_ar} ${n.name_en ?? ''}`.toLowerCase().includes(q)));
}
