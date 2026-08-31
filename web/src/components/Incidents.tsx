import type { Incident } from '../api';
import { duration, relative, timestamp } from '../format';

function ackDelay(i: Incident): string {
  if (!i.ackedAt) return 'never acked';
  return duration((new Date(i.ackedAt).getTime() - new Date(i.startedAt).getTime()) / 1000);
}

function totalDuration(i: Incident): string {
  if (!i.resolvedAt) return 'ongoing';
  return duration((new Date(i.resolvedAt).getTime() - new Date(i.startedAt).getTime()) / 1000);
}

export function ActiveIncidents({ incidents }: { incidents: Incident[] }) {
  if (incidents.length === 0) {
    return <p className="empty">Nothing open right now.</p>;
  }
  return (
    <div className="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>Started</th>
            <th>What</th>
            <th>Severity</th>
            <th>State</th>
            <th>Acknowledged</th>
          </tr>
        </thead>
        <tbody>
          {incidents.map((i) => (
            <tr key={i.id}>
              <td className="mono">{relative(i.startedAt)}</td>
              <td>
                <strong>{i.title}</strong>
                <br />
                <span style={{ color: 'var(--text-mute)', fontSize: '.8125rem' }}>{i.service}</span>
              </td>
              <td>{i.severity}</td>
              <td>{i.state}</td>
              <td className="mono">{ackDelay(i)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function IncidentHistory({ incidents }: { incidents: Incident[] }) {
  if (incidents.length === 0) {
    return <p className="empty">No incidents recorded yet.</p>;
  }
  return (
    <div className="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>Started</th>
            <th>What</th>
            <th>Severity</th>
            <th>Alerts</th>
            <th>Time to ack</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          {incidents.map((i) => (
            <tr key={i.id}>
              <td className="mono">{timestamp(i.startedAt)}</td>
              <td>
                <strong>{i.title}</strong>
                <br />
                <span style={{ color: 'var(--text-mute)', fontSize: '.8125rem' }}>{i.service}</span>
              </td>
              <td>{i.severity}</td>
              <td className="mono">{i.alertCount}</td>
              <td className="mono">{ackDelay(i)}</td>
              <td className="mono">{totalDuration(i)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
