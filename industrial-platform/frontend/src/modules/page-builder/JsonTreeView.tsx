import { useState } from "react";
import type { FieldSelection } from "../../shared/binding/types";
import { samplePreview } from "../../shared/binding/paths";
import styles from "./BindingExplorer.module.css";

interface Props {
  apiId: string;
  queryKey: string;
  data: unknown;
  selectedPath?: string;
  onSelect: (sel: FieldSelection) => void;
}

function valueType(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function scalarClass(v: unknown): string {
  if (v === null) return styles.scalarNull!;
  if (typeof v === "string") return styles.scalarString!;
  if (typeof v === "number") return styles.scalarNumber!;
  if (typeof v === "boolean") return styles.scalarBool!;
  return styles.scalar!;
}

function joinPath(parent: string, key: string | number): string {
  if (typeof key === "number") {
    return parent === "$" ? `$[${key}]` : `${parent}[${key}]`;
  }
  if (parent === "$") return `$.${key}`;
  return `${parent}.${key}`;
}

function NodeRow({
  path, label, value, selectedPath, onSelect, apiId, queryKey, depth,
}: {
  path: string;
  label: string;
  value: unknown;
  selectedPath?: string;
  onSelect: (sel: FieldSelection) => void;
  apiId: string;
  queryKey: string;
  depth: number;
}) {
  const t = valueType(value);
  const isBranch = t === "object" || t === "array";
  const [open, setOpen] = useState(depth < 2);
  const selected = selectedPath === path;
  const entries: Array<[string | number, unknown]> = isBranch
    ? (Array.isArray(value)
      ? value.slice(0, 40).map((v, i) => [i, v] as [number, unknown])
      : Object.entries(value as Record<string, unknown>).slice(0, 60))
    : [];

  return (
    <div>
      <button
        type="button"
        className={`${styles.treeRow}${selected ? ` ${styles.treeRowSelected}` : ""}`}
        onClick={() => {
          if (isBranch) setOpen((o) => !o);
          onSelect({ apiId, queryKey, path, type: t, sampleValue: value });
        }}
        style={{ paddingInlineStart: 8 + depth * 10 }}
      >
        <span className={styles.twist}>{isBranch ? (open ? "▾" : "▸") : "·"}</span>
        <span>
          <span className={styles.key}>{label}</span>
          <span className={styles.punct}>: </span>
          {!isBranch ? (
            <span className={`${styles.scalar} ${scalarClass(value)}`}>{samplePreview(value, 64)}</span>
          ) : (
            <span className={styles.punct}>
              {t === "array" ? `[${(value as unknown[]).length}]` : `{${Object.keys(value as object).length}}`}
            </span>
          )}
        </span>
        <span className={styles.typeTag}>{t}</span>
      </button>
      {isBranch && open && (
        <div className={styles.children}>
          {entries.map(([k, child]) => (
            <NodeRow
              key={`${path}.${String(k)}`}
              path={joinPath(path, k)}
              label={String(k)}
              value={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              apiId={apiId}
              queryKey={queryKey}
              depth={depth + 1}
            />
          ))}
          {Array.isArray(value) && value.length > 40 && (
            <div className={styles.empty}>… {(value as unknown[]).length - 40} مورد دیگر</div>
          )}
        </div>
      )}
    </div>
  );
}

/** Pretty hierarchical JSON browser — click a node to bind its path. */
export function JsonTreeView({ apiId, queryKey, data, selectedPath, onSelect }: Props) {
  if (data === undefined) {
    return <div className={styles.empty}>نمونه JSON نیست — اول «بارگذاری» را بزنید.</div>;
  }
  return (
    <div className={styles.viewer}>
      <NodeRow
        path="$"
        label="$"
        value={data}
        selectedPath={selectedPath}
        onSelect={onSelect}
        apiId={apiId}
        queryKey={queryKey}
        depth={0}
      />
    </div>
  );
}
