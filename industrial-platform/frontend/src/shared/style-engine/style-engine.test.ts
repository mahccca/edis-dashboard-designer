import { describe, expect, it } from "vitest";
import { resolveStyle, themeVariables, tokenVar } from ".";

describe("style engine", () => {
  it("maps tokens to CSS variables and whitelisted properties", () => {
    expect(resolveStyle({ padding: { $token: "space.lg" }, background: { $token: "color.surface.base" }, columnSpan: 6, gap: 8 }))
      .toEqual({ padding: "var(--space-lg)", backgroundColor: "var(--color-surface-base)", gridColumn: "span 6", gap: "8px" });
    expect(resolveStyle({ padding: 16, marginX: "8px 12px", marginY: 4 }))
      .toEqual({ padding: "16px", marginInline: "8px 12px", marginBlock: "4px" });
  });

  it("drops anything that could inject CSS", () => {
    const out = resolveStyle({
      background: "url(javascript:alert(1))",
      color: "expression(alert(1))",
      width: "calc(100% - 1px)",
      padding: { $token: "space.lg;}body{x:y" },
      behavior: "url(x.htc)",
    } as never);
    expect(out).toEqual({});
    expect(tokenVar("a")).toBeNull();
  });

  it("accepts the contract's literal formats", () => {
    expect(resolveStyle({ color: "#fff", borderRadius: "8px", fontWeight: 700, textAlign: "center" }))
      .toEqual({ color: "#fff", borderRadius: "8px", fontWeight: 700, textAlign: "center" });
  });

  it("expands font aliases and maps box metrics", () => {
    expect(resolveStyle({ fontFamily: "vazirmatn", fontSize: 28, width: 240, height: 120, background: "#1a2330" }))
      .toEqual({
        fontFamily: "Vazirmatn, Tahoma, sans-serif",
        fontSize: "28px",
        width: "240px",
        height: "120px",
        backgroundColor: "#1a2330",
      });
  });

  it("flattens theme tokens and filters unsafe theme values", () => {
    expect(themeVariables({ color: { surface: { base: "#0f1419" } }, evil: "url(https://x)", space: { md: "16px" } }))
      .toEqual({ "--color-surface-base": "#0f1419", "--space-md": "16px" });
  });
});
