import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BINDING_ID, bundle, value } from "../../test/fixtures";
import { RuntimePage, showsTestData } from "./RuntimePage";

afterEach(cleanup);

describe("runtime page", () => {
  it("renders the published document with live values and a page-level test-data banner", () => {
    render(<RuntimePage bundle={bundle()} values={{ [BINDING_ID]: value() }} locale="en" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Plant overview");
    expect(screen.getByText("312.4")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("داده آزمایشی");
  });

  it("always shows the test-data label when any value is test data, even if the bundle says otherwise", () => {
    const b = bundle({ containsTestData: false, bindingOrigins: {} });
    expect(showsTestData(b, {})).toBe(false);
    expect(showsTestData(b, { [BINDING_ID]: value() })).toBe(true);
    render(<RuntimePage bundle={b} values={{ [BINDING_ID]: value() }} locale="fa" />);
    expect(screen.getAllByText(/داده آزمایشی/).length).toBeGreaterThanOrEqual(2);
  });

  it("renders unknown renderers as an explicit placeholder, never as code", () => {
    const b = bundle({ components: [{ ...bundle().components[0]!, rendererId: "evil.script@1" }] });
    render(<RuntimePage bundle={b} values={{}} locale="en" />);
    expect(screen.getByText(/کامپوننت پشتیبانی‌نشده/)).toBeTruthy();
  });

  it("renders a sticky header section with data-node-role='header' and button links", () => {
    const customBundle = {
      ...bundle(),
      document: {
        schemaVersion: 1,
        documentType: "page" as const,
        settings: {},
        root: {
          id: "root",
          type: "root" as const,
          children: [
            {
              id: "sec-header",
              type: "section" as const,
              props: { fixedHeader: true },
              children: [
                {
                  id: "btn-nav",
                  type: "text" as const,
                  props: {
                    text: { fa: "مشاهده گزارشات", en: "View Reports" },
                    asButton: true,
                    buttonVariant: "primary",
                    link: "/reports",
                    linkTarget: "_blank",
                  },
                },
              ],
            },
          ],
        },
      },
    };

    const { container } = render(<RuntimePage bundle={customBundle} values={{}} locale="fa" />);
    const headerSection = container.querySelector("[data-node-role='header']");
    expect(headerSection).toBeTruthy();

    const link = screen.getByRole("link", { name: "مشاهده گزارشات" });
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toContain("/reports");
    expect(link.getAttribute("target")).toBe("_blank");
  });
});
