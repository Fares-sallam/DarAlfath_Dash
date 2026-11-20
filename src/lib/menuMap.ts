// The website's top menu as the dashboard edits it: main items and sub-items (two levels), each linked to a page,
// a catalog node, a custom link, or a heading that groups sub-items. A main item linked to a node can fill its
// sub-items automatically from the node's children; a manual row for the same child (hidden, re-ordered)
// wins over the automatic one. Pure helpers; no React, no Supabase.
import type { CatalogNode } from '@/lib/catalogTree';

export type MenuKind = 'home' | 'books' | 'contact' | 'node' | 'link' | 'group';
export type MenuChannel = 'web' | 'app';

export interface MenuItem {
  id: string;
  channel: MenuChannel;
  parent_id: string | null;
  kind: MenuKind;
  node_id: string | null;
  label_ar: string | null;
  label_en: string | null;
  url: string | null;
  sort_order: number;
  visible: boolean;
  auto_children: boolean;
  created_at: string;
  updated_at: string;
}

export const MENU_KIND_LABELS: Record<MenuKind, string> = {
  home: 'الرئيسية',
  books: 'الكتب',
  contact: 'تواصل معنا',
  node: 'من السلاسل والتصنيفات',
  link: 'رابط',
  group: 'عنوان يجمّع فروع',
};

const FIXED_LABELS: Partial<Record<MenuKind, string>> = { home: 'الرئيسية', books: 'الكتب', contact: 'تواصل معنا' };

export interface ResolvedMenuItem {
  /** the stored row, or null for a sub-item that is filled automatically from the tree */
  item: MenuItem | null;
  /** a stable key for lists */
  key: string;
  kind: MenuKind;
  nodeId: string | null;
  label: string;
  visible: boolean;
  auto: boolean;
  /** the main item this one sits inside (null for a main item) */
  parent: ResolvedMenuItem | null;
  children: ResolvedMenuItem[];
}

export function itemLabel(item: Pick<MenuItem, 'kind' | 'node_id' | 'label_ar'>, nodes: readonly CatalogNode[]): string {
  const own = item.label_ar?.trim();
  if (own) return own;
  if (item.kind === 'node') return nodes.find((n) => n.id === item.node_id)?.name_ar ?? 'عنصر محذوف';
  return FIXED_LABELS[item.kind] ?? '';
}

const bySort = (a: MenuItem, b: MenuItem) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);

/** The menu as the website draws it: main items, each with its sub-items (manual first, then the automatic ones). */
export function resolveMenu(items: readonly MenuItem[], nodes: readonly CatalogNode[], channel: MenuChannel = 'web'): ResolvedMenuItem[] {
  const inChannel = items.filter((i) => i.channel === channel);
  const mains = inChannel.filter((i) => i.parent_id === null).sort(bySort);

  return mains.map((main) => {
    const resolvedMain: ResolvedMenuItem = {
      item: main, key: main.id, kind: main.kind, nodeId: main.node_id, label: itemLabel(main, nodes),
      visible: main.visible, auto: false, parent: null, children: [],
    };

    const manual = inChannel.filter((i) => i.parent_id === main.id).sort(bySort);
    const subs: ResolvedMenuItem[] = manual.map((sub) => ({
      item: sub, key: sub.id, kind: sub.kind, nodeId: sub.node_id, label: itemLabel(sub, nodes),
      visible: sub.visible, auto: false, parent: resolvedMain, children: [],
    }));

    if (main.auto_children && main.node_id) {
      const represented = new Set(manual.map((m) => m.node_id).filter(Boolean));
      const autoChildren = nodes
        .filter((n) => n.parent_id === main.node_id && n.is_active && !represented.has(n.id))
        .sort((a, b) => a.sort_web - b.sort_web || a.name_ar.localeCompare(b.name_ar, 'ar'));
      for (const child of autoChildren) {
        subs.push({
          item: null, key: `auto-${main.id}-${child.id}`, kind: 'node', nodeId: child.id, label: child.name_ar,
          visible: true, auto: true, parent: resolvedMain, children: [],
        });
      }
    }
    resolvedMain.children = subs;
    return resolvedMain;
  });
}

/** Why an item cannot be placed inside `parentId`, or null when it can (null parent = make it a main item). */
export function placementProblem(items: readonly MenuItem[], id: string, parentId: string | null): string | null {
  if (parentId === null) return null;
  if (parentId === id) return 'مينفعش العنصر يبقى جوه نفسه.';
  const parent = items.find((i) => i.id === parentId);
  if (!parent) return 'العنصر الرئيسي مش موجود.';
  if (parent.parent_id !== null) return 'القايمة مستويين بس (رئيسي وفرعي): مينفعش فرعي جوه فرعي.';
  if (items.some((i) => i.parent_id === id)) return 'العنصر ده جواه فروع. انقل فروعه الأول، القايمة مستويين بس.';
  return null;
}

/** The sibling ids after moving one step, or null when it cannot move. */
export function moveWithinParent(items: readonly MenuItem[], id: string, direction: -1 | 1): string[] | null {
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  const siblings = items.filter((i) => i.channel === item.channel && i.parent_id === item.parent_id).sort(bySort);
  const index = siblings.findIndex((i) => i.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= siblings.length) return null;
  const ids = siblings.map((i) => i.id);
  [ids[index], ids[target]] = [ids[target], ids[index]];
  return ids;
}

/** Where an item sits, in words: "رئيسي" or "فرعي داخل: X". */
export function placementText(entry: ResolvedMenuItem): string {
  return entry.parent ? `فرعي داخل: ${entry.parent.label}` : 'رئيسي';
}

/** The next free position inside a parent (or among the main items). */
export function nextMenuSort(items: readonly MenuItem[], channel: MenuChannel, parentId: string | null): number {
  const orders = items.filter((i) => i.channel === channel && i.parent_id === parentId).map((i) => i.sort_order);
  return orders.length === 0 ? 0 : Math.max(...orders) + 1;
}

/** A link a person typed: it must be a page of the site (starting with /) or an https address. */
export function validMenuUrl(url: string): boolean {
  const value = url.trim();
  return /^\/(?!\/)/.test(value) || /^https:\/\/\S+$/i.test(value);
}
