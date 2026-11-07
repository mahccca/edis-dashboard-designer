import { useEffect, useState } from 'react';
import { DEFAULT_PATTERNS, envBaseUrl, envPassword, envUsername, normalizeBaseUrl } from './api/config';
import { loadAlarms, loadDevices, loadPlant, login } from './api/http';
import { usePolled } from './api/usePolled';
import { useScadaSocket } from './api/useScadaSocket';
import AlarmsPanel from './components/AlarmsPanel';
import DevicesPanel from './components/DevicesPanel';
import LivePanel from './components/LivePanel';
import Overview from './components/Overview';

const TOKEN_KEY = 'scada_token';
const USER_KEY = 'scada_user';
const BASE_KEY = 'scada_base_url';

const VIEWS = [
  ['plant', 'Plant'],
  ['live', 'Live'],
  ['equipment', 'Equipment'],
  ['alarms', 'Alarms'],
];

function readSession() {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY) || '';
    const rawUser = sessionStorage.getItem(USER_KEY);
    const baseUrl = normalizeBaseUrl(localStorage.getItem(BASE_KEY) || envBaseUrl);
    return { token, user: rawUser ? JSON.parse(rawUser) : null, baseUrl };
  } catch {
    return { token: '', user: null, baseUrl: envBaseUrl };
  }
}

export default function App() {
  const initial = readSession();
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [draftBase, setDraftBase] = useState(initial.baseUrl);
  const [username, setUsername] = useState(envUsername);
  const [password, setPassword] = useState(envPassword);
  const [token, setToken] = useState(initial.token);
  const [user, setUser] = useState(initial.user);
  const [authError, setAuthError] = useState('');
  const [booting, setBooting] = useState(!initial.token);
  const [view, setView] = useState('plant');
  const [patterns, setPatterns] = useState(DEFAULT_PATTERNS);

  const plant = usePolled(() => loadPlant(baseUrl), [baseUrl], 10000, Boolean(token));
  const devices = usePolled(() => loadDevices(baseUrl, token), [baseUrl, token], 15000, Boolean(token));
  const alarms = usePolled(() => loadAlarms(baseUrl, token), [baseUrl, token], 10000, Boolean(token));
  const socket = useScadaSocket({
    baseUrl,
    token,
    patterns,
    enabled: Boolean(token),
  });

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (token) {
        setBooting(false);
        return;
      }
      if (!envUsername || !envPassword) {
        setBooting(false);
        return;
      }
      try {
        await signIn(envUsername, envPassword, baseUrl);
      } catch (error) {
        if (!cancelled) setAuthError(error.message);
      } finally {
        if (!cancelled) setBooting(false);
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
    // Sign in once on first paint. Later attempts come from the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn(nextUser, nextPassword, nextBase) {
    const origin = normalizeBaseUrl(nextBase);
    const payload = await login(origin, nextUser, nextPassword);
    if (!payload?.token) {
      throw new Error(payload?.error || 'Login failed');
    }
    sessionStorage.setItem(TOKEN_KEY, payload.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(payload.user || { username: nextUser }));
    localStorage.setItem(BASE_KEY, origin);
    setBaseUrl(origin);
    setDraftBase(origin);
    setToken(payload.token);
    setUser(payload.user || { username: nextUser });
    setAuthError('');
  }

  async function onSubmit(event) {
    event.preventDefault();
    setAuthError('');
    setBooting(true);
    try {
      await signIn(username.trim(), password, draftBase);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setBooting(false);
    }
  }

  function signOut() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    setToken('');
    setUser(null);
  }

  const scheme = baseUrl.startsWith('https://') ? 'HTTPS' : 'HTTP';
  const alarmCount = Array.isArray(alarms.data) ? alarms.data.length : 0;
  const health = plant.data?.health;

  if (!token) {
    return (
      <main className="login-screen">
        <form className="login-card" onSubmit={onSubmit}>
          <p className="eyebrow">Darkhoveyn Solar SCADA</p>
          <h1>Connect to the plant API</h1>
          <p className="lede">
            REST uses the base URL scheme. WebSocket uses ws on HTTP and wss on HTTPS.
            This SCADA host is listening with plain HTTP on port 4000.
          </p>
          <label className="field">
            <span>API base URL</span>
            <input value={draftBase} onChange={(event) => setDraftBase(event.target.value)} autoComplete="url" />
          </label>
          <label className="field">
            <span>Username</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
          </label>
          {authError ? <p className="error-text">{authError}</p> : null}
          <button type="submit" className="primary" disabled={booting}>
            {booting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </main>
    );
  }

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          <div>
            <strong>Darkhoveyn</strong>
            <small>Solar SCADA</small>
          </div>
        </div>
        <nav>
          {VIEWS.map(([id, label]) => (
            <button key={id} type="button" className={view === id ? 'nav active' : 'nav'} onClick={() => setView(id)}>
              {label}
              {id === 'alarms' && alarmCount > 0 ? <em>{alarmCount}</em> : null}
            </button>
          ))}
        </nav>
        <div className="protocol">
          <p><i className={health?.status === 'ok' ? 'dot ok' : 'dot'} /> {scheme} {health?.status === 'ok' ? 'healthy' : 'checking'}</p>
          <p><i className={`dot ${socket.status === 'open' ? 'ok' : ''}`} /> WebSocket {socket.status}</p>
          <p className="mono tiny">{baseUrl}</p>
        </div>
        <button type="button" className="ghost" onClick={signOut}>
          Sign out {user?.username || user?.user || ''}
        </button>
      </aside>
      <main className="stage">
        {view === 'plant' ? (
          <Overview
            plant={plant.data}
            error={plant.error || plant.data?.error}
            updatedAt={plant.updatedAt}
          />
        ) : null}
        {view === 'live' ? (
          <LivePanel baseUrl={baseUrl} socket={socket} patterns={patterns} onApplyPatterns={setPatterns} />
        ) : null}
        {view === 'equipment' ? <DevicesPanel payload={devices.data} error={devices.error} updatedAt={devices.updatedAt} /> : null}
        {view === 'alarms' ? <AlarmsPanel payload={alarms.data} error={alarms.error} updatedAt={alarms.updatedAt} /> : null}
      </main>
    </div>
  );
}
