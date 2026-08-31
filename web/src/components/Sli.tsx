import type { SLIStatus } from '../api';
import { availability, duration, target as fmtTarget } from '../format';
import { Strip } from './Strip';

/**
 * One indicator: the headline number, the budget it has left, and the window
 * behind it. The budget bar is the part an on-call engineer reads first, so it
 * gets the time figure, not just a percentage.
 */
export function Sli({ sli }: { sli: SLIStatus }) {
  const { errorBudget: budget } = sli;
  const spent = Math.min(100, Math.max(0, budget.consumedPercent));

  // The bar shows budget *spent*. Colour tracks how alarming that is, using the
  // same three status steps as the strip above it.
  const fill = spent >= 100 ? 'st-critical' : spent >= 60 ? 'st-warning' : 'st-good';

  return (
    <article className="sli">
      <div className="sli-head">
        <span className="sli-name">{sli.label}</span>
        <span className={`pill ${sli.meeting ? 'pill-ok' : 'pill-bad'}`}>
          {sli.meeting ? 'Meeting target' : 'Breached'}
        </span>
      </div>
      <p className="sli-detail">{sli.detail}</p>

      <div className="sli-figure">
        <span className="sli-actual mono">{availability(sli.actual)}</span>
        <span className="sli-target">
          target {fmtTarget(sli.target)} · {sli.windowDays}-day window
        </span>
      </div>

      <div className="meter">
        <div
          className="meter-track"
          role="img"
          aria-label={`Error budget: ${duration(budget.remainingSeconds)} left of ${duration(budget.totalSeconds)}, ${budget.consumedPercent}% spent`}
        >
          <div className={`meter-fill ${fill}`} style={{ width: `${spent}%` }} />
        </div>
        <div className="meter-legend">
          <span>{budget.consumedPercent}% of error budget spent</span>
          <span className="mono">
            {duration(budget.remainingSeconds)} left of {duration(budget.totalSeconds)}
          </span>
        </div>
      </div>

      <Strip days={sli.days} target={sli.target} windowDays={sli.windowDays} />
    </article>
  );
}
