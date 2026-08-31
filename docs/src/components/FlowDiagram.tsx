export interface FlowLabels {
  readonly caption: string;
  readonly ingestNote: string;
  readonly queueNote: string;
  readonly processorNote: string;
  readonly tableNote: string;
  readonly statusNote: string;
  readonly boardNote: string;
  readonly notBuilt: string;
  readonly query: string;
}

const BOX = 'fill-[var(--surface)]';
const LINE = { stroke: 'currentColor', strokeWidth: 1.25, fill: 'none' } as const;

function Box({
  x,
  y,
  w,
  label,
  note,
  ghost,
  accent,
}: {
  x: number;
  y: number;
  w: number;
  label: string;
  note: string;
  ghost?: boolean;
  accent?: boolean;
}) {
  return (
    <g opacity={ghost ? 0.5 : 1}>
      <rect
        x={x}
        y={y}
        width={w}
        height={54}
        className={BOX}
        stroke={accent ? 'var(--color-banana)' : 'currentColor'}
        strokeWidth={accent ? 2 : 1.25}
        strokeDasharray={ghost ? '5 4' : undefined}
      />
      <text x={x + 12} y={y + 22} className="fill-current font-sans text-[13px] font-semibold">
        {label}
      </text>
      <text x={x + 12} y={y + 40} className="fill-[var(--text-mute)] font-sans text-[11px]">
        {note}
      </text>
    </g>
  );
}

function Arrow({ x, y1, y2, dashed }: { x: number; y1: number; y2: number; dashed?: boolean }) {
  return (
    <g {...LINE} strokeDasharray={dashed ? '5 4' : undefined}>
      <line x1={x} y1={y1} x2={x} y2={y2 - 7} markerEnd="url(#boc-arrow)" />
    </g>
  );
}

function EdgeLabel({ x, y, children }: { x: number; y: number; children: string }) {
  return (
    <text x={x} y={y} className="fill-[var(--text-mute)] font-mono text-[10px]">
      {children}
    </text>
  );
}

/**
 * The request path as it actually exists today. The processor is drawn ghosted
 * because it is designed but not built — pretending otherwise would make this
 * diagram a lie the first time somebody went looking for cmd/processor.
 */
export function FlowDiagram({ l }: { l: FlowLabels }) {
  return (
    <figure className="my-6">
      <div className="overflow-x-auto border border-line bg-surface p-4">
        <svg
          viewBox="0 0 700 620"
          role="img"
          aria-label={l.caption}
          className="h-auto w-full min-w-[520px] text-text"
        >
          <defs>
            <marker
              id="boc-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
            </marker>
          </defs>

          <Box x={40} y={16} w={250} label="Alertmanager" note="prom/alertmanager v0.28.1" />
          <Arrow x={165} y1={70} y2={116} />
          <EdgeLabel x={176} y={97}>POST /v1/int/&#123;key&#125;/alertmanager</EdgeLabel>

          <Box x={40} y={116} w={250} label="API Gateway REST" note="stage prod · throttled" />
          <Arrow x={165} y1={170} y2={216} />

          <Box x={40} y={216} w={250} label="ingest λ" note={l.ingestNote} accent />
          <Arrow x={165} y1={270} y2={316} />
          <EdgeLabel x={176} y={297}>MessageGroupId = RoutingKey</EdgeLabel>

          <Box x={40} y={316} w={250} label="SQS FIFO" note={l.queueNote} />
          <Arrow x={165} y1={370} y2={416} dashed />
          <EdgeLabel x={176} y={397}>{l.notBuilt}</EdgeLabel>

          <Box x={40} y={416} w={250} label="processor λ" note={l.processorNote} ghost />
          <Arrow x={165} y1={470} y2={516} dashed />

          <Box x={40} y={516} w={250} label="DynamoDB" note={l.tableNote} />

          {/* Read path: the board never touches the write side. */}
          <g {...LINE}>
            <path d="M 290 543 H 400 V 470 L 470 470" markerEnd="url(#boc-arrow)" />
          </g>
          <EdgeLabel x={300} y={534}>{l.query}</EdgeLabel>

          <Box x={410} y={416} w={250} label="status λ" note={l.statusNote} />
          <g {...LINE}>
            <line x1={535} y1={416} x2={535} y2={377} markerEnd="url(#boc-arrow)" />
          </g>
          <EdgeLabel x={546} y={400}>GET /v1/status</EdgeLabel>

          <Box x={410} y={316} w={250} label="Status board" note={l.boardNote} />
        </svg>
      </div>
      <figcaption className="mt-2 text-sm text-soft">{l.caption}</figcaption>
    </figure>
  );
}
