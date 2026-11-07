import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KPI_SPEC, pilotDocument } from "../../test/fixtures";
import { LayersPanel } from "./LayersPanel";

afterEach(cleanup);

function setup(selectedId: string | null) {
  const onAdd = vi.fn();
  const onMoveTo = vi.fn();
  render(<LayersPanel document={pilotDocument()} selectedId={selectedId} components={[KPI_SPEC]} errorIds={new Set()}
                      onSelect={vi.fn()} onAdd={onAdd} onRemove={vi.fn()} onMove={vi.fn()} onMoveTo={onMoveTo} />);
  const button = (name: RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;
  return { onAdd, onMoveTo, button };
}

function dataTransfer() {
  const data: Record<string, string> = {};
  return { setData: (k: string, v: string) => { data[k] = v; }, getData: (k: string) => data[k] ?? "", effectAllowed: "", dropEffect: "" };
}

describe("layers panel add buttons follow structural rules", () => {
  it("section: rows and headings yes, columns and KPI no", () => {
    const { button } = setup("sec-kpis");
    expect(button(/\+ row/).disabled).toBe(false);
    expect(button(/\+ heading/).disabled).toBe(false);
    expect(button(/\+ column/).disabled).toBe(true);
    expect(button(/کارت شاخص/).disabled).toBe(true);
  });

  it("row: only columns", () => {
    const { button } = setup("row-kpis");
    expect(button(/\+ column/).disabled).toBe(false);
    expect(button(/\+ text/).disabled).toBe(true);
  });

  it("column: KPI can be added", () => {
    const { button, onAdd } = setup("col-ac");
    fireEvent.click(button(/کارت شاخص/));
    expect(onAdd).toHaveBeenCalledWith("col-ac", "component", KPI_SPEC);
  });
});

describe("layers panel moves nodes between parents", () => {
  it("renders the document as a collapsible hierarchy", () => {
    setup(null);
    expect(screen.getByTestId("layer-kpi-ac-power")).toBeTruthy();
    const rowToggle = screen.getByTestId("layer-row-kpis").querySelector("button[aria-label]") as HTMLButtonElement;
    fireEvent.click(rowToggle);
    expect(screen.queryByTestId("layer-col-ac")).toBeNull();
    fireEvent.click(rowToggle);
    expect(screen.getByTestId("layer-kpi-ac-power")).toBeTruthy();
  });

  it("dropping on the top edge of a row places the item before it", () => {
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 0, height: 20 } as DOMRect);
    const { onMoveTo } = setup(null);
    const dt = dataTransfer();
    fireEvent.dragStart(screen.getByTestId("layer-row-kpis"), { dataTransfer: dt });
    const over = createEvent.dragOver(screen.getByTestId("layer-hd-title"), { dataTransfer: dt });
    Object.defineProperty(over, "clientY", { value: 2 });
    fireEvent(screen.getByTestId("layer-hd-title"), over);
    fireEvent.drop(screen.getByTestId("layer-hd-title"), { dataTransfer: dt });
    expect(onMoveTo).toHaveBeenCalledWith("row-kpis", "sec-kpis", 0);
    rect.mockRestore();
  });

  it("dragging a layer onto a container drops it inside", () => {
    const { onMoveTo } = setup(null);
    const dt = dataTransfer();
    fireEvent.dragStart(screen.getByTestId("layer-hd-title"), { dataTransfer: dt });
    fireEvent.dragOver(screen.getByTestId("layer-col-ac"), { dataTransfer: dt });
    fireEvent.drop(screen.getByTestId("layer-col-ac"), { dataTransfer: dt });
    expect(onMoveTo).toHaveBeenCalledWith("hd-title", "col-ac", 1);
  });

  it("an invalid drop target is ignored", () => {
    const { onMoveTo } = setup(null);
    const dt = dataTransfer();
    fireEvent.dragStart(screen.getByTestId("layer-col-ac"), { dataTransfer: dt });
    fireEvent.dragOver(screen.getByTestId("layer-hd-title"), { dataTransfer: dt });
    fireEvent.drop(screen.getByTestId("layer-hd-title"), { dataTransfer: dt });
    expect(onMoveTo).not.toHaveBeenCalled();
  });
});
