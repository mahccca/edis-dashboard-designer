import { apiUrl } from './config';

export class ScadaError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ScadaError';
    this.status = status;
  }
}

export async function scadaFetch(baseUrl, path, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(apiUrl(baseUrl, path), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new ScadaError(error.message || 'Network error', 0);
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const message = payload?.error || payload?.message || `HTTP ${response.status}`;
    throw new ScadaError(typeof message === 'string' ? message : `HTTP ${response.status}`, response.status);
  }

  return payload;
}

export function login(baseUrl, username, password) {
  return scadaFetch(baseUrl, '/auth/login', {
    method: 'POST',
    body: { username, password },
  });
}

async function settled(baseUrl, path) {
  try {
    return await scadaFetch(baseUrl, path);
  } catch (error) {
    return { error: error.message };
  }
}

export async function loadPlant(baseUrl) {
  const [health, totals, sites, weather, impact, power] = await Promise.all([
    settled(baseUrl, '/health'),
    settled(baseUrl, '/public/plant-totals'),
    settled(baseUrl, '/public/sites/overview'),
    settled(baseUrl, '/public/weather'),
    settled(baseUrl, '/public/environmental-impact'),
    settled(baseUrl, '/public/power-history'),
  ]);

  const failures = [health, totals, sites, weather, impact, power]
    .map((item) => item?.error)
    .filter(Boolean);

  return {
    health: health?.error ? null : health,
    totals: totals?.error ? null : totals,
    sites: Array.isArray(sites) ? sites : [],
    weather: weather?.error ? null : weather,
    impact: impact?.error ? null : impact,
    power: power?.error ? null : power,
    error: failures.length === 6 ? failures[0] : null,
  };
}

export function loadDevices(baseUrl, token) {
  return scadaFetch(baseUrl, '/devices', { token });
}

export function loadAlarms(baseUrl, token) {
  return scadaFetch(baseUrl, '/alarms/active', { token });
}

export function searchSignals(baseUrl, query) {
  const params = new URLSearchParams({ query, limit: '30' });
  return scadaFetch(baseUrl, `/public/signals/search?${params.toString()}`);
}

export function normalizeDevices(payload) {
  if (!payload || payload.error) return [];
  if (Array.isArray(payload)) return payload.map((device) => ({ name: device.name || device.id, ...device }));
  return Object.entries(payload).map(([name, device]) => ({ name, ...device }));
}

export function normalizeAlarms(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.alarms)) return payload.alarms;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}
