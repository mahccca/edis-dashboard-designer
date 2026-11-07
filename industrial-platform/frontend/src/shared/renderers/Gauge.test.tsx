import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ComponentSpec, DocNode } from "../api/types";
import { value } from "../../test/fixtures";
import { Gauge } from "./Gauge";

const SPEC: ComponentSpec = {
  id: "01929f3a-1000-7000-8000-000000000002",
  key: "industrial.gauge",
  version: "1.0.0",
  name: { fa: "گیج", en: "Gauge" },
  category: "gauge",
  status: "published",
  rendererId: "builtin.gauge@1",
  properties: [],
  defaults: { title: "Pressure", unit: "bar", min: 0, max: 100, decimals: 1 },
  inputs: [
    { key: "value", dataType: "number", required: true },
    { key: "min", dataType: "number" },
    { key: "max", dataType: "number" },
  ],
};

const node: DocNode = {
  id: "g1",
  type: "component",
  props: {},
  component: { definitionId: SPEC.id, version: SPEC.version },
};

afterEach(cleanup);

describe("Gauge renderer", () => {
  it("renders a numeric reading on the semi-circle", () => {
    const { container } = render(
      <Gauge node={node} spec={SPEC} inputs={{ value: value({ value: 42.5, unit: "bar" }) }} testData={{}} locale="en" />,
    );
    expect(screen.getByText("Pressure")).toBeTruthy();
    expect(screen.getByText("42.5")).toBeTruthy();
    expect(screen.getByText("bar")).toBeTruthy();
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.firstElementChild?.getAttribute("data-renderer")).toBe("builtin.gauge@1");
  });

  it("shows a dash when there is no usable value", () => {
    render(
      <Gauge
        node={node}
        spec={SPEC}
        inputs={{ value: value({ value: null, quality: "no_data", sourceTimestamp: null }) }}
        testData={{}}
        locale="fa"
      />,
    );
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("prefers bound min/max from API over prop defaults", () => {
    const { container } = render(
      <Gauge
        node={node}
        spec={SPEC}
        inputs={{
          value: value({ value: 75 }),
          min: value({ value: 50, unit: null }),
          max: value({ value: 150, unit: null }),
        }}
        testData={{}}
        locale="en"
      />,
    );
    expect(container.firstElementChild?.getAttribute("data-min")).toBe("50");
    expect(container.firstElementChild?.getAttribute("data-max")).toBe("150");
  });
});
