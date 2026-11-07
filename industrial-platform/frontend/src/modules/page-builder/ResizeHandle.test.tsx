import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ResizeHandle, usePanelWidth } from "./ResizeHandle";

const KEY = "test.panelWidth";

function Harness() {
  const size = usePanelWidth(KEY, 280, 200, 640);
  return <div dir="ltr"><ResizeHandle size={size} label="resize" /></div>;
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("resizable layers panel", () => {
  it("resizes with the keyboard, clamps to the limits and remembers the width", () => {
    render(<Harness />);
    const handle = screen.getByRole("separator");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(handle.getAttribute("aria-valuenow")).toBe("290");
    fireEvent.keyDown(handle, { key: "ArrowLeft", shiftKey: true });
    expect(handle.getAttribute("aria-valuenow")).toBe("250");
    fireEvent.keyDown(handle, { key: "End" });
    expect(handle.getAttribute("aria-valuenow")).toBe("640");
    expect(localStorage.getItem(KEY)).toBe("640");

    cleanup();
    render(<Harness />);
    expect(screen.getByRole("separator").getAttribute("aria-valuenow")).toBe("640");
  });

  it("double click restores the default width", () => {
    localStorage.setItem(KEY, "500");
    render(<Harness />);
    const handle = screen.getByRole("separator");
    fireEvent.doubleClick(handle);
    expect(handle.getAttribute("aria-valuenow")).toBe("280");
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("ignores out-of-range stored values", () => {
    localStorage.setItem(KEY, "5000");
    render(<Harness />);
    expect(screen.getByRole("separator").getAttribute("aria-valuenow")).toBe("640");
  });
});
