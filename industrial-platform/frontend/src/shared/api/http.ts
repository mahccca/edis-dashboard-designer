import type { Problem } from "./types";

export const API_BASE = "/api/v1";
const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const CSRF_STORAGE_KEY = "ip.csrfToken";

let csrfToken: string | null = null;
try {
  if (typeof window !== "undefined" && window.sessionStorage) {
    csrfToken = window.sessionStorage.getItem(CSRF_STORAGE_KEY);
  }
} catch {
  /* ignore */
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      if (token) {
        window.sessionStorage.setItem(CSRF_STORAGE_KEY, token);
      } else {
        window.sessionStorage.removeItem(CSRF_STORAGE_KEY);
      }
    }
  } catch {
    /* ignore */
  }
}

let pendingCsrfPromise: Promise<string | null> | null = null;

export async function ensureCsrfToken(): Promise<string | null> {
  if (csrfToken) return csrfToken;
  if (pendingCsrfPromise) return pendingCsrfPromise;

  pendingCsrfPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (res.ok) {
        const text = await res.text();
        const data = text ? (JSON.parse(text) as { csrfToken?: string }) : undefined;
        if (data?.csrfToken) {
          setCsrfToken(data.csrfToken);
          return data.csrfToken;
        }
      }
    } catch {
      /* ignore */
    } finally {
      pendingCsrfPromise = null;
    }
    return null;
  })();

  return pendingCsrfPromise;
}

export class ApiError extends Error {
  readonly status: number;
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.status = problem.status;
    this.problem = problem;
  }
}

export interface ApiResponse<T> {
  data: T;
  etag: string | null;
  status: number;
}

export interface RequestOptions {
  body?: unknown;
  ifMatch?: string | null;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
  cache?: RequestCache;
  _retried?: boolean;
}

const responseCache = new Map<string, unknown>();

function url(path: string, query?: RequestOptions["query"]): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) params.set(k, String(v));
  const qs = params.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ""}`;
}

export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  // If making an unsafe request and no CSRF token is in memory/storage, attempt to fetch it first
  if (UNSAFE.has(method) && !csrfToken && !path.endsWith("login") && !path.endsWith("me") && typeof window !== "undefined") {
    await ensureCsrfToken();
  }

  if (UNSAFE.has(method) && csrfToken) headers["X-CSRF-Token"] = csrfToken;
  if (opts.ifMatch) headers["If-Match"] = opts.ifMatch;
  const fullUrl = url(path, opts.query);
  const cacheKey = `${method}:${fullUrl}`;

  const res = await fetch(fullUrl, {
    method,
    headers,
    credentials: "same-origin",
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: opts.signal,
    cache: opts.cache,
  });
  const etag = res.headers.get("ETag");
  if (res.status === 204) return { data: undefined as T, etag, status: res.status };
  if (res.status === 304) {
    const cached = responseCache.get(cacheKey) as T | undefined;
    return { data: (cached ?? undefined) as T, etag, status: res.status };
  }
  const text = await res.text();
  const payload: unknown = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const p = (payload ?? {}) as Partial<Problem>;

    // Automatic recovery from CSRF failures: refresh token from /auth/me and retry once
    const isCsrfError =
      res.status === 403 &&
      (p.code === "csrf_failed" || (typeof p.detail === "string" && p.detail.includes("X-CSRF-Token")));
    if (isCsrfError && !opts._retried && !path.endsWith("login")) {
      setCsrfToken(null);
      const fresh = await ensureCsrfToken();
      if (fresh) {
        return request<T>(method, path, { ...opts, _retried: true });
      }
    }

    throw new ApiError({ type: p.type ?? "about:blank", title: p.title ?? res.statusText, status: res.status,
                         code: p.code ?? "http_error", ...p } as Problem);
  }
  if (method === "GET" && payload !== undefined) {
    responseCache.set(cacheKey, payload);
  }
  return { data: payload as T, etag, status: res.status };
}

export const http = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>("GET", path, opts),
  post: <T>(path: string, opts?: RequestOptions) => request<T>("POST", path, opts),
  put: <T>(path: string, opts?: RequestOptions) => request<T>("PUT", path, opts),
  patch: <T>(path: string, opts?: RequestOptions) => request<T>("PATCH", path, opts),
  delete: <T = void>(path: string, opts?: RequestOptions) => request<T>("DELETE", path, opts),
};
