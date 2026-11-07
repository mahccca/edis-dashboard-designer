import { useMemo, useState } from 'react';
import { searchSignals } from '../api/http';
import { formatStamp } from '../format';

function signalRows(signals) {
  return Object.values(signals).sort((a, b) => String(a.path).localeCompare(String(b.path)));
}

export default function LivePanel({ baseUrl, socket, patterns, onApplyPatterns }) {
  const [draft, setDraft] = useState(patterns.join('\n'));
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('AC_POWER');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [results, setResults] = useState([]);

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return signalRows(socket.signals).filter((row) => {
      if (!needle) return true;
      return `${row.path} ${row.signal || ''} ${row.device || ''}`.toLowerCase().includes(needle);
    });
  }, [socket.signals, filter]);

  async function onSearch(event) {
    event.preventDefault();
    setSearching(true);
    setSearchError('');
    try {
      const payload = await searchSignals(baseUrl, query.trim());
      setResults(payload.items || []);
    } catch (error) {
      setSearchError(error.message);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">WebSocket pub/sub + REST lookup</p>
          <h2>Live signals</h2>
          <p className="lede mono">{socket.url.replace(/token=[^&]+/, 'token=•••')}</p>
        </div>
        <p className="freshness">{socket.frameCount} frames · {socket.status}</p>
      </header>

      <div className="split live-split">
        <article className="panel">
          <header className="panel-head">
            <h3>Subscription patterns</h3>
            <span>type: subscribe</span>
          </header>
          <label className="field">
            <span>One path or wildcard per line</span>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={7} spellCheck="false" />
          </label>
          <button
            type="button"
            className="primary"
            onClick={() => onApplyPatterns(draft.split('\n').map((line) => line.trim()).filter(Boolean))}
          >
            Apply and resubscribe
          </button>
          <ul className="frame-log">
            {socket.frames.length === 0 ? <li className="muted">No frames yet.</li> : null}
            {socket.frames.map((frame) => (
              <li key={frame.id}><span>{frame.time}</span><strong>{frame.type}</strong></li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <header className="panel-head">
            <h3>REST signal search</h3>
            <span>GET /public/signals/search</span>
          </header>
          <form className="inline-form" onSubmit={onSearch}>
            <label className="field grow">
              <span>Query</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <button type="submit" className="primary" disabled={searching}>{searching ? 'Searching' : 'Fetch'}</button>
          </form>
          {searchError ? <p className="error-text">{searchError}</p> : null}
          <div className="table-wrap short">
            <table>
              <thead>
                <tr><th>Path</th><th>Value</th><th>Quality</th></tr>
              </thead>
              <tbody>
                {results.length === 0 ? (
                  <tr><td colSpan={3} className="muted">Run a search to fetch current values over HTTP.</td></tr>
                ) : results.map((item) => (
                  <tr key={item.path}>
                    <td className="mono">{item.path}</td>
                    <td>{item.value} {item.unit || ''}</td>
                    <td>{item.quality || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <article className="panel">
        <header className="panel-head">
          <h3>WebSocket values</h3>
          <label className="filter-label">
            Filter
            <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="INV-01, AC_POWER" />
          </label>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Path</th><th>Value</th><th>Quality</th><th>Updated</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={4} className="muted">Waiting for subscription.snapshot.</td></tr>
              ) : rows.map((row) => (
                <tr key={row.path} className={socket.changed.has(row.path) ? 'flash' : undefined}>
                  <td className="mono">{row.path}</td>
                  <td>{row.value ?? '—'} {row.unit || ''}</td>
                  <td><span className={`quality ${String(row.quality || '').toLowerCase()}`}>{row.quality || '—'}</span></td>
                  <td>{formatStamp(row.timestamp || row.lastChanged)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
