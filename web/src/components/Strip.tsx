import { useState } from 'react';
import type { DailyCount } from '../api';
import { availability, day } from '../format';
import { classifyDay, dayRate, STATE_CLASS, STATE_LABEL } from '../status';

interface Props {
  days: DailyCount[];
  target: number;
  windowDays: number;
}

/**
 * One cell per day across the window.
 *
 * Every cell is focusable and carries its own tooltip and aria-label, and the
 * whole window is available as a table — that is the relief the palette check
 * asks for when a status step sits below 3:1 on the light surface.
 */
export function Strip({ days, target, windowDays }: Props) {
  const [asTable, setAsTable] = useState(false);

  if (days.length === 0) {
    return <p className="empty">No daily data recorded yet.</p>;
  }

  const first = days[0];
  const last = days[days.length - 1];

  return (
    <div className="strip">
      <div className="strip-cells" role="group" aria-label={`Daily result, last ${windowDays} days`}>
        {days.map((d) => {
          const state = classifyDay(d, target);
          const rate = dayRate(d);
          const failed = d.total - d.good;
          const label =
            rate === null
              ? `${day(d.date)}: no data`
              : `${day(d.date)}: ${availability(rate)}, ${failed.toLocaleString()} of ${d.total.toLocaleString()} failed — ${STATE_LABEL[state]}`;

          return (
            <span
              key={d.date}
              className={`cell ${STATE_CLASS[state]}`}
              tabIndex={0}
              role="img"
              aria-label={label}
            >
              <span className="tip" role="presentation">
                <strong>{day(d.date)}</strong>
                <br />
                {rate === null ? 'No data' : `${availability(rate)} · ${failed.toLocaleString()} failed`}
                <br />
                {STATE_LABEL[state]}
              </span>
            </span>
          );
        })}
      </div>

      <div className="strip-axis">
        <span>{day(first.date)}</span>
        <button
          type="button"
          className="toggle"
          onClick={() => setAsTable((v) => !v)}
          aria-expanded={asTable}
        >
          {asTable ? 'Hide table' : 'View as table'}
        </button>
        <span>{day(last.date)}</span>
      </div>

      {asTable && (
        <div className="tbl-wrap" style={{ marginTop: '.75rem' }}>
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>Availability</th>
                <th>Failed</th>
                <th>Total</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((d) => {
                const rate = dayRate(d);
                return (
                  <tr key={d.date}>
                    <td className="mono">{d.date}</td>
                    <td className="mono">{rate === null ? '—' : availability(rate)}</td>
                    <td className="mono">{(d.total - d.good).toLocaleString()}</td>
                    <td className="mono">{d.total.toLocaleString()}</td>
                    <td>{STATE_LABEL[classifyDay(d, target)]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
