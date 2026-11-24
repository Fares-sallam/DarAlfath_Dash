// The cards of «أقسام المتجر» on the website's home page: chosen from the catalog tree's existing nodes, in an order, each with
// its picture. Pure helpers for the dashboard tab (no React, no Supabase).
import { nodeStatus, type CatalogNode, type NodeCounts } from './catalogTree';

/** What is being edited: the ids in order, and the pictures changed so far (null = the picture is taken off). */
export interface DepartmentsDraft {
  ids: string[];
  images: Record<string, string | null>;
}

export type DepartmentIssue = 'missing' | 'inactive' | 'hidden-web' | 'hidden-app' | 'out-of-dates' | 'empty' | null;
export type DepartmentChannel = 'web' | 'app';

/**
 * Why a chosen card is not drawn on one channel right now (null = it is). The website hides an empty node only when the node
 * is set to; the app always leaves out a card that has no book it shows.
 */
export function departmentIssue(
  node: CatalogNode | undefined,
  count: Pick<NodeCounts, 'total'> | undefined,
  channel: DepartmentChannel = 'web',
  now: Date = new Date(),
): DepartmentIssue {
  if (!node) return 'missing';
  if (!node.is_active) return 'inactive';
  if (channel === 'web' ? !node.show_web : !node.show_app) return channel === 'web' ? 'hidden-web' : 'hidden-app';
  if (nodeStatus(node, now) !== 'visible') return 'out-of-dates';
  if (count && count.total === 0 && (channel === 'app' || node.hide_when_empty)) return 'empty';
  return null;
}

export const DEPARTMENT_ISSUE_LABEL: Record<Exclude<DepartmentIssue, null>, string> = {
  missing: 'العنصر اتحذف',
  inactive: 'مقفول',
  'hidden-web': 'مخفي عن الموقع',
  'hidden-app': 'مخفي عن التطبيق',
  'out-of-dates': 'خارج مواعيد ظهوره',
  empty: 'فاضي ومتظبط يختفي لما يفضى',
};

export interface DepartmentIssueChip {
  key: string;
  label: string;
  /** the tooltip: where the card is not drawn */
  title: string;
}

/**
 * The warnings to show on a chosen card: one chip when the same thing keeps it off both the website and the app, otherwise one
 * per channel that has a problem, each saying which channel it is. Nothing when it is drawn on both.
 */
export function departmentIssueChips(node: CatalogNode | undefined, count: Pick<NodeCounts, 'total'> | undefined, now: Date = new Date()): DepartmentIssueChip[] {
  const web = departmentIssue(node, count, 'web', now);
  const app = departmentIssue(node, count, 'app', now);
  if (web && web === app) return [{ key: 'both', label: DEPARTMENT_ISSUE_LABEL[web], title: 'الكارت ده مش بيظهر في الموقع ولا في التطبيق دلوقتي' }];
  const chips: DepartmentIssueChip[] = [];
  // «مخفي عن الموقع/التطبيق» already names its channel; every other reason is prefixed so it is clear where it applies
  const text = (issue: Exclude<DepartmentIssue, null>, channelName: string) =>
    issue === 'hidden-web' || issue === 'hidden-app' ? DEPARTMENT_ISSUE_LABEL[issue] : `${channelName}: ${DEPARTMENT_ISSUE_LABEL[issue]}`;
  if (web) chips.push({ key: 'web', label: text(web, 'الموقع'), title: 'الكارت ده مش بيظهر في الموقع دلوقتي' });
  if (app) chips.push({ key: 'app', label: text(app, 'التطبيق'), title: 'الكارت ده مش بيظهر في التطبيق دلوقتي (في النسخة الجاية منه)' });
  return chips;
}

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
