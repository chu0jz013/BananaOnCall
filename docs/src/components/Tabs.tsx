import type { ReactNode } from 'react';

export interface Tab {
  readonly id: string;
  readonly label: string;
}

interface Props {
  readonly tabs: readonly Tab[];
  readonly active: string;
  readonly onChange: (id: string) => void;
  readonly label: string;
  readonly children?: ReactNode;
}

/** The switch shape the wireframe uses for local/prod and for environments. */
export function Tabs({ tabs, active, onChange, label, children }: Props) {
  return (
    <div className="my-5">
      <div
        role="tablist"
        aria-label={label}
        className="flex flex-wrap gap-px border border-line bg-line"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={t.id === active}
            onClick={() => onChange(t.id)}
            className={`flex-1 px-4 py-3 font-mono text-[.6875rem] tracking-[.1em] uppercase transition-colors ${
              t.id === active ? 'bg-text text-bg' : 'bg-bg text-soft hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
