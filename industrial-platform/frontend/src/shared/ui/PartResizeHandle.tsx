import { useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import styles from "./PartResizeHandle.module.css";

export type ResizeMode = "box" | "font";

interface Props {
  mode: ResizeMode;
  /** Current width/height or fontSize in px (measured if not stored yet). */
  start: { width: number; height: number; fontSize: number };
  min?: { width?: number; height?: number; fontSize?: number };
  max?: { width?: number; height?: number; fontSize?: number };
  onResize: (next: { width?: number; height?: number; fontSize?: number }) => void;
  /** Called once when a drag gesture begins (for undo checkpoint). */
  onResizeStart?: () => void;
  label: string;
}

/** Corner drag handle for card box size or text part font size. */
export function PartResizeHandle({ mode, start, min, max, onResize, onResizeStart, label }: Props) {
  const drag = useRef<{ x: number; y: number; width: number; height: number; fontSize: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, width: start.width, height: start.height, fontSize: start.fontSize };
    onResizeStart?.();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return;
    e.preventDefault();
    e.stopPropagation();
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (mode === "box") {
      const width = clamp(Math.round(drag.current.width + dx), min?.width ?? 160, max?.width ?? 1200);
      const height = clamp(Math.round(drag.current.height + dy), min?.height ?? 96, max?.height ?? 800);
      onResize({ width, height });
    } else {
      const delta = Math.round((dx + dy) / 2);
      const fontSize = clamp(Math.round(drag.current.fontSize + delta), min?.fontSize ?? 10, max?.fontSize ?? 96);
      onResize({ fontSize });
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return;
    e.stopPropagation();
    drag.current = null;
    try { (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId); } catch { /* already released */ }
  };

  const onClick = (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <button
      type="button"
      className={`${styles.handle} ${mode === "font" ? styles.fontHandle : styles.boxHandle}`}
      aria-label={label}
      title={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={onClick}
    />
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
