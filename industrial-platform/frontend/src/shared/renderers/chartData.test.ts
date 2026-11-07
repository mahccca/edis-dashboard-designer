import { describe, expect, it } from "vitest";
import { extractRows, normalizeChart } from "./chartData";

describe("chartData", () => {
  it("extracts rows from a plain object array", () => {
    const rows = extractRows([
      { category: "a", power: 1 },
      { category: "b", power: 2 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.power).toBe(1);
  });

  it("unwraps { items: [...] } API envelopes", () => {
    expect(extractRows({ items: [{ x: 1, value: 9 }] })).toEqual([{ x: 1, value: 9 }]);
  });

  it("builds multi-series from wide rows", () => {
    const n = normalizeChart(
      [
        { category: "a", power: 10, energy: 3 },
        { category: "b", power: 20, energy: 5 },
      ],
      { chartType: "combo", xField: "category", yFields: "power,energy", seriesTypes: "bar,line" },
    );
    expect(n.categories).toEqual(["a", "b"]);
    expect(n.series.map((s) => s.name)).toEqual(["power", "energy"]);
    expect(n.series[0]?.type).toBe("bar");
    expect(n.series[1]?.type).toBe("line");
    expect(n.series[0]?.data).toEqual([10, 20]);
  });

  it("pivots long-format metric rows", () => {
    const n = normalizeChart(
      [
        { month: "Jan", metric: "A", value: 1 },
        { month: "Jan", metric: "B", value: 2 },
        { month: "Feb", metric: "A", value: 3 },
        { month: "Feb", metric: "B", value: 4 },
      ],
      { chartType: "line", xField: "month", yFields: "value", seriesField: "metric" },
    );
    expect(n.categories).toEqual(["Jan", "Feb"]);
    expect(n.series.map((s) => s.name).sort()).toEqual(["A", "B"]);
    expect(n.series.find((s) => s.name === "A")?.data).toEqual([1, 3]);
  });

  it("builds pie slices from the first series", () => {
    const n = normalizeChart(
      [{ name: "x", value: 4 }, { name: "y", value: 6 }],
      { chartType: "pie", xField: "name", yFields: "value" },
    );
    expect(n.pie).toEqual([
      { name: "x", value: 4 },
      { name: "y", value: 6 },
    ]);
  });
});
