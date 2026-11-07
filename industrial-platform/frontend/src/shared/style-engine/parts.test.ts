import { describe, expect, it } from "vitest";
import type { DocNode, DocumentContent } from "../api/types";
import { pagePartBag, patchPagePartStyle, patchPartStyle, readPagePartStyle, readPartStyle, resolvePartStyle } from "./parts";

const base: DocNode = { id: "kpi-1", type: "component", component: { definitionId: "x", version: "1.2.0" } };
const doc = (): DocumentContent => ({
  schemaVersion: 1, documentType: "page", root: { id: "root", type: "root", children: [] },
});

describe("partStyles", () => {
  it("reads legacy node.style as the card box (night)", () => {
    const node = { ...base, style: { background: "#111", width: 200 } };
    expect(readPartStyle(node, "card", "night")).toEqual({ background: "#111", width: 200 });
  });

  it("keeps day and night styles separate", () => {
    let node = patchPartStyle(base, "value", "color", "#fff", "night");
    node = patchPartStyle(node, "value", "color", "#000", "day");
    expect(readPartStyle(node, "value", "night").color).toBe("#fff");
    expect(readPartStyle(node, "value", "day").color).toBe("#000");
  });

  it("applies node `all` defaults under specific parts", () => {
    let node = patchPartStyle(base, "all", "fontFamily", "tahoma", "night");
    node = patchPartStyle(node, "all", "background", "#203040", "night");
    node = patchPartStyle(node, "title", "color", "#ff0", "night");
    expect(readPartStyle(node, "title", "night")).toEqual({ fontFamily: "tahoma", color: "#ff0" });
    expect(readPartStyle(node, "card", "night").background).toBe("#203040");
    expect(resolvePartStyle(node, "title", "night").fontFamily).toMatch(/Tahoma/);
  });

  it("applies page-wide `all` to every card and box, including the previously selected override", () => {
    const withLocal: DocumentContent = {
      ...doc(),
      root: {
        id: "root", type: "root",
        children: [patchPartStyle(base, "card", "background", "#111111", "night")],
      },
    };
    const page = patchPagePartStyle(withLocal, "all", "background", "#00aa00", "night");
    expect(readPagePartStyle(page.settings, "all", "night").background).toBe("#00aa00");
    const selected = page.root.children![0]!;
    // Local override must be cleared so the selected card also turns green.
    expect(selected.partStyles?.card?.background).toBeUndefined();
    const pageBag = pagePartBag(page.settings, "night");
    expect(readPartStyle(selected, "card", "night", pageBag).background).toBe("#00aa00");
  });

  it("keeps day and night page styles separate", () => {
    let page = patchPagePartStyle(doc(), "all", "background", "#001100", "night");
    page = patchPagePartStyle(page, "all", "background", "#eeffee", "day");
    expect(readPagePartStyle(page.settings, "all", "night").background).toBe("#001100");
    expect(readPagePartStyle(page.settings, "all", "day").background).toBe("#eeffee");
  });

  it("stores box edits per scheme instead of shared node.style", () => {
    let node: DocNode = { id: "s", type: "section", style: { background: "#legacy" } };
    node = patchPartStyle(node, "box", "background", "#day", "day");
    expect(node.style?.background).toBeUndefined();
    expect(readPartStyle(node, "box", "day").background).toBe("#day");
    expect(readPartStyle(node, "box", "night").background).toBeUndefined();
    node = patchPartStyle(node, "box", "background", "#night", "night");
    expect(readPartStyle(node, "box", "night").background).toBe("#night");
    expect(readPartStyle(node, "box", "day").background).toBe("#day");
  });

  it("patches and clears part fields without leaving empty maps", () => {
    let node = patchPartStyle(base, "title", "color", "#abc", "night");
    expect(node.partStyles).toEqual({ title: { color: "#abc" } });
    node = patchPartStyle(node, "title", "color", undefined, "night");
    expect(node.partStyles).toBeUndefined();
  });
});
