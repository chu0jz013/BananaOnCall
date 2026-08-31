import { STATE_CLASS, STATE_LABEL, type DayState } from '../status';

const ORDER: DayState[] = ['good', 'warning', 'critical', 'empty'];

/**
 * Always rendered, never optional. The warning step sits below 3:1 against the
 * light surface on purpose (it is what keeps it separable from red under
 * deuteranopia), so the wording here is part of how the strip stays readable —
 * colour never carries the meaning by itself.
 */
export function Legend() {
  return (
    <div className="legend">
      {ORDER.map((s) => (
        <span className="legend-item" key={s}>
          <span className={`legend-swatch ${STATE_CLASS[s]}`} aria-hidden="true" />
          {STATE_LABEL[s]}
        </span>
      ))}
    </div>
  );
}
