export interface PortsLabels {
  readonly caption: string;
  readonly core: string;
  readonly ports: string;
  readonly adapters: string;
  readonly rule: string;
}

/**
 * D10 as three boxes: solid is the core, outlined are the shells around it.
 * The arrows point inward because dependencies do — the core names what it
 * needs and never learns who implements it.
 */
export function PortsDiagram({ l }: { l: PortsLabels }) {
  const boxes = [
    { name: 'internal/domain', note: l.core, solid: true },
    { name: 'internal/ports', note: l.ports, solid: false },
    { name: 'internal/adapter', note: l.adapters, solid: false },
  ];

  return (
    <figure className="my-6">
      <div className="grid gap-px border border-line bg-line sm:grid-cols-3">
        {boxes.map((b) => (
          <div
            key={b.name}
            className={`bg-surface p-4 ${b.solid ? 'border-l-2 border-l-banana' : ''}`}
          >
            <code className={`font-mono text-sm ${b.solid ? 'font-semibold' : 'text-soft'}`}>
              {b.name}
            </code>
            <p className="mt-2 text-[.8125rem] leading-relaxed text-soft">{b.note}</p>
          </div>
        ))}
      </div>
      <figcaption className="mt-2 border-l-2 border-banana pl-3 font-mono text-[.75rem] text-soft">
        {l.rule}
      </figcaption>
    </figure>
  );
}
