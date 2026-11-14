import { describe, expect, it } from "vitest";
import { extractJsonValue, formatKpiValue } from "./kpi-api";

describe("kpi-api extractJsonValue", () => {
  it("extracts root or empty path correctly", () => {
    expect(extractJsonValue({ val: 42 })).toEqual({ val: 42 });
    expect(extractJsonValue({ val: 42 }, "")).toEqual({ val: 42 });
    expect(extractJsonValue({ val: 42 }, "$")).toEqual({ val: 42 });
  });

  it("extracts dot-notation fields", () => {
    const data = {
      telemetry: {
        power: {
          active: 312.45,
          unit: "kW",
        },
      },
    };
    expect(extractJsonValue(data, "telemetry.power.active")).toBe(312.45);
    expect(extractJsonValue(data, "$.telemetry.power.unit")).toBe("kW");
    expect(extractJsonValue(data, "telemetry.missing")).toBeUndefined();
  });

  it("extracts array indexing", () => {
    const data = {
      items: [
        { metric: "voltage", value: 380 },
        { metric: "frequency", value: 50 },
      ],
    };
    expect(extractJsonValue(data, "items[0].value")).toBe(380);
    expect(extractJsonValue(data, "$.items[1].metric")).toBe("frequency");
    expect(extractJsonValue(data, "items[5].value")).toBeUndefined();
  });
});

describe("kpi-api formatKpiValue", () => {
  it("formats numbers and decimals", () => {
    expect(formatKpiValue(100)).toBe("100");
    expect(formatKpiValue(100.5678)).toBe("100.57");
    expect(formatKpiValue(0)).toBe("0");
  });

  it("formats null and undefined", () => {
    expect(formatKpiValue(null)).toBe("—");
    expect(formatKpiValue(undefined)).toBe("—");
  });

  it("formats boolean values", () => {
    expect(formatKpiValue(true)).toBe("فعال");
    expect(formatKpiValue(false)).toBe("غیرفعال");
  });

  it("formats rich object with value prop", () => {
    expect(formatKpiValue({ value: 85.341 })).toBe("85.34");
  });
});

