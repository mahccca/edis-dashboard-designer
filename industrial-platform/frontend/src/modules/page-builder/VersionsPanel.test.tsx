import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublishedVersion, RevisionSummary } from "../../shared/api/types";
import { VersionsPanel } from "./VersionsPanel";

const MOCK_REVISIONS: RevisionSummary[] = [
  {
    revisionNo: 3,
    schemaVersion: 1,
    contentHash: "hash-3",
    message: "به‌روزرسانی عنوان هدر",
    autosave: false,
    restoredFrom: null,
    createdAt: "2026-11-28T09:00:00Z",
  },
  {
    revisionNo: 2,
    schemaVersion: 1,
    contentHash: "hash-2",
    message: null,
    autosave: true,
    restoredFrom: null,
    createdAt: "2026-11-28T08:30:00Z",
  },
  {
    revisionNo: 1,
    schemaVersion: 1,
    contentHash: "hash-1",
    message: "نسخه اولیه",
    autosave: false,
    restoredFrom: null,
    createdAt: "2026-11-28T08:00:00Z",
  },
];

const MOCK_PUBLISHED: PublishedVersion[] = [
  {
    id: "pv-2" as never,
    documentId: "doc-1" as never,
    versionNo: 2,
    sourceRevisionNo: 3,
    bundleHash: "b-2",
    pins: { components: [] },
    isLive: true,
    containsTestData: false,
    note: "نسخه نهایی خط تولید",
    publishedAt: "2026-11-28T09:15:00Z",
  },
  {
    id: "pv-1" as never,
    documentId: "doc-1" as never,
    versionNo: 1,
    sourceRevisionNo: 1,
    bundleHash: "b-1",
    pins: { components: [] },
    isLive: false,
    containsTestData: true,
    note: "نسخه آزمایشی اولیه",
    publishedAt: "2026-11-28T08:10:00Z",
  },
];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input, "http://localhost");
      if (url.pathname.includes("/revisions")) {
        return new Response(JSON.stringify({ items: MOCK_REVISIONS }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.pathname.includes("/published-versions")) {
        return new Response(JSON.stringify({ items: MOCK_PUBLISHED }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("VersionsPanel (History Drawer)", () => {
  it("renders published versions timeline and activates an archived version", async () => {
    const onActivate = vi.fn();
    const onRestore = vi.fn();
    const onClose = vi.fn();
    const onCountChange = vi.fn();

    render(
      <VersionsPanel
        pageId="p1"
        refreshKey={0}
        canRestore={true}
        onRestore={onRestore}
        onActivate={onActivate}
        onClose={onClose}
        onPublishedCountChange={onCountChange}
      />
    );

    // Header title and close button
    expect(screen.getByText("تاریخچه و نسخه‌ها")).toBeTruthy();
    const closeBtn = screen.getByRole("button", { name: "بستن تاریخچه" });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Published versions list
    expect(await screen.findByText(/نسخهٔ 2/)).toBeTruthy();
    expect(screen.getByText("🟢 در حال نمایش زنده")).toBeTruthy();
    expect(screen.getByText(/نسخهٔ 1/)).toBeTruthy();

    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(2));

    // Activate the archived version 1
    const activateBtn = screen.getByRole("button", { name: /فعال‌سازی این نسخه/ });
    fireEvent.click(activateBtn);
    expect(onActivate).toHaveBeenCalledWith(1);
  });

  it("switches to revisions tab and restores a past revision", async () => {
    const onRestore = vi.fn();

    render(
      <VersionsPanel
        pageId="p1"
        refreshKey={0}
        canRestore={true}
        onRestore={onRestore}
        onActivate={vi.fn()}
      />
    );

    await screen.findByText(/نسخهٔ 2/);

    // Click revisions tab
    const revisionsTab = screen.getByRole("tab", { name: /ویرایش‌ها/ });
    fireEvent.click(revisionsTab);

    // Displays revisions
    expect(await screen.findByText(/ویرایش 3/)).toBeTruthy();
    expect(screen.getByText(/ویرایش 2/)).toBeTruthy();
    expect(screen.getByText(/ویرایش 1/)).toBeTruthy();

    // Past revisions have restore buttons
    const restoreBtns = screen.getAllByRole("button", { name: /بازگردانی به این ویرایش/ });
    expect(restoreBtns.length).toBe(2);

    fireEvent.click(restoreBtns[0]!);
    expect(onRestore).toHaveBeenCalledWith(2);
  });
});
