import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KPI_SPEC, pilotDocument, value } from "../../test/fixtures";
import { findNode } from "../document-engine";
import { KpiCard } from "./KpiCard";

const node = findNode(pilotDocument(), "kpi-ac-power")!.node;

afterEach(cleanup);

describe("KPI card renderer", () => {
  it("shows value with configured decimals, unit, time and the test-data badge", () => {
    const { container } = render(<KpiCard node={node} spec={KPI_SPEC} inputs={{ value: value() }} testData={{ value: true }} locale="en" />);
    expect(screen.getByText("Total AC power")).toBeTruthy();
    expect(screen.getByText("312.4")).toBeTruthy();
    expect(screen.getByText("kW")).toBeTruthy();
    expect(container.querySelector("time")?.getAttribute("dateTime")).toBe("2026-10-28T08:00:00+00:00");
    expect(screen.getByText("داده آزمایشی")).toBeTruthy();
    expect(container.firstElementChild?.getAttribute("data-test-data")).toBe("true");
  });

  it("never shows a number when there is no data", () => {
    const { container } = render(
      <KpiCard node={node} spec={KPI_SPEC} inputs={{ value: value({ value: null, quality: "no_data", sourceTimestamp: null }) }}
               testData={{ value: true }} locale="en" />,
    );
    expect(container.textContent).not.toMatch(/\d/);
    expect(screen.getByText("No data")).toBeTruthy();
    expect(container.firstElementChild?.getAttribute("data-quality")).toBe("no_data");
  });

  it("shows text values (not only numbers)", () => {
    render(
      <KpiCard
        node={node}
        spec={KPI_SPEC}
        inputs={{ value: value({ value: "نیروگاه خورشیدی دارخوین", unit: null }) }}
        testData={{ value: false }}
        locale="fa"
      />,
    );
    expect(screen.getByText("نیروگاه خورشیدی دارخوین")).toBeTruthy();
  });

  it("uses a live-bound title when present", () => {
    render(
      <KpiCard
        node={node}
        spec={KPI_SPEC}
        inputs={{
          value: value({ value: 12 }),
          title: value({ value: "عنوان زنده", unit: null }),
        }}
        testData={{ value: false }}
        locale="fa"
      />,
    );
    expect(screen.getByText("عنوان زنده")).toBeTruthy();
  });

  it("shows the test-data badge from bundle metadata even before the first value", () => {
    render(<KpiCard node={node} spec={KPI_SPEC} inputs={{}} testData={{ value: true }} locale="fa" />);
    expect(screen.getByText("داده آزمایشی")).toBeTruthy();
    expect(screen.getByText("در حال دریافت")).toBeTruthy();
  });

  it("has no badge for real (non-test) data and applies thresholds", () => {
    const { container } = render(
      <KpiCard node={node} spec={KPI_SPEC} inputs={{ value: value({ value: 5, isTestData: false, dataOrigin: "live" }) }}
               testData={{ value: false }} locale="en" />,
    );
    expect(screen.queryByText("داده آزمایشی")).toBeNull();
    expect(container.firstElementChild?.getAttribute("data-severity")).toBe("critical");
  });

  it("applies per-part appearance from partStyles", () => {
    const styled = {
      ...node,
      partStyles: {
        card: { background: "#203040", width: 280, height: 140 },
        title: { color: "#ffcc00" },
        value: { color: "#00ffaa", fontSize: 32, fontFamily: "tahoma" },
        unit: { color: "#8899aa" },
      },
    };
    const { container } = render(
      <KpiCard node={styled} spec={KPI_SPEC} inputs={{ value: value() }} testData={{ value: true }} locale="en" />,
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card.style.backgroundColor).toBe("rgb(32, 48, 64)");
    expect(card.style.width).toBe("280px");
    expect(card.style.height).toBe("140px");
    expect((card.querySelector("[data-style-part='title']") as HTMLElement).style.color).toBe("rgb(255, 204, 0)");
    const valueEl = card.querySelector("[data-style-part='value']") as HTMLElement;
    expect(valueEl.style.fontSize).toBe("32px");
    expect(valueEl.style.color).toBe("rgb(0, 255, 170)");
    expect(valueEl.style.fontFamily).toMatch(/Tahoma/);
    expect((card.querySelector("[data-style-part='unit']") as HTMLElement).style.color).toBe("rgb(136, 153, 170)");
  });
});

