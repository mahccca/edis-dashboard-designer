import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DocNode, DocumentContent, StyleValue } from "../../shared/api/types";
import { FONT_STACKS } from "../../shared/style-engine";
import {
  ALL_PART,
  partDef,
  readPagePartStyle,
  readPartStyle,
  type AppearanceMode,
  type StylePartDef,
  type StyleScope,
} from "../../shared/style-engine/parts";
import styles from "./StylePopover.module.css";

const FONT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "vazirmatn", label: "وزیرمتن" },
  { value: "system-ui", label: "سیستم" },
  { value: "tahoma", label: "Tahoma" },
  { value: "georgia", label: "Georgia" },
  { value: "monospace", label: "monospace" },
];

export interface StyleTarget {
  nodeId: string;
  part: string;
  parts: StylePartDef[];
  anchor: DOMRect;
}

interface Props {
  target: StyleTarget;
  node: DocNode;
  document: DocumentContent;
  mode: AppearanceMode;
  onModeChange: (mode: AppearanceMode) => void;
  onChange: (part: string, key: string, value: StyleValue | undefined, mode: AppearanceMode) => void;
  onClose: () => void;
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 0 0 11.5 11.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: unknown; onChange: (v: string | undefined) => void }) {
  const hex = typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : "";
  const picker = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : (hex.slice(0, 7) || (label.includes("پس") ? "#18202a" : "#8b98a5"));
  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      <div className={styles.row}>
        <input className={styles.colorSwatch} type="color" value={picker} aria-label={label}
               onChange={(e) => onChange(e.target.value)} />
        <input className={styles.input} dir="ltr" placeholder="#RRGGBB" value={typeof value === "string" ? value : ""}
               onChange={(e) => onChange(e.target.value || undefined)} />
        {value !== undefined && value !== "" && (
          <button type="button" className={styles.button} onClick={() => onChange(undefined)}>پاک</button>
        )}
      </div>
    </div>
  );
}

export function StylePopover({ target, node, document, mode, onModeChange, onChange, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [scope, setScope] = useState<StyleScope>("part");
  const activePart = scope === "all" ? "all" : target.part;
  const def = scope === "all" ? ALL_PART : (partDef(target.parts, target.part) ?? target.parts[0]);
  const style = scope === "all"
    ? readPagePartStyle(document.settings, "all", mode)
    : readPartStyle(node, activePart, mode);
  const fontValue = typeof style.fontFamily === "string" && style.fontFamily in FONT_STACKS ? style.fontFamily : "";

  useLayoutEffect(() => {
    const el = ref.current;
    const a = target.anchor;
    const pad = 8;
    const w = el?.offsetWidth ?? 300;
    const h = el?.offsetHeight ?? 280;
    let left = a.left + a.width / 2 - w / 2;
    let top = a.bottom + pad;
    left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
    if (top + h > window.innerHeight - pad) top = Math.max(pad, a.top - h - pad);
    setPos({ top, left });
  }, [target, mode, scope]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!ref.current || ref.current.contains(t)) return;
      if (t?.closest?.("[data-style-part], [data-node-id]")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  // Reset to part scope when picking a new canvas target.
  useEffect(() => { setScope("part"); }, [target.nodeId, target.part]);

  if (!def) return null;

  const patch = (key: string, value: StyleValue | undefined) => onChange(activePart, key, value, mode);

  return (
    <div ref={ref} className={styles.popover} data-theme={mode} style={{ top: pos.top, left: pos.left }}
         role="dialog" aria-label={`ویرایش استایل ${def.label.fa}`}>
      <div className={styles.header}>
        <span className={styles.title}>{def.label.fa}</span>
        <div className={styles.headerActions}>
          <div className={styles.schemeToggle} role="group" aria-label="حالت شب و روز">
            <button type="button" className={styles.schemeBtn} aria-pressed={mode === "day"} aria-label="حالت روز"
                    title="روز" onClick={() => onModeChange("day")}>
              <SunIcon />
            </button>
            <button type="button" className={styles.schemeBtn} aria-pressed={mode === "night"} aria-label="حالت شب"
                    title="شب" onClick={() => onModeChange("night")}>
              <MoonIcon />
            </button>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="بستن">×</button>
        </div>
      </div>

      <div className={styles.scopeTabs} role="tablist" aria-label="محدوده تنظیم">
        <button type="button" className={styles.scopeTab} role="tab" aria-pressed={scope === "part"}
                onClick={() => setScope("part")}>این بخش</button>
        <button type="button" className={styles.scopeTab} role="tab" aria-pressed={scope === "all"}
                onClick={() => setScope("all")}>همه آیتم‌ها</button>
      </div>

      <div className={styles.hint}>
        {mode === "day" ? "تنظیمات حالت روز" : "تنظیمات حالت شب"}
        {scope === "all" ? " — برای همه المان‌های این صفحه (کارت‌ها، متن‌ها، باکس‌ها)" : " — فقط همین بخش"}
      </div>

      {(def.fields.includes("width") || def.fields.includes("height") || def.fields.includes("fontSize")) && (
        <div className={styles.field}>
          <span className={styles.label}>اندازه</span>
          <div className={styles.row}>
            {def.fields.includes("width") && (
              <label className={styles.field} style={{ flex: 1 }}>
                <span className={styles.label}>عرض</span>
                <input className={styles.input} type="number" min={120} max={1200} placeholder="px"
                       value={style.width === undefined ? "" : String(style.width)}
                       onChange={(e) => patch("width", e.target.value === "" ? undefined : Number(e.target.value))} />
              </label>
            )}
            {def.fields.includes("height") && (
              <label className={styles.field} style={{ flex: 1 }}>
                <span className={styles.label}>ارتفاع</span>
                <input className={styles.input} type="number" min={80} max={800} placeholder="px"
                       value={style.height === undefined ? "" : String(style.height)}
                       onChange={(e) => patch("height", e.target.value === "" ? undefined : Number(e.target.value))} />
              </label>
            )}
            {def.fields.includes("fontSize") && (
              <label className={styles.field} style={{ flex: 1 }}>
                <span className={styles.label}>فونت</span>
                <input className={styles.input} type="number" min={10} max={96} placeholder="px"
                       value={style.fontSize === undefined ? "" : String(style.fontSize)}
                       onChange={(e) => patch("fontSize", e.target.value === "" ? undefined : Number(e.target.value))} />
              </label>
            )}
          </div>
        </div>
      )}

      {(def.fields.includes("padding") || def.fields.includes("margin")) && (
        <div className={styles.field}>
          <span className={styles.label}>فاصله</span>
          <div className={styles.row}>
            {def.fields.includes("padding") && (
              <label className={styles.field} style={{ flex: 1 }}>
                <span className={styles.label}>padding</span>
                <input className={styles.input} dir="ltr" placeholder="16 یا 8px 12px"
                       value={style.padding === undefined ? "" : String(style.padding)}
                       onChange={(e) => {
                         const t = e.target.value.trim();
                         if (!t) return patch("padding", undefined);
                         patch("padding", /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : t);
                       }} />
              </label>
            )}
            {def.fields.includes("margin") && (
              <label className={styles.field} style={{ flex: 1 }}>
                <span className={styles.label}>margin</span>
                <input className={styles.input} dir="ltr" placeholder="8 یا 0 12px"
                       value={style.margin === undefined ? "" : String(style.margin)}
                       onChange={(e) => {
                         const t = e.target.value.trim();
                         if (!t) return patch("margin", undefined);
                         patch("margin", /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : t);
                       }} />
              </label>
            )}
          </div>
        </div>
      )}

      {def.fields.includes("background") && (
        <ColorRow label="رنگ پس‌زمینه" value={style.background} onChange={(v) => patch("background", v)} />
      )}
      {def.fields.includes("color") && (
        <ColorRow label="رنگ متن" value={style.color} onChange={(v) => patch("color", v)} />
      )}
      {def.fields.includes("fontFamily") && (
        <label className={styles.field}>
          <span className={styles.label}>فونت</span>
          <select className={styles.select} value={fontValue}
                  onChange={(e) => patch("fontFamily", e.target.value || undefined)}>
            <option value="">پیش‌فرض</option>
            {FONT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
