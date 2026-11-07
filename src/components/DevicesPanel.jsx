import { normalizeDevices } from '../api/http';
import { formatStamp } from '../format';

export default function DevicesPanel({ payload, error, updatedAt }) {
  const devices = normalizeDevices(payload);

  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">REST · authenticated</p>
          <h2>Equipment</h2>
          <p className="lede">GET /api/v1/devices</p>
        </div>
        <p className="freshness">{error || (updatedAt ? `HTTP refresh ${updatedAt.toLocaleTimeString()}` : 'Waiting')}</p>
      </header>
      <article className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Type</th><th>State</th><th>Quality</th><th>Bus</th><th>Address</th><th>Last seen</th></tr>
            </thead>
            <tbody>
              {devices.length === 0 ? (
                <tr><td colSpan={7} className="muted">{error || 'No devices returned.'}</td></tr>
              ) : devices.map((device) => (
                <tr key={device.name}>
                  <td>{device.name}</td>
                  <td>{device.type || '—'}</td>
                  <td><span className={`quality ${String(device.state || '').toLowerCase()}`}>{device.state || '—'}</span></td>
                  <td>{device.quality || '—'}</td>
                  <td>{device.bus || '—'}</td>
                  <td>{device.address ?? '—'}</td>
                  <td>{formatStamp(device.lastSeen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
