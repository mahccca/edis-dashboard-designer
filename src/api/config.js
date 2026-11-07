const DEFAULT_BASE = 'http://10.8.0.8:4000';

export const envBaseUrl = String(import.meta.env.VITE_SCADA_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
export const envUsername = import.meta.env.VITE_SCADA_USERNAME || '';
export const envPassword = import.meta.env.VITE_SCADA_PASSWORD || '';

export const DEFAULT_PATTERNS = [
  'darkhoveyn/total/AC_POWER',
  'Darkhoveyn/JB-01/INV-01/*',
  'Darkhoveyn/JB-01/INV-02/AC_POWER',
  'Darkhoveyn/JB-01/INV-03/AC_POWER',
  'Darkhoveyn/JB-01/INV-04/AC_POWER',
  'Darkhoveyn/JB-01/INV-02/PV_POWER',
  'Darkhoveyn/JB-01/INV-03/PV_POWER',
  'Darkhoveyn/JB-01/INV-04/PV_POWER',
];

export function normalizeBaseUrl(value) {
  const trimmed = String(value || '').trim().replace(/\/$/, '');
  if (!trimmed) return DEFAULT_BASE;
  if (!/^https?:\/\//i.test(trimmed)) return `http://${trimmed}`;
  return trimmed;
}

/** REST stays on the configured scheme. WebSocket uses ws: for http and wss: for https. */
export function toWebSocketUrl(baseUrl, token) {
  const url = new URL(normalizeBaseUrl(baseUrl));
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  if (token) url.searchParams.set('token', token);
  return url.toString();
}

export function apiUrl(baseUrl, path) {
  const base = normalizeBaseUrl(baseUrl);
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}/api/v1${suffix}`;
}
