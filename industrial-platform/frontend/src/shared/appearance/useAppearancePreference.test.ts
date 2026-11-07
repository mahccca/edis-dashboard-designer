import { cleanup, renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useAppearancePreference } from "./useAppearancePreference";

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

beforeEach(() => {
  localStorage.clear();
});

describe("useAppearancePreference", () => {
  it("falls back to the document default, then stores the visitor choice", () => {
    const { result, rerender } = renderHook(
      ({ def }) => useAppearancePreference(def, "demo"),
      { initialProps: { def: "day" as const } },
    );
    expect(result.current.mode).toBe("day");
    act(() => result.current.setMode("night"));
    expect(result.current.mode).toBe("night");
    expect(localStorage.getItem("ip.appearanceMode.demo")).toBe("night");
    expect(document.documentElement.dataset.theme).toBe("night");
    rerender({ def: "day" });
    expect(result.current.mode).toBe("night");
  });
});
