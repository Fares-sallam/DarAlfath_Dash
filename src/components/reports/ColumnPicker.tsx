import { Check, Lock } from 'lucide-react';
import {
  resolveSelection, setAll, setColumn, setGroupEnabled,
  type ColumnDecisions, type ColumnGroup,
} from '@/lib/reports/columnChoices';

interface Props {
  groups: readonly ColumnGroup[];
  decisions: ColumnDecisions;
  onChange: (next: ColumnDecisions) => void;
}

/**
 * «الأعمدة اللي تظهر في التقرير»: every column of the report as a button. A column that is switched on is a column of the file; one
 * that is switched off is not in the file at all. A group can be a whole sheet that is switched on or off too.
 */
export default function ColumnPicker({ groups, decisions, onChange }: Props) {
  const selection = resolveSelection(groups, decisions);

  return (
    <div className="space-y-4" data-testid="column-picker">
      {groups.map((group) => {
        const sel = selection[group.id];
        const optionalChoices = group.choices.filter((c) => !c.locked);
        const chosen = optionalChoices.filter((c) => sel.ids.has(c.id)).length;
        return (
          <fieldset key={group.id} className="space-y-2" data-testid={`column-group-${group.id}`}>
            <div className="flex items-center justify-between gap-2">
              <legend className="text-xs font-bold text-gray-600 flex items-center gap-2 float-none p-0">
                {group.optional && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={sel.enabled}
                    aria-label={`تضمين ${group.title}`}
                    onClick={() => onChange(setGroupEnabled(groups, decisions, group.id, !sel.enabled))}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${sel.enabled ? 'bg-blue-700' : 'bg-gray-300'}`}
                    data-testid={`sheet-${group.id}`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${sel.enabled ? '-translate-x-4' : '-translate-x-0.5'}`} />
                  </button>
                )}
                {group.title}
                <span className="font-normal text-gray-400">{sel.enabled ? `${chosen} من ${optionalChoices.length}` : 'مش هتظهر'}</span>
              </legend>
              {sel.enabled && (
                <span className="flex items-center gap-2 text-[11px]">
                  <button type="button" onClick={() => onChange(setAll(groups, decisions, group.id, 'all'))} className="text-blue-700 hover:underline" data-testid={`cols-all-${group.id}`}>الكل</button>
                  <span className="text-gray-300">|</span>
                  <button type="button" onClick={() => onChange(setAll(groups, decisions, group.id, 'standard'))} className="text-blue-700 hover:underline" data-testid={`cols-standard-${group.id}`}>الافتراضي</button>
                </span>
              )}
            </div>

            {sel.enabled && (
              <div className="flex flex-wrap gap-1.5">
                {group.choices.map((choice) => {
                  const on = sel.ids.has(choice.id);
                  if (choice.locked) {
                    return (
                      <span key={choice.id} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-100 text-blue-800 opacity-80" title="عمود ثابت" data-testid={`col-${group.id}-${choice.id}`} data-on="true">
                        <Lock size={11} /> {choice.label}
                      </span>
                    );
                  }
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      role="switch"
                      aria-checked={on}
                      title={choice.hint}
                      onClick={() => onChange(setColumn(groups, decisions, group.id, choice.id, !on))}
                      data-testid={`col-${group.id}-${choice.id}`}
                      data-on={on}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        on ? 'bg-blue-700 border-blue-700 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {on && <Check size={12} />} {choice.label}
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
