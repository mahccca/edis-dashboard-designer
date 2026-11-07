import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentSpec, DocNode } from "../api/types";
import { value } from "../../test/fixtures";
import { Chart } from "./Chart";

vi.mock("echarts/core", () => {
  const chart = {
    setOption: vi.fn(),
    clear: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  };
  return {
    init: vi.fn(() => chart),
    use: vi.fn(),
  };
});

vi.mock("echarts/charts", () => ({
  BarChart: {}, LineChart: {}, PieChart: {}, ScatterChart: {},
}));
vi.mock("echarts/components", () => ({
  DatasetComponent: {}, GridComponent: {}, LegendComponent: {}, TooltipComponent: {},
}));
vi.mock("echarts/renderers", () => ({ CanvasRenderer: {} }));

const SPEC: ComponentSpec = {
  id: "01929f3a-1000-7000-8000-000000000004",
  key: "industrial.chart",
  version: "1.0.0",
  name: { fa: "نمودار", en: "Chart" },
  category: "chart",
  status: "published",
  rendererId: "builtin.chart@1",
  properties: [],
  defaults: {
    title: "تولید",
    chartType: "bar",
    xField: "category",
    yFields: "power",
    height: 200,
  },
  inputs: [{ key: "dataset", dataType: "table", required: true }],
};

const node: DocNode = {
  id: "c1",
  type: "component",
  props: {},
  component: { definitionId: SPEC.id, version: SPEC.version },
};

afterEach(cleanup);

describe("Chart renderer", () => {
  it("asks to bind dataset when empty", () => {
    render(<Chart node={node} spec={SPEC} inputs={{}} testData={{}} locale="fa" />);
    expect(screen.getByText(/دادهٔ نمودار را از API بایند کنید/)).toBeTruthy();
    expect(document.querySelector("[data-renderer='builtin.chart@1']")).toBeTruthy();
  });

  it("renders a canvas host when dataset is bound", () => {
    const { container } = render(
      <Chart
        node={node}
        spec={SPEC}
        inputs={{
          dataset: value({
            value: [
              { category: "a", power: 1 },
              { category: "b", power: 2 },
            ],
            unit: null,
          }),
        }}
        testData={{}}
        locale="fa"
      />,
    );
    expect(screen.getByText("تولید")).toBeTruthy();
    expect(container.querySelector("[data-chart-type='bar']")).toBeTruthy();
    expect(container.querySelector("[class*='canvas'], .canvas")).toBeTruthy();
  });
});
