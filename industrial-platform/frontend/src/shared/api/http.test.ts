import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, http, setCsrfToken } from "./http";

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const fn = vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status, headers }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setCsrfToken(null);
});

describe("http client", () => {
  it("sends CSRF and If-Match on unsafe methods only, with same-origin credentials", async () => {
    setCsrfToken("csrf-123");
    const fn = mockFetch(200, { revisionNo: 3 }, { ETag: '"rev-3"' });
    const res = await http.put<{ revisionNo: number }>("/pages/x/document", { body: { content: {} }, ifMatch: '"rev-2"' });
    expect(res.etag).toBe('"rev-3"');
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/pages/x/document");
    expect(init.credentials).toBe("same-origin");
    expect((init.headers as Record<string, string>)["X-CSRF-Token"]).toBe("csrf-123");
    expect((init.headers as Record<string, string>)["If-Match"]).toBe('"rev-2"');

    await http.get("/projects");
    const [, getInit] = fn.mock.calls[1] as unknown as [string, RequestInit];
    expect((getInit.headers as Record<string, string>)["X-CSRF-Token"]).toBeUndefined();
  });

  it("turns problem+json into ApiError with currentEtag for 412", async () => {
    mockFetch(412, { type: "x", title: "Resource was modified", status: 412, code: "precondition_failed", currentEtag: '"rev-5"' });
    const err = await http.put("/pages/x/document", { body: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(412);
    expect((err as ApiError).problem.currentEtag).toBe('"rev-5"');
  });

  it("encodes query parameters", async () => {
    const fn = mockFetch(200, { items: [] });
    await http.get("/runtime/sites/a/resolve", { query: { path: "/plant/overview", skip: undefined } });
    expect((fn.mock.calls[0] as unknown as [string])[0]).toBe("/api/v1/runtime/sites/a/resolve?path=%2Fplant%2Foverview");
  });
});
