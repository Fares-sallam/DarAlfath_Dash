import { supabase } from '@/lib/supabase';
import { makeSection, type ReportDocument, type Tone } from '../types';
import { fetchAllPages } from '../download';
import { scopeMeta, filterMeta, type ReportScope } from './common';
import {
  ACTIVITY_REPORT_TITLE, ACTIVITY_VIEW, ACTIVITY_VIEW_COLUMNS, withActorProfile, type ActivityKind, type ActivityViewRow,
} from '@/lib/activityKind';

export interface ActivityLogRow {
  id: string;
  user_id?: string | null;
  user_email?: string | null;
  action: string;
  table_name?: string | null;
  record_id?: string | null;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  ip_address?: string | null;
  created_at: string;
  profiles?: { full_name?: string | null } | null;
}

type UserAgg = { name: string; email: string; counts: Record<string, number>; total: number; last: string };
type TableAgg = { name: string; counts: Record<string, number>; total: number };

const ACTION_TONE: Record<string, Tone> = { INSERT: 'good', UPDATE: 'warn', DELETE: 'bad', LOGIN: 'info', LOGOUT: 'muted' };

async function fetchLogs(scope: ReportScope, kind: ActivityKind): Promise<ActivityLogRow[]> {
  const page = (from: number, to: number) => {
    let q = supabase.from(ACTIVITY_VIEW).select(ACTIVITY_VIEW_COLUMNS).eq('actor_kind', kind);
    if (scope.period.from) q = q.gte('created_at', scope.period.from.toISOString());
    if (scope.period.to) q = q.lte('created_at', scope.period.to.toISOString());
    return q.order('created_at', { ascending: false }).order('id').range(from, to) as unknown as PromiseLike<{ data: (ActivityLogRow & ActivityViewRow)[] | null; error: { message: string } | null }>;
  };
  const rows = await fetchAllPages(page);
  return rows.map((row) => withActorProfile(row) as ActivityLogRow);
}

function changedFields(log: ActivityLogRow): string {
  if (!log.old_data || !log.new_data) return '';
  const keys = new Set([...Object.keys(log.old_data), ...Object.keys(log.new_data)]);
  const changed = [...keys].filter(
    (k) => k !== 'updated_at' && JSON.stringify(log.old_data?.[k]) !== JSON.stringify(log.new_data?.[k])
  );
  const text = changed.join('، ');
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
}

export async function buildActivityReport(
  scope: ReportScope,
  opts: {
    /** whose log this is: the staff's (with the system) or the customers' */
    kind: ActivityKind;
    actionLabel: (action: string) => string;
    tableLabel: (table?: string | null) => string;
    /** Country scoping and (when requested) the page's own filters. */
    predicate: (log: ActivityLogRow) => boolean;
    applyFilters: boolean;
    filtersLabel?: string;
  }
): Promise<ReportDocument> {
  const logs = (await fetchLogs(scope, opts.kind)).filter(opts.predicate);
  const who = (l: ActivityLogRow) => l.profiles?.full_name || l.user_email || 'النظام';

  const byUser = new Map<string, UserAgg>();
  const byTable = new Map<string, TableAgg>();
  for (const l of logs) {
    const key = l.user_id ?? l.user_email ?? 'system';
    const u = byUser.get(key) ?? { name: who(l), email: l.user_email ?? '', counts: {}, total: 0, last: '' };
    u.counts[l.action] = (u.counts[l.action] ?? 0) + 1;
    u.total += 1;
    if (l.created_at > u.last) u.last = l.created_at;
    byUser.set(key, u);

    const tName = opts.tableLabel(l.table_name);
    const t = byTable.get(tName) ?? { name: tName, counts: {}, total: 0 };
    t.counts[l.action] = (t.counts[l.action] ?? 0) + 1;
    t.total += 1;
    byTable.set(tName, t);
  }

  const n = (action: string) => logs.filter((l) => l.action === action).length;
  const actionCols = <R extends { counts: Record<string, number> }>() =>
    ['INSERT', 'UPDATE', 'DELETE'].map((a) => ({
      header: opts.actionLabel(a),
      type: 'number' as const,
      total: 'sum' as const,
      value: (r: R) => r.counts[a] ?? 0,
    }));

  return {
    title: ACTIVITY_REPORT_TITLE[opts.kind].title,
    fileBase: ACTIVITY_REPORT_TITLE[opts.kind].fileBase,
    period: scope.period,
    generatedAt: scope.generatedAt,
    currencySymbol: scope.currencySymbol,
    landscape: true,
    meta: scopeMeta(scope, filterMeta(opts.applyFilters, opts.filtersLabel)).filter((m) => m.label !== 'العملة'),
    summary: [
      { label: 'إجمالي العمليات', value: logs.length, type: 'number' },
      { label: 'إضافة', value: n('INSERT'), type: 'number', tone: 'good' },
      { label: 'تعديل', value: n('UPDATE'), type: 'number', tone: 'warn' },
      { label: 'حذف', value: n('DELETE'), type: 'number', tone: n('DELETE') ? 'bad' : undefined },
      { label: 'تسجيل دخول', value: n('LOGIN'), type: 'number', tone: 'info' },
      { label: 'المستخدمون', value: byUser.size, type: 'number' },
    ],
    sections: [
      makeSection('السجل التفصيلي', [
        { header: 'التاريخ والوقت', type: 'datetime', value: (l) => l.created_at },
        { header: 'المستخدم', value: who, width: 24 },
        { header: 'البريد', value: (l) => l.user_email ?? '', width: 26 },
        { header: 'الإجراء', value: (l) => opts.actionLabel(l.action), tone: (l) => ACTION_TONE[l.action] },
        { header: 'القسم', value: (l) => opts.tableLabel(l.table_name) },
        { header: 'رقم السجل', value: (l) => l.record_id ?? '', width: 24 },
        { header: 'الحقول المعدلة', value: changedFields, width: 36 },
        { header: 'عنوان IP', value: (l) => String(l.ip_address ?? '') },
      ], logs, { emptyText: 'لا توجد عمليات في هذه الفترة' }),
      makeSection('النشاط حسب المستخدم', [
        { header: 'المستخدم', value: (u) => u.name, width: 24 },
        { header: 'البريد', value: (u) => u.email, width: 26 },
        ...actionCols<UserAgg>(),
        { header: 'الإجمالي', type: 'number', total: 'sum', value: (u) => u.total },
        { header: 'آخر نشاط', type: 'datetime', value: (u) => u.last },
      ], [...byUser.values()].sort((a, b) => b.total - a.total)),
      makeSection('النشاط حسب القسم', [
        { header: 'القسم', value: (t) => t.name },
        ...actionCols<TableAgg>(),
        { header: 'الإجمالي', type: 'number', total: 'sum', value: (t) => t.total },
      ], [...byTable.values()].sort((a, b) => b.total - a.total)),
    ],
    notes: ['«الحقول المعدلة» تظهر لعمليات التعديل فقط، بدون حقل وقت التحديث.'],
  };
}
