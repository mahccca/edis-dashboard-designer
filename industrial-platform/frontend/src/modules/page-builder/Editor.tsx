import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { ApiError, http } from "../../shared/api/http";
import type { ComponentSpec, DocNode, DocumentContent, NodeType, PageSummary, Project, ProblemError, PublishedVersion, StyleValue } from "../../shared/api/types";
import {
  ConstraintError, collectIds, createNode, findNode, history, insertChild, moveNode, moveNodeTo, nodeIdForPointer, removeNode, updateNode, walk,
  type History,
} from "../../shared/document-engine";
import { localize } from "../../shared/i18n";
import { DocumentRenderer, ThemeScope } from "../../shared/rendering/DocumentRenderer";
import { themeTokensFor } from "../../shared/appearance/tokens";
import { patchPagePartStyle, patchPartStyle, type AppearanceMode, type StylePartDef } from "../../shared/style-engine/parts";
import { TestDataBanner } from "../../shared/ui/TestDataBadge";
import ui from "../../shared/ui/controls.module.css";
import styles from "./Editor.module.css";
import { Inspector } from "./Inspector";
import { LayersPanel } from "./LayersPanel";
import { ResizeHandle, usePanelWidth } from "./ResizeHandle";
import { StylePopover, type StyleTarget } from "./StylePopover";
import { VersionsPanel } from "./VersionsPanel";
import { useBindingValues, useCatalog } from "./useEditorData";

type Tool = "select" | "style";

type Status =
  | { kind: "idle" }
  | { kind: "busy"; what: string }
  | { kind: "saved"; text: string }
  | { kind: "conflict"; currentEtag: string | undefined }
  | { kind: "invalid"; errors: ProblemError[] }
  | { kind: "error"; text: string };

const STRUCTURE_ERROR = "این عنصر نمی‌تواند در این جای ساختار صفحه قرار بگیرد.";

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M13.5 6.5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Editor({ project, page, onBack }: { project: Project; page: PageSummary; onBack: () => void }) {
  const [doc, setDoc] = useState<History<DocumentContent> | null>(null);
  const [saved, setSaved] = useState<DocumentContent | null>(null);
  const [etag, setEtag] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [styleTarget, setStyleTarget] = useState<StyleTarget | null>(null);
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>("night");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [catalog, reloadCatalog] = useCatalog(project.id);
  const layersSize = usePanelWidth("ip.studio.layersWidth", 280, 200, 640);

  const load = useCallback(async () => {
    const res = await http.get<{ document: DocumentContent }>(`/pages/${page.id}`);
    setDoc(history.init(res.data.document));
    setSaved(res.data.document);
    setEtag(res.etag);
    const scheme = res.data.document.settings?.colorScheme;
    if (scheme === "day" || scheme === "night") setAppearanceMode(scheme);
    setRefreshKey((k) => k + 1);
  }, [page.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const present = doc?.present ?? null;
  const dirty = present !== null && present !== saved;
  const bindingIds = useMemo(
    () => (present ? [...new Set([...walk(present.root)].flatMap(({ node }) => Object.values(node.bindings ?? {}).map((b) => b.bindingId)))] : []),
    [present],
  );
  const values = useBindingValues(bindingIds);
  const anyTestData = Object.values(values).some((v) => v.isTestData) || catalog.dataSources.some((d) => d.isTestData);
  const invalidErrors = status.kind === "invalid" ? status.errors : [];
  const errorIds = useMemo(
    () => new Set(present ? invalidErrors.map((e) => nodeIdForPointer(present, e.pointer)).filter((x): x is string => !!x) : []),
    [present, invalidErrors],
  );

  const onPickPart = useCallback((nodeId: string, part: string, parts: StylePartDef[], anchor: DOMRect) => {
    setSelectedId(nodeId);
    setStyleTarget({ nodeId, part, parts, anchor });
  }, []);

  if (!doc || !present) return <div className={ui.muted} style={{ padding: 32 }}>…</div>;

  const commit = (next: DocumentContent) => setDoc((h) => (h ? history.push(h, next) : h));
  const selected = selectedId ? findNode(present, selectedId)?.node ?? null : null;
  const styleNode = styleTarget ? findNode(present, styleTarget.nodeId)?.node ?? null : null;
  const specFor = (n: DocNode | null): ComponentSpec | undefined =>
    n?.component ? catalog.components.find((c) => c.id === n.component!.definitionId && c.version === n.component!.version) : undefined;

  const setToolMode = (next: Tool) => {
    setTool(next);
    if (next !== "style") setStyleTarget(null);
  };

  const onStyleChange = (part: string, key: string, value: StyleValue | undefined, mode: AppearanceMode) => {
    if (!styleTarget) return;
    // «همه آیتم‌ها» = page-wide defaults on every element, not just this card.
    if (part === "all") {
      commit(patchPagePartStyle(present, "all", key, value, mode));
      return;
    }
    commit(updateNode(present, styleTarget.nodeId, (n) => patchPartStyle(n, part, key, value, mode)));
  };

  const onPatchPart = (nodeId: string, part: string, key: string, value: StyleValue | undefined) => {
    setDoc((h) => (h
      ? history.replace(h, updateNode(h.present, nodeId, (n) => patchPartStyle(n, part, key, value, appearanceMode)))
      : h));
  };

  const onResizeStart = () => {
    setDoc((h) => (h ? history.checkpoint(h) : h));
  };

  const onAppearanceModeChange = (mode: AppearanceMode) => {
    setAppearanceMode(mode);
    // Persist preferred scheme without cloning style bags into the other mode.
    setDoc((h) => {
      if (!h) return h;
      const next = {
        ...h.present,
        settings: { ...h.present.settings, colorScheme: mode },
      };
      return history.replace(h, next);
    });
  };

  const add = (parentId: string, type: NodeType, spec?: ComponentSpec) => {
    try {
      const node = createNode(type, collectIds(present), spec);
      commit(insertChild(present, parentId, node, spec));
      setSelectedId(node.id);
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof ConstraintError ? STRUCTURE_ERROR : String(e) });
    }
  };

  const moveTo = (id: string, parentId: string, index?: number) => {
    try {
      commit(moveNodeTo(present, id, parentId, index, specFor(findNode(present, id)?.node ?? null)));
      setSelectedId(id);
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof ConstraintError ? STRUCTURE_ERROR : String(e) });
    }
  };

  const save = async () => {
    setStatus({ kind: "busy", what: "saving" });
    try {
      const res = await http.put<{ revisionNo: number }>(`/pages/${page.id}/document`, { body: { content: present }, ifMatch: etag });
      setSaved(present);
      setEtag(res.etag);
      setRefreshKey((k) => k + 1);
      setStatus({ kind: "saved", text: `ذخیره شد — ویرایش ${res.data.revisionNo}` });
    } catch (e) {
      if (e instanceof ApiError && e.status === 412) setStatus({ kind: "conflict", currentEtag: e.problem.currentEtag });
      else if (e instanceof ApiError && e.status === 422) setStatus({ kind: "invalid", errors: e.problem.errors ?? [] });
      else setStatus({ kind: "error", text: e instanceof Error ? e.message : "ذخیره ناموفق بود." });
    }
  };

  const publish = async () => {
    setStatus({ kind: "busy", what: "publishing" });
    try {
      const revisionNo = Number(/rev-(\d+)/.exec(etag ?? "")?.[1]);
      const { data } = await http.post<PublishedVersion>(`/pages/${page.id}/publish`, { body: { revisionNo } });
      setRefreshKey((k) => k + 1);
      setStatus({ kind: "saved", text: `منتشر شد — نسخهٔ ${data.versionNo} (از ویرایش ${data.sourceRevisionNo})` });
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) setStatus({ kind: "invalid", errors: e.problem.errors ?? [] });
      else setStatus({ kind: "error", text: e instanceof Error ? e.message : "انتشار ناموفق بود." });
    }
  };

  const restore = async (revisionNo: number) => {
    try {
      await http.post(`/pages/${page.id}/revisions/${revisionNo}/restore`, { ifMatch: etag });
      await load();
      setStatus({ kind: "saved", text: `از ویرایش ${revisionNo} بازگردانی شد.` });
    } catch (e) {
      if (e instanceof ApiError && e.status === 412) setStatus({ kind: "conflict", currentEtag: e.problem.currentEtag });
      else setStatus({ kind: "error", text: e instanceof Error ? e.message : "بازگردانی ناموفق بود." });
    }
  };

  const activate = async (versionNo: number) => {
    try {
      await http.post(`/pages/${page.id}/published-versions/${versionNo}/activate`);
      setRefreshKey((k) => k + 1);
      setStatus({ kind: "saved", text: `نسخهٔ ${versionNo} فعال شد و در حال نمایش است.` });
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : "فعال‌سازی ناموفق بود." });
    }
  };

  const runtimeUrl = `/runtime.html?site=${encodeURIComponent(project.slug)}&path=${encodeURIComponent(page.path)}`;

  return (
    <div className={styles.editor} data-studio-only="page-builder">
      <header className={styles.toolbar}>
        <button className={ui.button} onClick={onBack}>→ صفحات</button>
        <strong>{localize(page.title, "fa")}</strong> <code className={ui.muted}>{page.path}</code>
        <span className={styles.spacer} />
        <div className={styles.toolGroup} role="group" aria-label="ابزار ویرایش">
          <button type="button" className={`${ui.button} ${tool === "select" ? ui.primary : ""}`}
                  aria-pressed={tool === "select"} title="انتخاب" onClick={() => setToolMode("select")}>
            انتخاب
          </button>
          <button type="button" className={`${ui.button} ${styles.iconTool} ${tool === "style" ? ui.primary : ""}`}
                  aria-pressed={tool === "style"} aria-label="ویرایش استایل"
                  title="ویرایش استایل — روی هر ناحیه کلیک کنید"
                  onClick={() => setToolMode(tool === "style" ? "select" : "style")}>
            <PencilIcon />
          </button>
        </div>
        <button className={ui.button} disabled={!doc.past.length} onClick={() => setDoc(history.undo(doc))} title="واگرد" aria-label="واگرد">↶</button>
        <button className={ui.button} disabled={!doc.future.length} onClick={() => setDoc(history.redo(doc))} title="ازنو" aria-label="ازنو">↷</button>
        <button className={`${ui.button} ${ui.primary}`} disabled={!dirty || status.kind === "busy"} onClick={save}>ذخیره</button>
        <button className={ui.button} disabled={dirty || status.kind === "busy"} onClick={publish}
                title={dirty ? "اول ذخیره کنید" : "انتشار آخرین ویرایش ذخیره‌شده"}>انتشار</button>
        <a className={ui.button} href={runtimeUrl} target="_blank" rel="noreferrer">نمایش ↗</a>
      </header>
      {status.kind === "conflict" && (
        <div className={ui.alert} role="alert">
          این صفحه در این فاصله توسط شخص دیگری ذخیره شده است (نسخهٔ فعلی {status.currentEtag}). تغییرات شما ذخیره نشد.{" "}
          <button className={ui.button} onClick={() => { void load(); setStatus({ kind: "idle" }); }}>بارگذاری نسخهٔ جدید (تغییرات من حذف شود)</button>
        </div>
      )}
      {status.kind === "invalid" && (
        <div className={ui.alert} role="alert">
          سند نامعتبر است:
          <ul>{status.errors.map((e) => (
            <li key={e.pointer + e.code}>
              <code>{e.pointer}</code>{" "}
              {e.message.includes("needs a binding")
                ? "ورودی value باید به یک اتصال داده وصل شود (از پنل سمت چپ → اتصال داده)."
                : e.message}
            </li>
          ))}</ul>
        </div>
      )}
      {status.kind === "error" && <div className={ui.alert} role="alert">{status.text}</div>}
      {status.kind === "saved" && <div className={ui.info} role="status">{status.text}</div>}
      <div className={styles.body} style={{ "--layers-width": `${layersSize.width}px` } as CSSProperties}>
        <div className={styles.layersColumn}>
          <LayersPanel document={present} selectedId={selectedId} components={catalog.components} errorIds={errorIds}
                       onSelect={setSelectedId} onAdd={add}
                       onRemove={(id) => { commit(removeNode(present, id)); setSelectedId(null); }}
                       onMove={(id, d) => commit(moveNode(present, id, d))} onMoveTo={moveTo} />
          <ResizeHandle size={layersSize} label="تغییر اندازهٔ پنل لایه‌ها" />
        </div>
        <main className={`${styles.canvas} ${appearanceMode === "day" ? styles.canvasDay : styles.canvasNight}`}>
          <ThemeScope tokens={themeTokensFor(appearanceMode)}>
            {anyTestData && <TestDataBanner />}
            <DocumentRenderer document={present} ctx={{
              components: catalog.components, values,
              testDataBindings: Object.fromEntries(Object.values(values).map((v) => [v.bindingId, v.isTestData])),
              locale: "fa",
              appearanceMode,
              selection: { selectedId, onSelect: setSelectedId },
              styleEdit: tool === "style"
                ? {
                    active: true,
                    focus: styleTarget ? { nodeId: styleTarget.nodeId, part: styleTarget.part } : null,
                    appearanceMode,
                    onPickPart,
                    onPatchPart,
                    onResizeStart,
                  }
                : undefined,
            }} />
          </ThemeScope>
          {tool === "style" && styleTarget && styleNode && (
            <StylePopover
              target={styleTarget}
              node={styleNode}
              document={present}
              mode={appearanceMode}
              onModeChange={onAppearanceModeChange}
              onChange={onStyleChange}
              onClose={() => setStyleTarget(null)}
            />
          )}
        </main>
        <aside className={styles.side}>
          <Inspector node={selected} spec={specFor(selected)} projectId={project.id} catalog={catalog} values={values}
                     errors={invalidErrors.filter((e) => selected && nodeIdForPointer(present, e.pointer) === selected.id)}
                     onPatch={(patch) => selected && commit(updateNode(present, selected.id, patch))}
                     onBindingCreated={reloadCatalog} />
          <VersionsPanel pageId={page.id} refreshKey={refreshKey} canRestore={!dirty} onRestore={restore} onActivate={activate} />
        </aside>
      </div>
    </div>
  );
}
