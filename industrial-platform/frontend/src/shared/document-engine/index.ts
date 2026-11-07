import type { ComponentSpec, DocNode, DocumentContent, NodeType } from "../api/types";

// Child rules mirror node.schema.json: leaves have no children, rows only hold columns,
// columns never appear outside rows, root only holds sections (or slots in templates).
const LEAVES = new Set<NodeType>(["heading", "text", "image", "spacer", "divider", "menu", "logo", "slot", "component"]);
const NODE_ID = /^[a-z][a-z0-9_-]{2,63}$/;

export class ConstraintError extends Error {}

export function isLeaf(type: NodeType): boolean {
  return LEAVES.has(type);
}

export function canContain(parent: NodeType, child: NodeType, spec?: ComponentSpec, documentType?: string): boolean {
  if (isLeaf(parent) || child === "root") return false;
  if (parent === "root") return child === "section" || (child === "slot" && documentType === "template");
  if (parent === "row") return child === "column";
  if (child === "column" || child === "slot") return false;
  if (child === "component" && spec) {
    const lc = spec.layoutConstraints ?? {};
    if (lc.allowedParents && !lc.allowedParents.includes(parent)) return false;
    if (documentType && lc.allowedDocumentTypes && !lc.allowedDocumentTypes.includes(documentType)) return false;
  }
  return true;
}

export function* walk(node: DocNode, parent: DocNode | null = null): Generator<{ node: DocNode; parent: DocNode | null }> {
  yield { node, parent };
  for (const child of node.children ?? []) yield* walk(child, node);
}

export function findNode(doc: DocumentContent, id: string): { node: DocNode; parent: DocNode | null } | null {
  for (const entry of walk(doc.root)) if (entry.node.id === id) return entry;
  return null;
}

export function collectIds(doc: DocumentContent): Set<string> {
  return new Set([...walk(doc.root)].map((e) => e.node.id));
}

export function duplicateIds(doc: DocumentContent): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const { node } of walk(doc.root)) (seen.has(node.id) ? dup : seen).add(node.id);
  return [...dup];
}

export function newId(prefix: string, taken: Set<string>, random: () => number = Math.random): string {
  const base = prefix.toLowerCase().replace(/[^a-z0-9_-]/g, "").replace(/^[^a-z]+/, "") || "node";
  for (;;) {
    const id = `${base.slice(0, 40)}-${Math.floor(random() * 36 ** 5).toString(36).padStart(5, "0")}`;
    if (!taken.has(id) && NODE_ID.test(id)) return id;
  }
}

function mapNode(node: DocNode, id: string, fn: (n: DocNode) => DocNode): DocNode {
  if (node.id === id) return fn(node);
  if (!node.children) return node;
  let changed = false;
  const children = node.children.map((c) => {
    const next = mapNode(c, id, fn);
    if (next !== c) changed = true;
    return next;
  });
  return changed ? { ...node, children } : node;
}

export function updateNode(doc: DocumentContent, id: string, fn: (n: DocNode) => DocNode): DocumentContent {
  const root = mapNode(doc.root, id, fn);
  return root === doc.root ? doc : { ...doc, root };
}

export function insertChild(doc: DocumentContent, parentId: string, child: DocNode, spec?: ComponentSpec): DocumentContent {
  const found = findNode(doc, parentId);
  if (!found) throw new ConstraintError(`unknown parent ${parentId}`);
  if (!canContain(found.node.type, child.type, spec, doc.documentType)) {
    throw new ConstraintError(`${child.type} cannot be placed inside ${found.node.type}`);
  }
  if (collectIds(doc).has(child.id)) throw new ConstraintError(`duplicate id ${child.id}`);
  return updateNode(doc, parentId, (n) => ({ ...n, children: [...(n.children ?? []), child] }));
}

export function removeNode(doc: DocumentContent, id: string): DocumentContent {
  if (id === doc.root.id) throw new ConstraintError("root cannot be removed");
  const found = findNode(doc, id);
  if (!found?.parent) return doc;
  return updateNode(doc, found.parent.id, (p) => ({ ...p, children: (p.children ?? []).filter((c) => c.id !== id) }));
}

export function moveNode(doc: DocumentContent, id: string, delta: -1 | 1): DocumentContent {
  const found = findNode(doc, id);
  if (!found?.parent) return doc;
  const siblings = [...(found.parent.children ?? [])];
  const i = siblings.findIndex((c) => c.id === id);
  const j = i + delta;
  if (j < 0 || j >= siblings.length) return doc;
  [siblings[i], siblings[j]] = [siblings[j]!, siblings[i]!];
  return updateNode(doc, found.parent.id, (p) => ({ ...p, children: siblings }));
}

function contains(node: DocNode, id: string): boolean {
  for (const { node: n } of walk(node)) if (n.id === id) return true;
  return false;
}

/** Why `id` cannot be moved under `parentId`, or null when the move is allowed. */
export function moveViolation(doc: DocumentContent, id: string, parentId: string, spec?: ComponentSpec): string | null {
  if (id === doc.root.id) return "root cannot be moved";
  const moving = findNode(doc, id);
  const target = findNode(doc, parentId);
  if (!moving) return `unknown node ${id}`;
  if (!target) return `unknown parent ${parentId}`;
  if (contains(moving.node, parentId)) return `${id} cannot be moved inside itself`;
  if (!canContain(target.node.type, moving.node.type, spec, doc.documentType)) {
    return `${moving.node.type} cannot be placed inside ${target.node.type}`;
  }
  return null;
}

/** Moves a node (with its whole subtree) to `index` among the children of `parentId`; index counts the final positions. */
export function moveNodeTo(doc: DocumentContent, id: string, parentId: string, index?: number, spec?: ComponentSpec): DocumentContent {
  const violation = moveViolation(doc, id, parentId, spec);
  if (violation) throw new ConstraintError(violation);
  const moving = findNode(doc, id)!;
  if (moving.parent?.id === parentId) {
    const from = moving.parent.children!.findIndex((c) => c.id === id);
    if (from === Math.max(0, Math.min(index ?? Infinity, moving.parent.children!.length - 1))) return doc;
  }
  const without = removeNode(doc, id);
  return updateNode(without, parentId, (p) => {
    const children = [...(p.children ?? [])];
    const at = Math.max(0, Math.min(index ?? children.length, children.length));
    children.splice(at, 0, moving.node);
    return { ...p, children };
  });
}

export function createNode(type: NodeType, taken: Set<string>, spec?: ComponentSpec): DocNode {
  const id = newId(type === "component" ? (spec?.category ?? "cmp") : type, taken);
  switch (type) {
    case "heading":
      return { id, type, props: { text: { fa: "عنوان", en: "Heading" }, level: 2 } };
    case "text":
      return { id, type, props: { text: { fa: "متن", en: "Text" } } };
    case "component":
      if (!spec) throw new ConstraintError("component spec required");
      return {
        id, type,
        component: { definitionId: spec.id, definitionKey: spec.key, version: spec.version },
        props: { title: spec.defaults.title ?? spec.key },
      };
    case "row":
    case "section":
    case "column":
    case "container":
    case "stack":
    case "grid":
      return { id, type, children: [] };
    default:
      return { id, type };
  }
}

/** Maps a server error pointer ("/content/root/children/0/props/x") to the deepest node it points into. */
export function nodeIdForPointer(doc: DocumentContent, pointer: string): string | null {
  const parts = pointer.split("/").slice(1).map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  if (parts[0] === "content" || parts[0] === "document") parts.shift();
  let cur: unknown = doc;
  let lastId: string | null = null;
  for (const part of parts) {
    if (cur === null || typeof cur !== "object") break;
    cur = (cur as Record<string, unknown>)[part];
    if (cur && typeof cur === "object" && "id" in cur && "type" in cur) lastId = String((cur as DocNode).id);
  }
  return lastId;
}

// ----------------------------------------------------------------- undo/redo

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

const LIMIT = 100;

export const history = {
  init: <T>(present: T): History<T> => ({ past: [], present, future: [] }),
  push: <T>(h: History<T>, next: T): History<T> =>
    next === h.present ? h : { past: [...h.past, h.present].slice(-LIMIT), present: next, future: [] },
  /** Keep past/future; swap only `present` (live drag). Pair with `checkpoint` once at gesture start. */
  replace: <T>(h: History<T>, next: T): History<T> =>
    next === h.present ? h : { ...h, present: next, future: [] },
  /** Snapshot current present onto the undo stack without changing it. */
  checkpoint: <T>(h: History<T>): History<T> =>
    ({ past: [...h.past, h.present].slice(-LIMIT), present: h.present, future: [] }),
  undo: <T>(h: History<T>): History<T> =>
    h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1]!, future: [h.present, ...h.future] } : h,
  redo: <T>(h: History<T>): History<T> =>
    h.future.length ? { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1) } : h,
};
