/** The four alert-group states, carried over from the v0.1 design doc. */
export function StateChips() {
  return (
    <div className="my-5 flex flex-wrap gap-2 font-mono text-[.6875rem]">
      <span className="border border-fire px-2 py-1 text-fire">FIRING</span>
      <span className="border border-banana bg-wash px-2 py-1">ACKED</span>
      <span className="border border-ok px-2 py-1 text-ok">RESOLVED</span>
      <span className="border border-line px-2 py-1 text-soft">SILENCED</span>
    </div>
  );
}
