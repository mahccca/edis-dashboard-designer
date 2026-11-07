import { useCallback, useState, type KeyboardEvent, type PointerEvent } from "react";
import styles from "./Editor.module.css";

export interface PanelSize {
  width: number;
  setWidth: (w: number) => void;
  reset: () => void;
  min: number;
  max: number;
}

const clamp = (v: number, min: number, max: number) => Math.round(Math.max(min, Math.min(max, v)));

/** Panel width persisted per browser; it is a personal editor preference, not part of any document. */
export function usePanelWidth(storageKey: string, initial: number, min: number, max: number): PanelSize {
  const [width, setRaw] = useState(() => {
    const stored = Number(globalThis.localStorage?.getItem(storageKey));
    return Number.isFinite(stored) && stored > 0 ? clamp(stored, min, max) : initial;
  });
  const setWidth = useCallback((w: number) => {
    const next = clamp(w, min, max);
    setRaw(next);
    globalThis.localStorage?.setItem(storageKey, String(next));
  }, [storageKey, min, max]);
  const reset = useCallback(() => {
    setRaw(initial);
    globalThis.localStorage?.removeItem(storageKey);
  }, [storageKey, initial]);
  return { width, setWidth, reset, min, max };
}

/** Sits on the panel's inline-end edge; dragging toward the canvas widens the panel in both LTR and RTL. */
export function ResizeHandle({ size, label }: { size: PanelSize; label: string }) {
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const rtl = getComputedStyle(handle).direction === "rtl";
    const startX = e.clientX;
    const startWidth = size.width;
    handle.setPointerCapture?.(e.pointerId);
    setDragging(true);
    const move = (ev: globalThis.PointerEvent) => size.setWidth(startWidth + (rtl ? startX - ev.clientX : ev.clientX - startX));
    const up = () => {
      setDragging(false);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const step = e.shiftKey ? 40 : 10;
    const grow = rtl ? "ArrowLeft" : "ArrowRight";
    const shrink = rtl ? "ArrowRight" : "ArrowLeft";
    if (e.key === grow) size.setWidth(size.width + step);
    else if (e.key === shrink) size.setWidth(size.width - step);
    else if (e.key === "Home") size.setWidth(size.min);
    else if (e.key === "End") size.setWidth(size.max);
    else return;
    e.preventDefault();
  };

  return (
    <div className={`${styles.resizeHandle} ${dragging ? styles.resizeHandleActive : ""}`}
         role="separator" aria-orientation="vertical" aria-label={label} tabIndex={0}
         aria-valuenow={size.width} aria-valuemin={size.min} aria-valuemax={size.max}
         title="بکشید تا اندازه تغییر کند — دوبار کلیک: اندازهٔ پیش‌فرض"
         onPointerDown={onPointerDown} onDoubleClick={size.reset} onKeyDown={onKeyDown} />
  );
}
