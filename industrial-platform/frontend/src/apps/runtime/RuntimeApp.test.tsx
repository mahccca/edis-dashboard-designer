import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { http } from "../../shared/api/http";
import { bundle } from "../../test/fixtures";
import { RuntimeApp } from "./RuntimeApp";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("RuntimeApp scenarios", () => {
  it("renders error message when site parameter is missing", () => {
    render(<RuntimeApp search="" />);
    expect(screen.getByText(/آدرس ناقص است/)).toBeTruthy();
  });

  it("renders ready bundle with SiteHeader, RuntimePage, and SiteFooter", async () => {
    vi.spyOn(http, "get").mockResolvedValue({
      data: bundle(),
      status: 200,
      etag: null,
    });

    render(<RuntimeApp search="?site=darkhoveyn&path=/plant/overview" />);

    await waitFor(() => {
      expect(screen.getByRole("banner")).toBeTruthy();
    });
    expect(screen.getByRole("contentinfo")).toBeTruthy();
  });

  it("handles corrupted or partial localStorage safely without crashing", async () => {
    localStorage.setItem("ip.siteLayout.darkhoveyn", JSON.stringify({
      header: { logo: { enabled: true } }, // missing size, title, menu!
    }));

    vi.spyOn(http, "get").mockResolvedValue({
      data: bundle(),
      status: 200,
      etag: null,
    });

    render(<RuntimeApp search="?site=darkhoveyn&path=/plant/overview" />);

    await waitFor(() => {
      expect(screen.getByRole("banner")).toBeTruthy();
    });
  });

  it("renders custom page builder header in persistent header slot when present", async () => {
    const customBundle = bundle();
    customBundle.document.root.children = [
      {
        id: "custom-hdr",
        type: "section",
        props: { isSiteHeader: true, fixedHeader: true },
        children: [
          {
            id: "title-node",
            type: "heading",
            props: { text: { fa: "هدر اختصاصی پایشگاه", en: "Custom Header" }, level: 2 },
          },
        ],
      },
    ];

    vi.spyOn(http, "get").mockResolvedValue({
      data: customBundle,
      status: 200,
      etag: null,
    });

    render(<RuntimeApp search="?site=darkhoveyn&path=/" />);

    await waitFor(() => {
      expect(screen.getByText("هدر اختصاصی پایشگاه")).toBeTruthy();
    });
  });

  it("shares main page header on sub-pages when sharedHeaderNode is in site layout", async () => {
    const subBundle = bundle();
    // Sub-page has NO header in its children
    subBundle.document.root.children = [
      {
        id: "sub-body",
        type: "text",
        props: { text: { fa: "محتوای صفحه دوم", en: "Page 2 content" } },
      },
    ];

    // Main page header stored in site layout storage
    localStorage.setItem("ip.siteLayout.darkhoveyn", JSON.stringify({
      header: {
        shareMainPageHeader: true,
        sharedHeaderNode: {
          id: "shared-main-hdr",
          type: "section",
          props: { isSiteHeader: true, fixedHeader: true },
          children: [
            {
              id: "t1",
              type: "heading",
              props: { text: { fa: "هدر مشترک سراسری کل پروژه", en: "Shared Header" }, level: 2 },
            },
          ],
        },
      },
    }));

    vi.spyOn(http, "get").mockResolvedValue({
      data: subBundle,
      status: 200,
      etag: null,
    });

    render(<RuntimeApp search="?site=darkhoveyn&path=/sub-page" />);

    await waitFor(() => {
      expect(screen.getByText("هدر مشترک سراسری کل پروژه")).toBeTruthy();
      expect(screen.getByText("محتوای صفحه دوم")).toBeTruthy();
    });
  });
});
