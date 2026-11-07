import { useState, type DragEvent } from "react";
import type { ComponentSpec, DocNode, DocumentContent, NodeType } from "../../shared/api/types";
import { canContain, findNode, isLeaf, moveViolation } from "../../shared/document-engine";
import { localize } from "../../shared/i18n";
import ui from "../../shared/ui/controls.module.css";
import { TrashIcon } from "../../shared/ui/TrashIcon";
import styles from "./Editor.module.css";

const ADDABLE: NodeType[] = ["section", "row", "column", "heading", "text"];

type DropPlace = "before" | "after" | "inside";
interface DropTarget { parentId: string; index: number; hintId: string; place: DropPlace }

function label(node: DocNode): string {
  if (node.type === "component") return `${node.component?.definitionKey ?? "component"} · ${localize(node.props?.title as never, "fa")}`;
  if (node.type === "heading" || node.type === "text") return `${node.type} · ${localize(node.props?.text as never, "fa").slice(0, 24)}`;
  return node.type;
}

interface TreeCtx extends LayersProps {
  specOf: (n: DocNode) => ComponentSpec | undefined;
  dragId: string | null;
  drop: DropTarget | null;
  collapsed: Set<string>;
  setDragId: (id: string | null) => void;
  setDrop: (d: DropTarget | null) => void;
  toggle: (id: string, open?: boolean) => void;
}

/** Where a drag over `node` would land, given the pointer's vertical position within the row (0..1). */
function dropTargetFor(ctx: TreeCtx, node: DocNode, parent: DocNode | null, ratio: number): DropTarget | null {
  if (!ctx.dragId || ctx.dragId === node.id) return null;
  const dragged = findNode(ctx.document, ctx.dragId)?.node;
  if (!dragged) return null;
  const spec = ctx.specOf(dragged);
  const allowed = (parentId: string) => moveViolation(ctx.document, ctx.dragId!, parentId, spec) === null;
  const container = !isLeaf(node.type);
  const edge = container ? 0.25 : 0.5;

  if (parent && (ratio < edge || ratio > 1 - edge) && allowed(parent.id)) {
    const siblings = (parent.children ?? []).filter((c) => c.id !== ctx.dragId);
    const at = siblings.findIndex((c) => c.id === node.id);
    const place = ratio < edge ? "before" : "after";
    return { parentId: parent.id, index: place === "before" ? at : at + 1, hintId: node.id, place };
  }
  if (container && allowed(node.id)) {
    const count = (node.children ?? []).filter((c) => c.id !== ctx.dragId).length;
    return { parentId: node.id, index: count, hintId: node.id, place: "inside" };
  }
  return null;
}

function Tree({ node, parent, ctx }: { node: DocNode; parent: DocNode | null; ctx: TreeCtx }) {
  const selected = ctx.selectedId === node.id;
  const hasChildren = (node.children?.length ?? 0) > 0;
  const open = !ctx.collapsed.has(node.id);
  const hint = ctx.drop?.hintId === node.id ? ctx.drop.place : null;
  const hintClass = hint === "before" ? styles.dropBefore : hint === "after" ? styles.dropAfter : hint === "inside" ? styles.dropInside : "";

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const target = dropTargetFor(ctx, node, parent, rect.height ? (e.clientY - rect.top) / rect.height : 0.5);
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (target.place === "inside" && !open) ctx.toggle(node.id, true);
    if (ctx.drop?.hintId !== target.hintId || ctx.drop.place !== target.place) ctx.setDrop(target);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (ctx.dragId && ctx.drop) ctx.onMoveTo(ctx.dragId, ctx.drop.parentId, ctx.drop.index);
    ctx.setDragId(null);
    ctx.setDrop(null);
  };

  return (
    <li role="treeitem" aria-expanded={hasChildren ? open : undefined} aria-selected={selected}>
      <div className={`${styles.layer} ${selected ? styles.layerSelected : ""} ${ctx.errorIds.has(node.id) ? styles.layerError : ""} ${hintClass} ${ctx.dragId === node.id ? styles.layerDragging : ""}`}
           data-testid={`layer-${node.id}`}
           draggable={node.type !== "root"}
           onDragStart={(e) => {
             e.stopPropagation();
             e.dataTransfer.effectAllowed = "move";
             e.dataTransfer.setData("text/plain", node.id);
             ctx.setDragId(node.id);
           }}
           onDragEnd={() => { ctx.setDragId(null); ctx.setDrop(null); }}
           onDragOver={onDragOver}
           onDrop={onDrop}>
        {hasChildren
          ? <button className={styles.toggle} onClick={() => ctx.toggle(node.id)} aria-label={open ? "بستن" : "باز کردن"}>{open ? "▾" : "◂"}</button>
          : <span className={styles.togglePlaceholder} />}
        {node.type !== "root" && <span className={styles.handle} aria-hidden>⠿</span>}
        <button className={styles.layerName} onClick={() => ctx.onSelect(node.id)} aria-pressed={selected}>{label(node)}</button>
        {node.type !== "root" && selected && (
          <span className={styles.layerActions}>
            <button className={ui.button} title="انتقال به بالا" aria-label="انتقال به بالا" onClick={() => ctx.onMove(node.id, -1)}>↑</button>
            <button className={ui.button} title="انتقال به پایین" aria-label="انتقال به پایین" onClick={() => ctx.onMove(node.id, 1)}>↓</button>
            <button className={`${ui.button} ${ui.iconButton} ${ui.dangerIcon}`} title="حذف" aria-label="حذف"
                    onClick={() => ctx.onRemove(node.id)}><TrashIcon size={14} /></button>
          </span>
        )}
      </div>
      {hasChildren && open && (
        <ul className={styles.tree} role="group">{node.children!.map((c) => <Tree key={c.id} node={c} parent={node} ctx={ctx} />)}</ul>
      )}
    </li>
  );
}

export interface LayersProps {
  document: DocumentContent;
  selectedId: string | null;
  components: ComponentSpec[];
  errorIds: Set<string>;
  onSelect: (id: string) => void;
  onAdd: (parentId: string, type: NodeType, spec?: ComponentSpec) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  /** Re-parents a node with its subtree; index counts positions among the new parent's children. */
  onMoveTo: (id: string, parentId: string, index?: number) => void;
}

export function LayersPanel(props: LayersProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string, open?: boolean) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (open ?? next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const specOf = (n: DocNode) =>
    n.component ? props.components.find((c) => c.id === n.component!.definitionId && c.version === n.component!.version) : undefined;
  const ctx: TreeCtx = { ...props, specOf, dragId, drop, collapsed, setDragId, setDrop, toggle };
  const target = findNode(props.document, props.selectedId ?? "root")?.node ?? props.document.root;
  return (
    <div className={styles.panel}>
      <div className={styles.panelTitle}>لایه‌ها</div>
      <ul className={styles.tree} role="tree" onDragLeave={(e) => { if (e.currentTarget === e.target) setDrop(null); }}>
        <Tree node={props.document.root} parent={null} ctx={ctx} />
      </ul>
      <div className={styles.panelTitle}>افزودن به «{target.type}»</div>
      <div className={styles.addGrid}>
        {ADDABLE.map((type) => (
          <button key={type} className={ui.button} disabled={!canContain(target.type, type, undefined, props.document.documentType)}
                  onClick={() => props.onAdd(target.id, type)}>+ {type}</button>
        ))}
        {props.components.map((spec) => (
          <button key={`${spec.id}@${spec.version}`} className={ui.button}
                  disabled={!canContain(target.type, "component", spec, props.document.documentType)}
                  onClick={() => props.onAdd(target.id, "component", spec)}>+ {localize(spec.name, "fa")}</button>
        ))}
      </div>
    </div>
  );
}
