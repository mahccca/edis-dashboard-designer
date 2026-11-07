import { useMemo, useState } from "react";
import type { ExplorerNode, FieldSelection } from "../../shared/binding/types";
import { pathLabel, samplePreview } from "../../shared/binding/paths";
import styles from "./BindingExplorer.module.css";
import { JsonTreeView } from "./JsonTreeView";

interface Props {
  apiId: string;
  queryKey: string;
  paths: ExplorerNode[];
  sample?: unknown;
  onSelect: (sel: FieldSelection) => void;
  selectedPath?: string;
}

type ViewMode = "pretty" | "paths";

function depthOf(path: string) {
  return path.replace(/^\$\.?/, "").split(/\.|\[/).filter(Boolean).length;
}

function PathsTree({
  apiId, queryKey, paths, onSelect, selectedPath,
}: {
  apiId: string;
  queryKey: string;
  paths: ExplorerNode[];
  onSelect: (sel: FieldSelection) => void;
  selectedPath?: string;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // Prefer concrete [0] paths over [*] to reduce clutter
    const preferred = paths.filter((p) => !p.path.includes("[*]"));
    const list = preferred.length ? preferred : paths;
    if (!needle) return list;
    return list.filter((p) => p.path.toLowerCase().includes(needle) || p.type.toLowerCase().includes(needle));
  }, [paths, q]);

  return (
    <div className={styles.panel}>
      <input
        className={styles.optionBtn}
        style={{ cursor: "text" }}
        placeholder="جستجوی مسیر…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className={styles.viewer}>
        {filtered.map((node) => {
          const depth = depthOf(node.path);
          const selected = selectedPath === node.path;
          const leafName = pathLabel(node.path).split(".").pop() ?? node.path;
          return (
            <button
              key={node.path}
              type="button"
              className={`${styles.treeRow}${selected ? ` ${styles.treeRowSelected}` : ""}`}
              style={{ paddingInlineStart: 8 + depth * 10 }}
              onClick={() => {
                onSelect({
                  apiId,
                  queryKey,
                  path: node.path,
                  type: node.type,
                  sampleValue: node.sampleValue,
                });
              }}
            >
              <span className={styles.twist}>{node.children ? "▸" : "·"}</span>
              <span>
                <span className={styles.key}>{leafName}</span>
                {node.sampleValue !== undefined && !node.children && (
                  <>
                    <span className={styles.punct}>: </span>
                    <span className={styles.scalar}>{samplePreview(node.sampleValue, 40)}</span>
                  </>
                )}
              </span>
              <span className={styles.typeTag}>{node.type}</span>
            </button>
          );
        })}
        {filtered.length === 0 && <div className={styles.empty}>مسیری نیست — اول بارگذاری کنید.</div>}
      </div>
    </div>
  );
}

export function DataExplorer({ apiId, queryKey, paths, sample, onSelect, selectedPath }: Props) {
  const [view, setView] = useState<ViewMode>(sample !== undefined ? "pretty" : "paths");

  return (
    <div className={styles.shell}>
      <div className={styles.tabs} role="tablist" aria-label="نمای داده">
        <button
          type="button"
          role="tab"
          aria-selected={view === "pretty"}
          className={`${styles.tab}${view === "pretty" ? ` ${styles.tabActive}` : ""}`}
          onClick={() => setView("pretty")}
        >
          JSON زیبا
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "paths"}
          className={`${styles.tab}${view === "paths" ? ` ${styles.tabActive}` : ""}`}
          onClick={() => setView("paths")}
        >
          درخت مسیرها
        </button>
      </div>
      {view === "pretty" ? (
        <JsonTreeView
          apiId={apiId}
          queryKey={queryKey}
          data={sample}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ) : (
        <PathsTree
          apiId={apiId}
          queryKey={queryKey}
          paths={paths}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}
