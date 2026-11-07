import type { CSSProperties } from "react";
import type { StyleBlock, StyleValue } from "../api/types";

// Mirrors common.schema.json#/$defs/{cssLength,color,styleValue}. The server already rejects anything else;
// the renderer drops non-matching values again so a bad bundle can never inject CSS.
const CSS_LENGTH = /^(0|auto|-?[0-9]+(\.[0-9]+)?(px|rem|em|%|vh|vw|fr))$/;
/** padding/margin may be 1–4 lengths, e.g. "8px 16px" or "8px 12px 8px 12px". */
const CSS_LENGTH_LIST = /^(0|auto|-?[0-9]+(\.[0-9]+)?(px|rem|em|%|vh|vw|fr))(\s+(0|auto|-?[0-9]+(\.[0-9]+)?(px|rem|em|%|vh|vw|fr))){0,3}$/;
const COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*[0-9]{1,3}\s*,\s*[0-9]{1,3}\s*,\s*[0-9]{1,3}\s*(,\s*(0|1|0?\.[0-9]+)\s*)?\)|transparent)$/;
const KEYWORD = /^[a-z][a-z-]{0,31}$/;
const TOKEN = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9-]+){1,4}$/;
const THEME_VALUE = /^[#a-zA-Z0-9 .,()%/-]{1,120}$/;

const UNITLESS = new Set(["opacity", "fontWeight", "lineHeight", "columnSpan", "rowSpan", "gridColumns", "gridRows"]);
const SPACING_KEYS = new Set(["padding", "paddingX", "paddingY", "margin", "marginX", "marginY"]);

/** Stored as a single schema keyword; expanded to a real stack at render time. */
export const FONT_STACKS: Record<string, string> = {
  vazirmatn: "Vazirmatn, Tahoma, sans-serif",
  "system-ui": "system-ui, sans-serif",
  tahoma: "Tahoma, Geneva, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  monospace: "ui-monospace, Consolas, monospace",
};

export function tokenVar(path: string): string | null {
  return TOKEN.test(path) ? `var(--${path.replace(/\./g, "-")})` : null;
}

function cssValue(key: string, value: StyleValue): string | number | null {
  if (typeof value === "object" && value !== null) return "$token" in value ? tokenVar(value.$token) : null;
  if (typeof value === "number") return Number.isFinite(value) ? (UNITLESS.has(key) ? value : `${value}px`) : null;
  if (key === "fontFamily") {
    const stack = FONT_STACKS[value];
    if (stack) return stack;
  }
  if (SPACING_KEYS.has(key) && CSS_LENGTH_LIST.test(value.trim())) return value.trim();
  if (CSS_LENGTH.test(value) || COLOR.test(value) || KEYWORD.test(value)) return value;
  return null;
}

type Mapper = (v: string | number, out: CSSProperties) => void;

const MAP: Record<string, Mapper> = {
  display: (v, o) => { o.display = v as CSSProperties["display"]; },
  direction: (v, o) => { o.flexDirection = v as CSSProperties["flexDirection"]; },
  gap: (v, o) => { o.gap = v; },
  align: (v, o) => { o.alignItems = v as string; },
  justify: (v, o) => { o.justifyContent = v as string; },
  wrap: (v, o) => { o.flexWrap = v as CSSProperties["flexWrap"]; },
  padding: (v, o) => { o.padding = v; },
  paddingX: (v, o) => { o.paddingInline = v; },
  paddingY: (v, o) => { o.paddingBlock = v; },
  margin: (v, o) => { o.margin = v; },
  marginX: (v, o) => { o.marginInline = v; },
  marginY: (v, o) => { o.marginBlock = v; },
  width: (v, o) => { o.width = v; },
  minWidth: (v, o) => { o.minWidth = v; },
  maxWidth: (v, o) => { o.maxWidth = v; },
  height: (v, o) => { o.height = v; },
  minHeight: (v, o) => { o.minHeight = v; },
  maxHeight: (v, o) => { o.maxHeight = v; },
  gridColumns: (v, o) => { o.gridTemplateColumns = `repeat(${Number(v)}, minmax(0, 1fr))`; },
  gridRows: (v, o) => { o.gridTemplateRows = `repeat(${Number(v)}, auto)`; },
  columnSpan: (v, o) => { o.gridColumn = `span ${Number(v)}`; },
  rowSpan: (v, o) => { o.gridRow = `span ${Number(v)}`; },
  background: (v, o) => { o.backgroundColor = v as string; },
  color: (v, o) => { o.color = v as string; },
  borderColor: (v, o) => { o.borderColor = v as string; o.borderStyle = "solid"; },
  borderWidth: (v, o) => { o.borderWidth = v; o.borderStyle = "solid"; },
  borderRadius: (v, o) => { o.borderRadius = v; },
  shadow: (v, o) => { o.boxShadow = v as string; },
  fontFamily: (v, o) => { o.fontFamily = v as string; },
  fontSize: (v, o) => { o.fontSize = v; },
  fontWeight: (v, o) => { o.fontWeight = v as CSSProperties["fontWeight"]; },
  lineHeight: (v, o) => { o.lineHeight = v; },
  textAlign: (v, o) => { o.textAlign = v as CSSProperties["textAlign"]; },
  opacity: (v, o) => { o.opacity = v; },
  overflow: (v, o) => { o.overflow = v as CSSProperties["overflow"]; },
};

export function resolveStyle(style: StyleBlock | undefined): CSSProperties {
  const out: CSSProperties = {};
  for (const [key, raw] of Object.entries(style ?? {})) {
    const mapper = MAP[key];
    const value = mapper ? cssValue(key, raw) : null;
    if (mapper && value !== null) mapper(value, out);
  }
  return out;
}

/** Flattens theme tokens into CSS custom properties (`color.surface.base` -> `--color-surface-base`). */
export function themeVariables(tokens: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (node: unknown, path: string[]): void => {
    if (typeof node === "string") {
      if (THEME_VALUE.test(node) && !/url\(|expression|javascript/i.test(node)) out[`--${path.join("-")}`] = node;
      return;
    }
    if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) walk(v, [...path, k]);
  };
  walk(tokens, []);
  return out;
}
