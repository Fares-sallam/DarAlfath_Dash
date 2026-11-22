// Which columns a report shows, as the owner chooses them (the chips under «الأعمدة اللي تظهر في التقرير»). A report lists
// its columns in groups (one group per sheet); each column is on or off, with a standard. What the owner changed is kept as
// a small map of explicit decisions, so a column added to the report later simply follows its own standard.

export interface ColumnChoice {
  id: string;
  label: string;
  /** shown unless the owner turned it off */
  defaultOn: boolean;
  /** always shown (the column that says what the row is) */
  locked?: boolean;
  hint?: string;
}

export interface ColumnGroup {
  id: string;
  /** e.g. the sheet's name */
  title: string;
  /** the whole group (sheet) can be switched off */
  optional?: boolean;
  choices: readonly ColumnChoice[];
}

/** The owner's explicit decisions: `group.column` → on/off, and `group` → the sheet on/off. */
export type ColumnDecisions = Record<string, boolean>;

export interface ColumnSelection {
  [groupId: string]: { enabled: boolean; ids: ReadonlySet<string> };
}

const columnKey = (groupId: string, choiceId: string) => `${groupId}.${choiceId}`;

/** What each group shows, from the groups' standards and the owner's decisions. */
export function resolveSelection(groups: readonly ColumnGroup[], decisions: ColumnDecisions = {}): ColumnSelection {
  const out: ColumnSelection = {};
  for (const group of groups) {
    const enabled = group.optional ? decisions[group.id] ?? true : true;
    const ids = new Set<string>();
    for (const choice of group.choices) {
      if (choice.locked || (decisions[columnKey(group.id, choice.id)] ?? choice.defaultOn)) ids.add(choice.id);
    }
    out[group.id] = { enabled, ids };
  }
  return out;
}

/** The decisions after turning a column on or off (a locked column can't be turned off; going back to the standard forgets the decision). */
export function setColumn(groups: readonly ColumnGroup[], decisions: ColumnDecisions, groupId: string, choiceId: string, on: boolean): ColumnDecisions {
  const choice = groups.find((g) => g.id === groupId)?.choices.find((c) => c.id === choiceId);
  if (!choice || choice.locked) return decisions;
  const next = { ...decisions };
  const key = columnKey(groupId, choiceId);
  if (on === choice.defaultOn) delete next[key]; else next[key] = on;
  return next;
}

export function setGroupEnabled(groups: readonly ColumnGroup[], decisions: ColumnDecisions, groupId: string, on: boolean): ColumnDecisions {
  const group = groups.find((g) => g.id === groupId);
  if (!group?.optional) return decisions;
  const next = { ...decisions };
  if (on) delete next[groupId]; else next[groupId] = false;
  return next;
}

/** Every column of a group on, or back to the standard. */
export function setAll(groups: readonly ColumnGroup[], decisions: ColumnDecisions, groupId: string, mode: 'all' | 'standard'): ColumnDecisions {
  const group = groups.find((g) => g.id === groupId);
  if (!group) return decisions;
  const next: ColumnDecisions = {};
  for (const [key, value] of Object.entries(decisions)) if (!key.startsWith(`${groupId}.`)) next[key] = value;
  if (mode === 'all') for (const choice of group.choices) if (!choice.locked && !choice.defaultOn) next[columnKey(groupId, choice.id)] = true;
  return next;
}

/** Decisions read back from storage: only known columns, only true / false. */
export function parseDecisions(raw: unknown, groups: readonly ColumnGroup[]): ColumnDecisions {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const known = new Set<string>();
  for (const g of groups) {
    if (g.optional) known.add(g.id);
    for (const c of g.choices) if (!c.locked) known.add(columnKey(g.id, c.id));
  }
  const out: ColumnDecisions = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) if (known.has(key) && typeof value === 'boolean') out[key] = value;
  return out;
}

/** The columns of a catalog that a group shows, in the catalog's order. */
export function pickColumns<T extends { id: string }>(columns: readonly T[], selection: ColumnSelection[string] | undefined): T[] {
  if (!selection) return [...columns];
  return columns.filter((c) => selection.ids.has(c.id));
}
