import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PageSummary, Project } from "../../shared/api/types";
import { Pages } from "./Pages";

const PROJECT = { id: "proj-1", slug: "pilot", name: "Pilot" } as Project;
const PAGE: PageSummary = {
  id: "page-1", kind: "page", title: { fa: "نمای کلی" }, slug: "overview", path: "/plant/overview", status: "published",
  headRevision: 4, livePublishedVersionNo: 2, hasUnpublishedChanges: false, updatedAt: "2026-10-28T10:00:00Z",
} as PageSummary;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function serve(pages: PageSummary[][], deleteStatus = 204) {
  let list = 0;
  const fn = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "DELETE") {
      return deleteStatus === 204 ? new Response(null, { status: 204 })
        : new Response(JSON.stringify({ status: deleteStatus, code: "x", title: "x" }), { status: deleteStatus });
    }
    return new Response(JSON.stringify({ items: pages[Math.min(list++, pages.length - 1)] }), { status: 200 });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("deleting a page", () => {
  it("asks for confirmation, sends If-Match and refreshes the list", async () => {
    const fn = serve([[PAGE], []]);
    render(<Pages project={PROJECT} onOpen={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /حذف صفحهٔ/ }));
    expect(screen.getByText(/از نمایش عمومی هم برداشته/)).toBeTruthy();
    expect(fn.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /بله، حذف شود/ }));
    await waitFor(() => expect(screen.queryByText("/plant/overview")).toBeNull());
    const del = fn.mock.calls.find(([, init]) => init?.method === "DELETE")!;
    expect(del[0]).toBe("/api/v1/pages/page-1");
    expect((del[1]!.headers as Record<string, string>)["If-Match"]).toBe('"rev-4"');
  });

  it("cancel keeps the page", async () => {
    const fn = serve([[PAGE]]);
    render(<Pages project={PROJECT} onOpen={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /حذف صفحهٔ/ }));
    fireEvent.click(screen.getByRole("button", { name: /انصراف/ }));
    expect(screen.getByText("/plant/overview")).toBeTruthy();
    expect(fn.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
  });

  it("explains a permission error", async () => {
    serve([[PAGE]], 403);
    render(<Pages project={PROJECT} onOpen={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /حذف صفحهٔ/ }));
    fireEvent.click(screen.getByRole("button", { name: /بله، حذف شود/ }));
    expect(await screen.findByText(/اجازهٔ حذف/)).toBeTruthy();
  });
});
