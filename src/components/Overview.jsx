import { formatEnergy, formatFixed, formatHour, formatPower } from '../format';

function Metric({ label, value, detail }) {
  return (
    <article className="metric">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      {detail ? <p className="metric-detail">{detail}</p> : null}
    </article>
  );
}

function PowerCurve({ rows }) {
  const points = [...(rows || [])]
    .map((row) => ({
      bucket: row.bucket,
      kw: Number(row.totalAcPower) / 1000,
    }))
    .filter((row) => row.bucket && Number.isFinite(row.kw))
    .sort((a, b) => String(a.bucket).localeCompare(String(b.bucket)));

  if (points.length < 2) {
    return <p className="muted">Power history has not arrived yet.</p>;
  }

  const width = 680;
  const height = 190;
  const pad = 18;
  const min = Math.min(...points.map((point) => point.kw));
  const max = Math.max(...points.map((point) => point.kw));
  const span = max - min || 1;
  const coords = points.map((point, index) => {
    const x = pad + (index / (points.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (point.kw - min) / span) * (height - pad * 2);
    return [x, y];
  });
  const line = coords.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${height - pad} L${coords[0][0].toFixed(1)},${height - pad} Z`;

  return (
    <figure className="curve">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Today AC power curve">
        <path d={area} className="curve-area" />
        <path d={line} className="curve-line" />
      </svg>
      <figcaption>
        <span>{formatHour(points[0].bucket)}</span>
        <span>Peak {formatFixed(max, 0)} kW</span>
        <span>{formatHour(points[points.length - 1].bucket)}</span>
      </figcaption>
    </figure>
  );
}

export default function Overview({ plant, error, updatedAt }) {
  const site = plant?.sites?.[0];
  const totals = plant?.totals;
  const weather = site?.weather || (plant?.weather ? Object.values(plant.weather)[0] : null);
  const impact = plant?.impact;
  const jb = site?.designatedJbsSummary?.[0];

  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">REST · plant snapshot</p>
          <h2>{site?.name || 'Solar plant'}</h2>
          <p className="lede">
            {site?.nameFa ? `${site.nameFa} · ` : ''}
            {site?.city || 'Site'}{site?.state ? `, ${site.state}` : ''}
            {site?.capacityKwp ? ` · ${formatFixed(site.capacityKwp, 2)} kWp` : ''}
          </p>
        </div>
        <p className="freshness">{error ? error : updatedAt ? `HTTP refresh ${updatedAt.toLocaleTimeString()}` : 'Waiting for HTTP'}</p>
      </header>

      <div className="metric-grid">
        <Metric label="AC power" value={formatPower(totals?.totalAcPower)} detail={`${totals?.invertersOnline ?? '—'}/${totals?.invertersTotal ?? '—'} inverters online`} />
        <Metric label="PV power" value={formatPower(totals?.totalPvPower)} detail={`Efficiency ${formatFixed(totals?.efficiency, 1)}%`} />
        <Metric label="Energy today" value={formatEnergy(totals?.totalEnergyToday)} detail={`Month ${formatEnergy(totals?.totalEnergyMonth)}`} />
        <Metric label="Performance ratio" value={`${formatFixed(totals?.performanceRatio, 1)}%`} detail={`Yield ${formatFixed(totals?.specificYield, 1)} kWh/kWp`} />
        <Metric label="Grid frequency" value={`${formatFixed(totals?.gridFrequency, 2)} Hz`} detail={site?.status ? `Site ${site.status}` : 'Live totals'} />
        <Metric label="Weather" value={weather ? `${formatFixed(weather.temperature, 1)}°C` : '—'} detail={weather ? `${weather.weatherText} · wind ${formatFixed(weather.windSpeed, 0)}` : 'No weather'} />
      </div>

      <div className="split">
        <article className="panel">
          <header className="panel-head">
            <h3>AC power, last 24 hours</h3>
            <span>GET /public/power-history</span>
          </header>
          <PowerCurve rows={plant?.power?.rows} />
        </article>
        <article className="panel">
          <header className="panel-head">
            <h3>CO₂ avoided</h3>
            <span>GET /public/environmental-impact</span>
          </header>
          <dl className="facts">
            <div><dt>Today</dt><dd>{impact?.today?.formatted || '—'}</dd></div>
            <div><dt>This month</dt><dd>{impact?.month?.formatted || '—'}</dd></div>
            <div><dt>This year</dt><dd>{impact?.year?.formatted || '—'}</dd></div>
            <div><dt>Trees equivalent</dt><dd>{formatFixed(impact?.lifetime?.trees, 0)}</dd></div>
          </dl>
          {jb ? (
            <p className="jb-line">
              {jb.name} {jb.status} · CPU {formatFixed(jb.cpuTemp, 1)}°C · {jb.connectedDevices} devices · bus {jb.bus}
            </p>
          ) : null}
        </article>
      </div>
    </section>
  );
}
