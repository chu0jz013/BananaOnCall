export interface Stat {
  readonly label: string;
  readonly value: string;
  readonly note?: string;
  /** Draws the value in the alert red — for a budget that is gone. */
  readonly warn?: boolean;
}

export function StatTiles({ stats }: { stats: readonly Stat[] }) {
  return (
    <dl className="my-5 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="bg-bg px-4 py-5">
          <dt className="eyebrow text-soft">{s.label}</dt>
          <dd
            className={`font-display mt-2 text-2xl font-bold tracking-[-0.02em] ${
              s.warn ? 'text-fire' : ''
            }`}
          >
            {s.value}
          </dd>
          {s.note && <dd className="mt-1 font-mono text-[.6875rem] text-soft">{s.note}</dd>}
        </div>
      ))}
    </dl>
  );
}
