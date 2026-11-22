import type { ReactNode } from 'react';

/** A few choices on one line, one pressed (the small ones above a preview). */
export function Pills<T extends string>({ value, options, onChange, label }: { value: T; options: { key: T; label: string; testId?: string }[]; onChange: (next: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-0.5 p-0.5 bg-gray-100 rounded-lg">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            data-testid={o.testId}
            onClick={() => onChange(o.key)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${on ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** The box a preview sits in: a title, its controls, and the framed page. */
export function PreviewShell({ title, hint, controls, testId, children }: { title: string; hint: string; controls: ReactNode; testId: string; children: ReactNode }) {
  return (
    <aside className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3" data-testid={testId}>
      <div>
        <h2 className="text-sm font-bold text-gray-700">{title}</h2>
        <p className="text-[11px] text-gray-400 leading-relaxed mt-0.5">{hint}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{controls}</div>
      {children}
    </aside>
  );
}
