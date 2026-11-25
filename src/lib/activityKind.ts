// «سجل النشاط» is two logs: what the staff (and the system by itself) did, and what customers did. The split is made by the
// database view `audit_logs_by_kind` (see supabase/migrations/20261207_audit_logs_by_kind.sql); this file holds what the page and
// the report share: the kinds, their labels, and turning a view row into the row shape the page draws.

export type ActivityKind = 'staff' | 'customer';

export const ACTIVITY_KINDS: readonly ActivityKind[] = ['staff', 'customer'];

export const ACTIVITY_KIND_LABEL: Record<ActivityKind, string> = {
  staff: 'المشرفين والنظام',
  customer: 'العملاء',
};

export const ACTIVITY_KIND_HINT: Record<ActivityKind, string> = {
  staff: 'اللي عمله المشرفين ومالك النظام، وكمان العمليات التلقائية اللي مش مرتبطة بحساب عميل (زي المخزون والإعدادات).',
  customer: 'تسجيل العملاء وتعديل بياناتهم وطلباتهم، بما فيها اللي النظام بيسجّله تلقائي على حساب العميل.',
};

export const ACTIVITY_REPORT_TITLE: Record<ActivityKind, { title: string; fileBase: string }> = {
  staff: { title: 'تقرير سجل نشاط المشرفين', fileBase: 'تقرير-سجل-نشاط-المشرفين' },
  customer: { title: 'تقرير سجل نشاط العملاء', fileBase: 'تقرير-سجل-نشاط-العملاء' },
};

/** The kind named in the page's address (`?kind=customer`); anything else is the staff log. */
export function parseActivityKind(value: string | null | undefined): ActivityKind {
  return value === 'customer' ? 'customer' : 'staff';
}

/** The view's columns, in the order the page and the report ask for them. */
export const ACTIVITY_VIEW = 'audit_logs_by_kind';
export const ACTIVITY_VIEW_COLUMNS =
  'id, user_id, user_email, action, table_name, record_id, old_data, new_data, ip_address, created_at, actor_name, actor_avatar, actor_role';

export interface ActivityViewRow {
  actor_name?: string | null;
  actor_avatar?: string | null;
  actor_role?: string | null;
  user_id?: string | null;
}

/**
 * A view row as the page's row shape: the actor's name, picture and role move under `profiles` (null when the row has no actor,
 * the same as the old embedded join gave). A name with no account behind it (a guest order: «اسم العميل (ضيف)») is an actor too.
 */
export function withActorProfile<T extends ActivityViewRow>(
  row: T,
): Omit<T, 'actor_name' | 'actor_avatar' | 'actor_role'> & { profiles: { full_name: string | null; avatar_url: string | null; role?: string } | null } {
  const { actor_name, actor_avatar, actor_role, ...rest } = row;
  const hasActor = actor_name != null || (!!row.user_id && (actor_avatar != null || actor_role != null));
  return {
    ...rest,
    profiles: hasActor ? { full_name: actor_name ?? null, avatar_url: actor_avatar ?? null, ...(actor_role ? { role: actor_role } : {}) } : null,
  };
}
