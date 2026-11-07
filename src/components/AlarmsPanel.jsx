import { normalizeAlarms } from '../api/http';
import { formatStamp } from '../format';

function priorityLabel(priority) {
  if (priority === 1) return 'Critical';
  if (priority === 2) return 'Warning';
  return priority ?? '—';
}

export default function AlarmsPanel({ payload, error, updatedAt }) {
  const alarms = normalizeAlarms(payload);

  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">REST · authenticated</p>
          <h2>Active alarms</h2>
          <p className="lede">GET /api/v1/alarms/active · {alarms.length} rows</p>
        </div>
        <p className="freshness">{error || (updatedAt ? `HTTP refresh ${updatedAt.toLocaleTimeString()}` : 'Waiting')}</p>
      </header>
      <article className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Device</th><th>Alarm</th><th>Message</th><th>Priority</th><th>State</th><th>Since</th></tr>
            </thead>
            <tbody>
              {alarms.length === 0 ? (
                <tr><td colSpan={6} className="muted">{error || 'No active alarms.'}</td></tr>
              ) : alarms.map((alarm) => (
                <tr key={alarm.id}>
                  <td>{alarm.device}</td>
                  <td className="mono">{alarm.name}</td>
                  <td>{alarm.message}</td>
                  <td><span className={`priority p${alarm.priority}`}>{priorityLabel(alarm.priority)}</span></td>
                  <td>{alarm.state}</td>
                  <td>{formatStamp(alarm.enterTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
