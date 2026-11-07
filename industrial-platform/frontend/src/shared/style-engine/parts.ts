import type { DocNode, DocumentContent, StyleBlock, StyleValue } from "../api/types";
import { resolveStyle } from "./index";

export type StylePartId = string;
export type AppearanceMode = "night" | "day";
export type StyleScope = "part" | "all";

export interface StylePartDef {
  id: StylePartId;
  label: { fa: string; en: string };
  /** Which controls the floating editor shows for this part. */
  fields: Array<"background" | "color" | "fontFamily" | "fontSize" | "width" | "height" | "padding" | "margin">;
}

/** Default parts for layout containers / text leaves when the pencil tool is active. */
export const BOX_PART: StylePartDef = {
  id: "box",
  label: { fa: "پس‌زمینه و اندازه", en: "Background & size" },
  fields: ["background", "color", "fontFamily", "fontSize", "width", "height", "padding", "margin"],
};

/** Page-wide defaults applied under every element (cards, text, layout boxes). */
export const ALL_PART: StylePartDef = {
  id: "all",
  label: { fa: "همه آیتم‌ها", en: "All items" },
  fields: ["background", "color", "fontFamily", "fontSize", "padding", "margin"],
};

export const KPI_PARTS: StylePartDef[] = [
  { id: "card", label: { fa: "کارت", en: "Card" }, fields: ["background", "width", "height", "padding", "margin", "fontFamily", "fontSize"] },
  { id: "title", label: { fa: "عنوان", en: "Title" }, fields: ["color", "fontFamily", "fontSize"] },
  { id: "value", label: { fa: "مقدار", en: "Value" }, fields: ["color", "fontFamily", "fontSize"] },
  { id: "unit", label: { fa: "واحد", en: "Unit" }, fields: ["color", "fontFamily", "fontSize"] },
  { id: "footer", label: { fa: "پاورقی", en: "Footer" }, fields: ["color", "fontFamily", "fontSize"] },
];

const TEXT_KEYS = new Set(["color", "fontFamily", "fontSize"]);
const SETTINGS_KEY = { night: "partStyles", day: "partStylesDay" } as const;

export function partDef(parts: StylePartDef[], id: string): StylePartDef | undefined {
  return parts.find((p) => p.id === id);
}

function bagFor(node: DocNode, mode: AppearanceMode): Record<string, StyleBlock> {
  return (mode === "day" ? node.partStylesDay : node.partStyles) ?? {};
}

function withBag(node: DocNode, mode: AppearanceMode, bag: Record<string, StyleBlock> | undefined): DocNode {
  if (mode === "day") {
    return Object.keys(bag ?? {}).length ? { ...node, partStylesDay: bag } : { ...node, partStylesDay: undefined };
  }
  return Object.keys(bag ?? {}).length ? { ...node, partStyles: bag } : { ...node, partStyles: undefined };
}

function mapTree(node: DocNode, fn: (n: DocNode) => DocNode): DocNode {
  const next = fn(node);
  if (!next.children?.length) return next;
  let changed = next !== node;
  const children = next.children.map((c) => {
    const mapped = mapTree(c, fn);
    if (mapped !== c) changed = true;
    return mapped;
  });
  return changed ? { ...next, children } : next;
}

function omitKey(block: StyleBlock, key: string): StyleBlock | undefined {
  if (!(key in block)) return block;
  const { [key]: _r, ...rest } = block;
  return Object.keys(rest).length ? rest : undefined;
}

/** Drop a style key from legacy node.style and the active mode bag so page-wide defaults can show. */
function clearKeyFromNode(node: DocNode, key: string, mode: AppearanceMode): DocNode {
  let next = node;
  if (next.style && key in next.style) {
    const style = omitKey(next.style, key);
    next = { ...next, style };
  }
  const bag = { ...bagFor(next, mode) };
  let changed = false;
  for (const part of Object.keys(bag)) {
    const block = bag[part];
    if (!block || !(key in block)) continue;
    changed = true;
    const cleaned = omitKey(block, key);
    if (cleaned) bag[part] = cleaned;
    else delete bag[part];
  }
  return changed ? withBag(next, mode, Object.keys(bag).length ? bag : undefined) : next;
}

/** Page-level part bag stored on document.settings (shared by every element). */
export function pagePartBag(
  settings: Record<string, unknown> | undefined,
  mode: AppearanceMode = "night",
): Record<string, StyleBlock> {
  const raw = settings?.[SETTINGS_KEY[mode]];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, StyleBlock>;
}

export function readPagePartStyle(
  settings: Record<string, unknown> | undefined,
  part: string,
  mode: AppearanceMode = "night",
): StyleBlock {
  return { ...(pagePartBag(settings, mode)[part] ?? {}) };
}

export function patchPagePartStyle(
  doc: DocumentContent,
  part: string,
  key: string,
  value: StyleValue | undefined,
  mode: AppearanceMode = "night",
): DocumentContent {
  const settingsKey = SETTINGS_KEY[mode];
  const bag = { ...pagePartBag(doc.settings, mode) };
  const current = { ...(bag[part] ?? {}) };

  let nextBag: Record<string, StyleBlock>;
  if (value === undefined || value === "") {
    const cleaned = omitKey(current, key);
    const { [part]: _old, ...other } = bag;
    nextBag = cleaned ? { ...other, [part]: cleaned } : other;
  } else {
    nextBag = { ...bag, [part]: { ...current, [key]: value } };
  }

  const settings = { ...(doc.settings ?? {}) };
  if (Object.keys(nextBag).length) settings[settingsKey] = nextBag;
  else delete settings[settingsKey];

  // Clear per-node overrides for this key so the selected item (and every other node) picks up the page default.
  const root = value === undefined || value === ""
    ? doc.root
    : mapTree(doc.root, (n) => clearKeyFromNode(n, key, mode));

  return {
    ...doc,
    settings: Object.keys(settings).length ? settings : undefined,
    root,
  };
}

/** Page `all` + node `all` merged under the specific part (specific wins). */
function mergeGlobal(global: StyleBlock, part: string, specific: StyleBlock): StyleBlock {
  if (part === "all") return { ...specific };
  const fromGlobal: StyleBlock = {};
  for (const [k, v] of Object.entries(global)) {
    if (part === "card" || part === "box") {
      if (
        k === "background" || k === "fontFamily" || k === "fontSize" || k === "color"
        || k === "padding" || k === "paddingX" || k === "paddingY"
        || k === "margin" || k === "marginX" || k === "marginY"
        || k === "width" || k === "height"
      ) fromGlobal[k] = v;
    } else if (TEXT_KEYS.has(k)) {
      fromGlobal[k] = v;
    }
  }
  return { ...fromGlobal, ...specific };
}

export function readPartStyle(
  node: DocNode,
  part: string,
  mode: AppearanceMode = "night",
  pageBag: Record<string, StyleBlock> = {},
): StyleBlock {
  const bag = bagFor(node, mode);
  const global = { ...(pageBag.all ?? {}), ...(bag.all ?? {}) };
  if (part === "all") return { ...global };

  if (part === "box") {
    // Legacy node.style is night-only fallback; day/night edits live in bag.box.
    const legacy = mode === "night" ? (node.style ?? {}) : {};
    return mergeGlobal(global, part, { ...legacy, ...(bag.box ?? {}) });
  }
  if (part === "card") {
    const legacy = mode === "night" ? (node.style ?? {}) : {};
    return mergeGlobal(global, part, { ...legacy, ...(bag.card ?? {}) });
  }
  return mergeGlobal(global, part, bag[part] ?? {});
}

export function resolvePartStyle(
  node: DocNode,
  part: string,
  mode: AppearanceMode = "night",
  pageBag: Record<string, StyleBlock> = {},
): ReturnType<typeof resolveStyle> {
  return resolveStyle(readPartStyle(node, part, mode, pageBag));
}

export function patchPartStyle(
  node: DocNode,
  part: string,
  key: string,
  value: StyleValue | undefined,
  mode: AppearanceMode = "night",
): DocNode {
  // Box and card edits are mode-specific (partStyles / partStylesDay). Clear shared node.style
  // so day/night never leak through the legacy field.
  let nextNode = node;
  if ((part === "box" || part === "card") && nextNode.style && key in nextNode.style) {
    const style = omitKey(nextNode.style, key);
    nextNode = { ...nextNode, style };
  }

  const bag = { ...bagFor(nextNode, mode) };
  const current = { ...(bag[part] ?? {}) };

  if (value === undefined || value === "") {
    const cleaned = omitKey(current, key);
    const { [part]: _old, ...other } = bag;
    const nextBag = cleaned ? { ...other, [part]: cleaned } : other;
    return withBag(nextNode, mode, Object.keys(nextBag).length ? nextBag : undefined);
  }
  return withBag(nextNode, mode, { ...bag, [part]: { ...current, [key]: value } });
}
