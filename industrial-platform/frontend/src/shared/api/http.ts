import type { Problem } from "./types";

export const API_BASE = "/api/v1";
const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
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
}

function url(path: string, query?: RequestOptions["query"]): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) params.set(k, String(v));
  const qs = params.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ""}`;
}

export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (UNSAFE.has(method) && csrfToken) headers["X-CSRF-Token"] = csrfToken;
  if (opts.ifMatch) headers["If-Match"] = opts.ifMatch;
  const res = await fetch(url(path, opts.query), {
    method,
    headers,
    credentials: "same-origin",
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: opts.signal,
  });
  const etag = res.headers.get("ETag");
  if (res.status === 204 || res.status === 304) return { data: undefined as T, etag, status: res.status };
  const text = await res.text();
  const payload: unknown = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const p = (payload ?? {}) as Partial<Problem>;
    throw new ApiError({ type: p.type ?? "about:blank", title: p.title ?? res.statusText, status: res.status,
                         code: p.code ?? "http_error", ...p } as Problem);
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
