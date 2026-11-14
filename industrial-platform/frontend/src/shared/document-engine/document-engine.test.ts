import { describe, expect, it } from "vitest";
import { KPI_SPEC, pilotDocument } from "../../test/fixtures";
import {
  ConstraintError, canContain, collectIds, createButtonNode, createHeaderSection, createMonitoringHeaderSection, createNode, duplicateIds, findNode, history, insertChild, moveNode, moveNodeTo,
  moveViolation, newId, nodeIdForPointer, removeNode, updateNode,
} from ".";

describe("re-parenting nodes between containers", () => {
  function twoSections() {
    let doc = pilotDocument();
    doc = insertChild(doc, "root", { id: "sec-b", type: "section", children: [] });
    doc = insertChild(doc, "sec-b", { id: "row-b", type: "row", children: [] });
    return doc;
  }

  it("moves a column with its whole subtree to a row in another section", () => {
    const doc = twoSections();
    const moved = moveNodeTo(doc, "col-ac", "row-b");
    expect(findNode(moved, "col-ac")?.parent?.id).toBe("row-b");
    expect(findNode(moved, "kpi-ac-power")?.parent?.id).toBe("col-ac");
    expect(findNode(moved, "row-kpis")?.node.children).toEqual([]);
    expect(duplicateIds(moved)).toEqual([]);
    expect(findNode(doc, "col-ac")?.parent?.id).toBe("row-kpis");
  });

  it("places the node at the requested index among the new siblings", () => {
    const doc = twoSections();
    const moved = moveNodeTo(doc, "hd-title", "sec-b", 0);
    expect(findNode(moved, "sec-b")?.node.children?.map((c) => c.id)).toEqual(["hd-title", "row-b"]);
    const within = moveNodeTo(doc, "hd-title", "sec-kpis", 1);
    expect(findNode(within, "sec-kpis")?.node.children?.map((c) => c.id)).toEqual(["row-kpis", "hd-title"]);
  });

  it("returns the same document when the position does not change", () => {
    const doc = pilotDocument();
    expect(moveNodeTo(doc, "hd-title", "sec-kpis", 0)).toBe(doc);
    expect(moveNodeTo(doc, "row-kpis", "sec-kpis")).toBe(doc);
  });

  it("rejects moves that break structure or create cycles", () => {
    const doc = twoSections();
    expect(moveViolation(doc, "sec-kpis", "col-ac")).toMatch(/inside itself/);
    expect(moveViolation(doc, "root", "sec-b")).toMatch(/root/);
    expect(moveViolation(doc, "col-ac", "sec-b")).toMatch(/column cannot be placed inside section/);
    expect(moveViolation(doc, "kpi-ac-power", "sec-b", KPI_SPEC)).not.toBeNull();
    expect(() => moveNodeTo(doc, "row-kpis", "row-b")).toThrow(ConstraintError);
  });
});

describe("child constraints (mirror node.schema.json)", () => {
  it.each([
    ["root", "section", true], ["root", "row", false], ["section", "row", true], ["section", "column", false],
    ["row", "column", true], ["row", "heading", false], ["column", "heading", true], ["heading", "text", false],
    ["column", "row", true], ["section", "root", false],
  ] as const)("%s > %s = %s", (parent, child, ok) => {
    expect(canContain(parent, child, undefined, "page")).toBe(ok);
  });

  it("respects component layoutConstraints", () => {
    expect(canContain("column", "component", KPI_SPEC, "page")).toBe(true);
    expect(canContain("section", "component", KPI_SPEC, "page")).toBe(false);
    expect(canContain("column", "component", KPI_SPEC, "template_part")).toBe(false);
  });
});

describe("tree operations are immutable and keep ids unique", () => {
  it("inserts, updates, moves and removes", () => {
    const doc = pilotDocument();
    const col = createNode("column", collectIds(doc));
    const withCol = insertChild(doc, "row-kpis", col);
    expect(doc.root.children?.[0]?.children?.[1]?.children).toHaveLength(1);
    expect(findNode(withCol, col.id)?.parent?.id).toBe("row-kpis");

    const kpi = createNode("component", collectIds(withCol), KPI_SPEC);
    const withKpi = insertChild(withCol, col.id, kpi, KPI_SPEC);
    expect(findNode(withKpi, kpi.id)?.node.component?.version).toBe("1.2.0");

    const renamed = updateNode(withKpi, kpi.id, (n) => ({ ...n, props: { ...n.props, decimals: 2 } }));
    expect(findNode(renamed, kpi.id)?.node.props?.decimals).toBe(2);
    expect(findNode(withKpi, kpi.id)?.node.props?.decimals).toBeUndefined();

    const moved = moveNode(renamed, col.id, -1);
    expect(findNode(moved, "row-kpis")?.node.children?.[0]?.id).toBe(col.id);

    const removed = removeNode(moved, col.id);
    expect(findNode(removed, kpi.id)).toBeNull();
    expect(duplicateIds(removed)).toEqual([]);
  });

  it("rejects invalid placements and duplicate ids", () => {
    const doc = pilotDocument();
    expect(() => insertChild(doc, "sec-kpis", { id: "col-x1", type: "column" })).toThrow(ConstraintError);
    expect(() => insertChild(doc, "col-ac", { id: "kpi-ac-power", type: "text" })).toThrow(/duplicate/);
    expect(() => removeNode(doc, "root")).toThrow(ConstraintError);
  });

  it("generates schema-valid unique ids", () => {
    const taken = new Set(["kpi-00000"]);
    let calls = 0;
    const id = newId("KPI", taken, () => (calls++ === 0 ? 0 : 0.5));
    expect(id).toMatch(/^[a-z][a-z0-9_-]{2,63}$/);
    expect(taken.has(id)).toBe(false);
  });
});

describe("server error pointers map to nodes", () => {
  it("finds the deepest node", () => {
    const doc = pilotDocument();
    expect(nodeIdForPointer(doc, "/content/root/children/0/children/1/children/0/children/0/props/decimals")).toBe("kpi-ac-power");
    expect(nodeIdForPointer(doc, "/content/root/children/0/style/background")).toBe("sec-kpis");
    expect(nodeIdForPointer(doc, "/content/settings")).toBeNull();
  });
});

describe("undo/redo history", () => {
  it("undoes and redoes", () => {
    let h = history.init(1);
    h = history.push(h, 2);
    h = history.checkpoint(h);
    h = history.replace(h, 20);
    expect(h.present).toBe(20);
    h = history.undo(h);
    expect(h.present).toBe(2);
    h = history.push(h, 3);
    h = history.undo(h);
    expect(h.present).toBe(2);
    h = history.redo(h);
    expect(h.present).toBe(3);
    h = history.undo(history.undo(h));
    h = history.push(h, 9);
    expect(h.present).toBe(9);
    expect(h.future).toEqual([]);
    expect(history.undo(history.init(0))).toEqual(history.init(0));
  });
});

describe("button and header presets", () => {
  it("creates a button node with navigation link", () => {
    const btn = createButtonNode(new Set(["btn-taken"]), "پایش", "/plant");
    expect(btn.type).toBe("text");
    expect(btn.props?.asButton).toBe(true);
    expect(btn.props?.link).toBe("/plant");
    expect(btn.id).not.toBe("btn-taken");
  });

  it("creates a fixed header section with brand title and navigation buttons", () => {
    const hdr = createHeaderSection(new Set(), "پلتفرم صنعتی");
    expect(hdr.type).toBe("section");
    expect(hdr.props?.fixedHeader).toBe(true);
    expect(hdr.children).toHaveLength(1);
    const row = hdr.children![0];
    expect(row!.type).toBe("row");
    expect(row!.children).toHaveLength(2);
  });

  it("creates a monitoring header section with KPI telemetry and navigation", () => {
    const monHdr = createMonitoringHeaderSection(new Set(), KPI_SPEC, "مجتمع فولاد");
    expect(monHdr.type).toBe("section");
    expect(monHdr.props?.fixedHeader).toBe(true);
    expect(monHdr.children).toHaveLength(1);
    const row = monHdr.children![0];
    expect(row!.type).toBe("row");
    // Column 1: Brand/Logo, Column 2: KPI Widget, Column 3: Navigation buttons
    expect(row!.children).toHaveLength(3);
    const kpiCol = row!.children![1];
    expect(kpiCol!.children![0]!.type).toBe("component");
    expect(kpiCol!.children![0]!.component?.definitionKey).toBe("industrial.kpi-card");
  });
});
