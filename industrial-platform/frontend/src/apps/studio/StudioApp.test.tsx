import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { http } from "../../shared/api/http";
import type { Me, PageSummary, Project } from "../../shared/api/types";
import { StudioApp } from "./StudioApp";

const mockMe: Me = {
  user: {
    id: "user-1",
    username: "admin",
    displayName: "مدیر سیستم",
  },
  platformPermissions: ["platform.create_project"],
  csrfToken: "test-csrf",
  memberships: [],
};

const mockProject: Project = {
  id: "proj-123",
  slug: "darkhoveyn",
  name: "دارخوین",
};

const mockPages: PageSummary[] = [
  {
    id: "page-456",
    kind: "page",
    title: { fa: "صفحهٔ نخست", en: "Home" },
    slug: "home",
    path: "/home",
    status: "published",
    headRevision: 1,
    livePublishedVersionNo: 1,
    hasUnpublishedChanges: false,
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});

describe("StudioApp view and page persistence on reload", () => {
  it("defaults to projects view when no query params or storage exist", async () => {
    vi.spyOn(http, "get").mockImplementation(async (path: string) => {
      if (path === "/auth/me") return { data: mockMe, status: 200, etag: null };
      if (path === "/projects") return { data: { items: [mockProject] }, status: 200, etag: null };
      return { data: { items: [] }, status: 200, etag: null };
    });

    render(<StudioApp />);

    await waitFor(() => {
      expect(screen.getAllByText("پروژه‌ها").length).toBeGreaterThan(0);
    });
  });

  it("restores the active project and pages view when URL contains project and tab=pages", async () => {
    window.history.replaceState({}, "", "/?project=proj-123&tab=pages");

    vi.spyOn(http, "get").mockImplementation(async (path: string) => {
      if (path === "/auth/me") return { data: mockMe, status: 200, etag: null };
      if (path === "/projects/proj-123") return { data: mockProject, status: 200, etag: null };
      if (path === "/projects/proj-123/pages") return { data: { items: mockPages }, status: 200, etag: null };
      return { data: { items: [] }, status: 200, etag: null };
    });

    render(<StudioApp />);

    await waitFor(() => {
      expect(screen.getByText("دارخوین")).toBeTruthy();
      expect(screen.getByText("صفحهٔ نخست")).toBeTruthy();
    });
  });

  it("restores the exact page and editor when URL contains project, tab=editor, and page", async () => {
    window.history.replaceState({}, "", "/?project=proj-123&tab=editor&page=page-456");

    vi.spyOn(http, "get").mockImplementation(async (path: string) => {
      if (path === "/auth/me") return { data: mockMe, status: 200, etag: null };
      if (path === "/projects/proj-123") return { data: mockProject, status: 200, etag: null };
      if (path === "/projects/proj-123/pages") return { data: { items: mockPages }, status: 200, etag: null };
      if (path === "/pages/page-456") {
        return {
          data: {
            document: {
              schemaVersion: 1,
              documentType: "page",
              root: { id: "root", type: "page", children: [] },
            },
          },
          status: 200,
          etag: '"rev-1"',
        };
      }
      return { data: { items: [] }, status: 200, etag: null };
    });

    render(<StudioApp />);

    await waitFor(() => {
      expect(screen.getByText("صفحهٔ نخست")).toBeTruthy();
      expect(screen.getByTitle("بازگشت به صفحات")).toBeTruthy();
    });
  });
});
