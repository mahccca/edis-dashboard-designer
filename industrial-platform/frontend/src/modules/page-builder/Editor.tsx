import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { ApiError, http } from "../../shared/api/http";
import type { ComponentSpec, DocNode, DocumentContent, NodeType, PageSummary, Project, ProblemError, PublishedVersion, StyleValue } from "../../shared/api/types";
import {
  ConstraintError, collectIds, createNode, findNode, history, insertChild, isLeaf, moveNode, moveNodeTo, moveViolation, nodeIdForPointer, removeNode, updateNode, walk,
  type History,
} from "../../shared/document-engine";
import { localize } from "../../shared/i18n";
import { DocumentRenderer, ThemeScope } from "../../shared/rendering/DocumentRenderer";
import { themeTokensFor } from "../../shared/appearance/tokens";
import {
  loadSiteLayout,
  projectThemeToCssVars,
  projectThemeToTokens,
  setProjectDataMode,
  SiteHeader,
  SiteFooter,
  type ProjectDataMode,
} from "../../shared/site-layout";
import { patchPagePartStyle, patchPartStyle, type AppearanceMode, type StylePartDef } from "../../shared/style-engine/parts";
import { TestDataBanner } from "../../shared/ui/TestDataBadge";
import ui from "../../shared/ui/controls.module.css";
import styles from "./Editor.module.css";
import { Inspector } from "./Inspector";
import { LayersPanel } from "./LayersPanel";
import { SiteLayoutStudio } from "../platform/SiteLayoutStudio";
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
  const [showSiteLayout, setShowSiteLayout] = useState(false);
  const [canvasDragId, setCanvasDragId] = useState<string | null>(null);
  const [canvasDropTarget, setCanvasDropTarget] = useState<{
    parentId: string;
    index: number;
    hintId: string;
    place: "before" | "after" | "inside";
  } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [publishedCount, setPublishedCount] = useState<number>(0);
  const layersSize = usePanelWidth("ip.studio.layersWidth", 280, 200, 640);

  const [siteLayoutKey, setSiteLayoutKey] = useState(0);

  useEffect(() => {
    if (!showHistory) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowHistory(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showHistory]);

  useEffect(() => {
    const handleLayoutChange = () => setSiteLayoutKey((k) => k + 1);
    window.addEventListener("ip-site-layout-change", handleLayoutChange);
    return () => window.removeEventListener("ip-site-layout-change", handleLayoutChange);
  }, []);

  const siteLayout = useMemo(
    () => loadSiteLayout(project.id, project.name, project.slug),
    [project.id, project.name, project.slug, siteLayoutKey]
  );

  const load = useCallback(async () => {
    const res = await http.get<{ document: DocumentContent }>(`/pages/${page.id}`);
    setDoc(history.init(res.data.document));
    setSaved(res.data.document);
    setEtag(res.etag);
    const scheme = res.data.document.settings?.colorScheme;
    if (scheme === "day" || scheme === "night") {
      setAppearanceMode(scheme);
    } else {
      const def = siteLayout.theme.defaultAppearance;
      if (def === "day" || def === "night") {
        setAppearanceMode(def);
      }
    }
    setRefreshKey((k) => k + 1);
    void http
      .get<{ items: PublishedVersion[] }>(`/pages/${page.id}/published-versions`)
      .then(({ data }) => setPublishedCount(data.items.length))
      .catch(() => {});
  }, [page.id, siteLayout.theme.defaultAppearance]);

  useEffect(() => {
    void load();
  }, [load]);

  const present = doc?.present ?? null;
  const dirty = present !== null && present !== saved;
  const bindingIds = useMemo(
    () => (present ? [...new Set([...walk(present.root)].flatMap(({ node }) => Object.values(node.bindings ?? {}).map((b) => b.bindingId)))] : []),
    [present],
  );
  const allNodes = useMemo(() => (present ? [...walk(present.root)].map((w) => w.node) : []), [present]);
  const values = useBindingValues(bindingIds);
  const currentDataMode = siteLayout.dataEnvironment ?? "auto";
  const anyTestData =
    currentDataMode === "test"
      ? true
      : currentDataMode === "live"
      ? false
      : Object.values(values).some((v) => v.isTestData) || catalog.dataSources.some((d) => d.isTestData);

  const handleToggleDataMode = () => {
    const nextMode: ProjectDataMode = currentDataMode === "test" ? "live" : currentDataMode === "live" ? "auto" : "test";
    setProjectDataMode(project.id, nextMode, project.slug);
    setSiteLayoutKey((k) => k + 1);
  };
  const invalidErrors = status.kind === "invalid" ? status.errors : [];
  const errorIds = useMemo(
    () => new Set(present ? invalidErrors.map((e) => nodeIdForPointer(present, e.pointer)).filter((x): x is string => !!x) : []),
    [present, invalidErrors],
  );

  const onPickPart = useCallback((nodeId: string, part: string, parts: StylePartDef[], anchor: DOMRect) => {
    setSelectedId(nodeId);
    setStyleTarget({ nodeId, part, parts, anchor });
  }, []);

  const projectTokens = useMemo(
    () => projectThemeToTokens(siteLayout.theme, appearanceMode),
    [siteLayout.theme, appearanceMode]
  );
  const projectCssVars = useMemo(
    () => projectThemeToCssVars(siteLayout.theme, appearanceMode),
    [siteLayout.theme, appearanceMode]
  );
  const editorTokens = useMemo(() => {
    const schemeTokens = themeTokensFor(appearanceMode);
    return {
      ...schemeTokens,
      ...projectTokens,
      color: {
        ...((schemeTokens.color as Record<string, unknown>) ?? {}),
        ...((projectTokens.color as Record<string, unknown>) ?? {}),
      },
      radius: {
        ...((projectTokens.radius as Record<string, unknown>) ?? {}),
      },
    };
  }, [appearanceMode, projectTokens]);

  if (!doc || !present) return <div className={ui.muted} style={{ padding: 32 }}>…</div>;

  const commit = (next: DocumentContent) => setDoc((h) => (h ? history.push(h, next) : h));
  const selected = selectedId ? findNode(present, selectedId)?.node ?? null : null;
  const totalNodes = allNodes.length;
  const selectedIndex = selected ? allNodes.findIndex((n) => n.id === selected.id) + 1 : 0;
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

  const add = (parentId: string, type: NodeType, spec?: ComponentSpec, customNode?: DocNode) => {
    try {
      const node = customNode ?? createNode(type, collectIds(present), spec);
      commit(insertChild(present, parentId, node, spec));
      setSelectedId(node.id);
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof ConstraintError ? STRUCTURE_ERROR : String(e) });
    }
  };

  const handleReset = () => {
    if (!saved || !dirty) return;
    setDoc(history.init(saved));
    setSelectedId(null);
    setStatus({ kind: "saved", text: "تمامی تغییرات ذخیره‌نشده لغو شدند و صفحه به حالت قبل بازگشت." });
  };

  const duplicateNode = (nodeId: string) => {
    if (!present || nodeId === present.root.id) return;
    const existingIds = collectIds(present);
    let nextNum = 1;
    const generateId = (prefix: string) => {
      let id = `${prefix}-${Date.now().toString(36)}-${nextNum++}`;
      while (existingIds.has(id)) {
        id = `${prefix}-${Date.now().toString(36)}-${nextNum++}`;
      }
      existingIds.add(id);
      return id;
    };
    const clone = (n: DocNode): DocNode => {
      const newId = generateId(n.type);
      return {
        ...n,
        id: newId,
        children: n.children ? n.children.map(clone) : undefined,
      };
    };

    for (const { node: parent } of walk(present.root)) {
      if (!parent.children) continue;
      const idx = parent.children.findIndex((c) => c.id === nodeId);
      if (idx !== -1) {
        const target = parent.children[idx];
        if (!target) return;
        const spec = specFor(target);
        const cloned = clone(target);
        try {
          let updated = insertChild(present, parent.id, cloned, spec);
          if (idx + 1 < parent.children.length) {
            updated = moveNodeTo(updated, cloned.id, parent.id, idx + 1, spec);
          }
          commit(updated);
          setSelectedId(cloned.id);
        } catch (e) {
          setStatus({ kind: "error", text: e instanceof ConstraintError ? STRUCTURE_ERROR : String(e) });
        }
        return;
      }
    }
  };

  const removeSelectedNode = (nodeId: string) => {
    if (!present || nodeId === present.root.id) return;
    commit(removeNode(present, nodeId));
    setSelectedId(null);
  };

  const moveTo = (id: string, parentId: string, index?: number) => {
    try {
      commit(moveNodeTo(present, id, parentId, index, specFor(findNode(present, id)?.node ?? null)));
      setSelectedId(id);
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof ConstraintError ? STRUCTURE_ERROR : String(e) });
    }
  };

  const onCanvasDragStart = (nodeId: string, e: React.DragEvent) => {
    setCanvasDragId(nodeId);
    setSelectedId(nodeId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", nodeId);
  };

  const onCanvasDragOver = (node: DocNode, parent: DocNode | null, e: React.DragEvent) => {
    if (!canvasDragId || canvasDragId === node.id || !present) return;

    const dragged = findNode(present, canvasDragId)?.node;
    if (!dragged) return;

    const spec = specFor(dragged);
    const allowed = (parentId: string) => moveViolation(present, canvasDragId, parentId, spec) === null;

    const isContainer = !isLeaf(node.type);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const ratioY = rect.height ? (e.clientY - rect.top) / rect.height : 0.5;
    const ratioX = rect.width ? (e.clientX - rect.left) / rect.width : 0.5;

    const isRow = parent?.type === "row" || parent?.type === "grid";
    const edge = isContainer ? 0.28 : 0.5;

    let target: { parentId: string; index: number; hintId: string; place: "before" | "after" | "inside" } | null = null;

    if (isContainer && (!node.children || node.children.length === 0) && allowed(node.id)) {
      target = { parentId: node.id, index: 0, hintId: node.id, place: "inside" };
    } else if (isRow && parent && allowed(parent.id)) {
      const isRtl = present.settings?.direction !== "ltr";
      const horizRatio = isRtl ? 1 - ratioX : ratioX;
      const siblings = (parent.children ?? []).filter((c) => c.id !== canvasDragId);
      const at = siblings.findIndex((c) => c.id === node.id);
      const place = horizRatio < 0.5 ? "before" : "after";
      target = { parentId: parent.id, index: place === "before" ? at : at + 1, hintId: node.id, place };
    } else if (parent && (ratioY < edge || ratioY > 1 - edge) && allowed(parent.id)) {
      const siblings = (parent.children ?? []).filter((c) => c.id !== canvasDragId);
      const at = siblings.findIndex((c) => c.id === node.id);
      const place = ratioY < edge ? "before" : "after";
      target = { parentId: parent.id, index: place === "before" ? at : at + 1, hintId: node.id, place };
    } else if (isContainer && allowed(node.id)) {
      const count = (node.children ?? []).filter((c) => c.id !== canvasDragId).length;
      target = { parentId: node.id, index: count, hintId: node.id, place: "inside" };
    } else if (parent && allowed(parent.id)) {
      const siblings = (parent.children ?? []).filter((c) => c.id !== canvasDragId);
      const at = siblings.findIndex((c) => c.id === node.id);
      const place = ratioY < 0.5 ? "before" : "after";
      target = { parentId: parent.id, index: place === "before" ? at : at + 1, hintId: node.id, place };
    }

    if (target) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      if (
        canvasDropTarget?.hintId !== target.hintId ||
        canvasDropTarget?.place !== target.place ||
        canvasDropTarget?.index !== target.index
      ) {
        setCanvasDropTarget(target);
      }
    }
  };

  const onCanvasDragLeave = (node: DocNode) => {
    if (canvasDropTarget?.hintId === node.id) {
      setCanvasDropTarget(null);
    }
  };

  const onCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (canvasDragId && canvasDropTarget) {
      moveTo(canvasDragId, canvasDropTarget.parentId, canvasDropTarget.index);
    }
    setCanvasDragId(null);
    setCanvasDropTarget(null);
  };

  const onCanvasDragEnd = () => {
    setCanvasDragId(null);
    setCanvasDropTarget(null);
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
      setPublishedCount((c) => c + 1);
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

  const handleOpenRuntime = async (e: React.MouseEvent) => {
    if (dirty && present) {
      e.preventDefault();
      setStatus({ kind: "busy", what: "ذخیره و انتشار خودکار" });
      try {
        const res = await http.put<{ revisionNo: number }>(`/pages/${page.id}/document`, {
          body: { content: present },
          ifMatch: etag,
        });
        setSaved(present);
        setEtag(res.etag);
        await http.post<PublishedVersion>(`/pages/${page.id}/publish`, {
          body: { revisionNo: res.data.revisionNo },
        });
        setRefreshKey((k) => k + 1);
        setStatus({ kind: "saved", text: "صفحه ذخیره، منتشر و در تب جدید باز شد." });
        window.open(runtimeUrl, "_blank");
      } catch {
        window.open(runtimeUrl, "_blank");
      }
    }
  };

  const runtimeUrl = `/runtime.html?site=${encodeURIComponent(project.slug)}&path=${encodeURIComponent(page.path)}`;

  return (
    <div className={styles.editor} data-studio-only="page-builder">
      <header className={styles.toolbar}>
        <button className={styles.backBtn} onClick={onBack} title="بازگشت به صفحات">← صفحات</button>
        <div className={styles.pageInfo}>
          <strong className={styles.pageTitle}>{localize(page.title, "fa")}</strong>
          <code className={styles.pagePath}>{page.path}</code>
        </div>
        <span className={styles.spacer} />
        <div className={styles.toolGroup} role="group" aria-label="ابزار ویرایش">
          <button type="button" className={`${tool === "select" ? styles.segmentedTabBtnActive : ""}`}
                  aria-pressed={tool === "select"} title="انتخاب المان‌ها" onClick={() => setToolMode("select")}>
            انتخاب
          </button>
          <button type="button" className={`${styles.iconTool} ${tool === "style" ? styles.segmentedTabBtnActive : ""}`}
                  aria-pressed={tool === "style"} aria-label="ویرایش استایل"
                  title="ویرایش استایل — روی هر ناحیه کلیک کنید"
                  onClick={() => setToolMode(tool === "style" ? "select" : "style")}>
            <PencilIcon />
          </button>
        </div>
        <div className={styles.themeToggleGroup} role="group" aria-label="انتخاب تم">
          <button
            type="button"
            className={`${appearanceMode === "night" ? styles.themeActiveNight : ""}`}
            onClick={() => onAppearanceModeChange("night")}
            title="مشاهده و ویرایش در حالت شب"
            aria-label="تم شب"
            aria-pressed={appearanceMode === "night"}
          >
            🌙 شب
          </button>
          <button
            type="button"
            className={`${appearanceMode === "day" ? styles.themeActiveDay : ""}`}
            onClick={() => onAppearanceModeChange("day")}
            title="مشاهده و ویرایش در حالت روز"
            aria-label="تم روز"
            aria-pressed={appearanceMode === "day"}
          >
            ☀️ روز
          </button>
        </div>
        <div className={styles.historyGroup}>
          <button disabled={!doc.past.length} onClick={() => setDoc(history.undo(doc))} title="واگرد" aria-label="واگرد">↶</button>
          <button disabled={!doc.future.length} onClick={() => setDoc(history.redo(doc))} title="ازنو" aria-label="ازنو">↷</button>
        </div>
        <button
          type="button"
          className={`${styles.savedPill} ${showHistory ? styles.historyToggleBtnActive : ""}`}
          onClick={() => setShowHistory((prev) => !prev)}
          title={dirty ? "تغییرات ذخیره‌نشده دارید — کلیک برای مشاهده تاریخچه نسخه‌ها" : "تمامی تغییرات ذخیره شده‌اند — کلیک برای مشاهده تاریخچه نسخه‌ها"}
          aria-expanded={showHistory}
        >
          <span className={`${styles.savedPillDot} ${dirty ? styles.savedPillDotDirty : ""}`} />
          <span>{dirty ? "ذخیره نشده" : "Saved pages"}</span>
        </button>
        <button
          type="button"
          className={`${styles.historyToggleBtn} ${showHistory ? styles.historyToggleBtnActive : ""}`}
          onClick={() => setShowHistory((prev) => !prev)}
          title="مشاهده تاریخچه نسخه‌های منتشرشده و ویرایش‌ها (کلیک برای نمایش یا مخفی کردن)"
          aria-expanded={showHistory}
        >
          <span aria-hidden="true">🕒</span>
          <span>تاریخچه نسخه‌ها</span>
          {publishedCount > 0 && <span className={styles.historyBadge}>{publishedCount}</span>}
        </button>
        <button
          type="button"
          className={styles.resetBtn}
          disabled={!dirty}
          onClick={handleReset}
          title={dirty ? "بازنشانی تغییرات به آخرین وضعیت ذخیره‌شده" : "هیچ تغییری برای بازنشانی وجود ندارد"}
        >
          <span>Reset</span>
          <span style={{ fontSize: "0.7rem", opacity: 0.7 }}>⌄</span>
        </button>
        <button
          type="button"
          className={styles.saveBtn}
          disabled={!dirty || status.kind === "busy"}
          onClick={save}
          aria-label="ذخیره"
        >
          {dirty && <span className={styles.dirtyBadge} aria-hidden="true" />}
          <span aria-hidden="true" style={{ marginInlineEnd: 4 }}>💾</span>
          ذخیره
        </button>
        <button className={styles.backBtn} disabled={dirty || status.kind === "busy"} onClick={publish}
                title={dirty ? "اول ذخیره کنید" : "انتشار آخرین ویرایش ذخیره‌شده"}>انتشار</button>
        <a className={styles.backBtn} href={runtimeUrl} target="_blank" rel="noreferrer" onClick={handleOpenRuntime} title="نمایش زنده در ران‌تایم">نمایش ↗</a>
        <button
          type="button"
          className={styles.backBtn}
          style={{ borderColor: "rgba(56, 189, 248, 0.4)", color: "#38bdf8", gap: 6 }}
          onClick={() => setShowSiteLayout(true)}
          title="تنظیمات هدر، منو، لوگو، فوتر و تم پروژه"
        >
          <span>🎨</span> قالب سایت
        </button>
        <button
          type="button"
          className={styles.backBtn}
          style={{
            background:
              currentDataMode === "test"
                ? "rgba(245, 165, 36, 0.15)"
                : currentDataMode === "live"
                ? "rgba(16, 185, 129, 0.15)"
                : "rgba(56, 189, 248, 0.12)",
            borderColor:
              currentDataMode === "test"
                ? "rgba(245, 165, 36, 0.4)"
                : currentDataMode === "live"
                ? "rgba(16, 185, 129, 0.4)"
                : "rgba(56, 189, 248, 0.3)",
            color:
              currentDataMode === "test"
                ? "#f5a524"
                : currentDataMode === "live"
                ? "#34d399"
                : "#38bdf8",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontWeight: 600,
          }}
          onClick={handleToggleDataMode}
          title={`حالت داده‌های پروژه: ${
            currentDataMode === "test"
              ? "تستی / شبیه‌سازی (کلیک برای تغییر به عملیاتی)"
              : currentDataMode === "live"
              ? "واقعی و عملیاتی (کلیک برای تغییر به خودکار)"
              : "تشخیص خودکار (کلیک برای تغییر به تستی)"
          }`}
        >
          <span>
            {currentDataMode === "test"
              ? "🧪 تستی"
              : currentDataMode === "live"
              ? "🟢 واقعی"
              : "⚡ خودکار"}
          </span>
        </button>
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
          <ThemeScope tokens={editorTokens}>
            <div className={styles.artboard} data-theme={appearanceMode} style={projectCssVars as CSSProperties}>
              {siteLayout.header.enabled && (
                <div style={{ borderBottom: "1px dashed rgba(56, 189, 248, 0.25)" }}>
                  <SiteHeader
                    config={siteLayout.header}
                    theme={siteLayout.theme}
                    appearanceMode={appearanceMode}
                    onAppearanceModeChange={setAppearanceMode}
                    siteSlug={project.slug}
                    currentPath={page.path}
                    liveValues={values}
                    dataMode={currentDataMode}
                    showDataModeBadge={siteLayout.showDataModeBadge ?? siteLayout.header.showDataModeBadge ?? true}
                  />
                </div>
              )}
              {anyTestData && <TestDataBanner />}
              <DocumentRenderer document={present} ctx={{
                components: catalog.components, values,
                testDataBindings: Object.fromEntries(Object.values(values).map((v) => [v.bindingId, v.isTestData])),
                locale: "fa",
                appearanceMode,
                selection: { selectedId, onSelect: setSelectedId },
                canvasDrag: {
                  dragId: canvasDragId,
                  dropTarget: canvasDropTarget,
                  onDragStart: onCanvasDragStart,
                  onDragOver: onCanvasDragOver,
                  onDragLeave: onCanvasDragLeave,
                  onDrop: onCanvasDrop,
                  onDragEnd: onCanvasDragEnd,
                },
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
              {siteLayout.footer.enabled && (
                <div style={{ borderTop: "1px dashed rgba(56, 189, 248, 0.25)" }}>
                  <SiteFooter
                    config={siteLayout.footer}
                    theme={siteLayout.theme}
                    appearanceMode={appearanceMode}
                    siteSlug={project.slug}
                  />
                </div>
              )}
            </div>
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
          <Inspector
            node={selected}
            spec={specFor(selected)}
            projectId={project.id}
            catalog={catalog}
            values={values}
            errors={invalidErrors.filter((e) => selected && nodeIdForPointer(present, e.pointer) === selected.id)}
            onPatch={(patch) => selected && commit(updateNode(present, selected.id, patch))}
            onBindingCreated={reloadCatalog}
            appearanceMode={appearanceMode}
            onAppearanceModeChange={onAppearanceModeChange}
            totalNodes={totalNodes}
            selectedIndex={selectedIndex}
            onDuplicate={duplicateNode}
            onRemove={removeSelectedNode}
          />
        </aside>
      </div>
      {showHistory && (
        <div
          className={styles.historyDrawerOverlay}
          onClick={() => setShowHistory(false)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ height: "100%", display: "flex" }}>
            <VersionsPanel
              pageId={page.id}
              refreshKey={refreshKey}
              canRestore={!dirty}
              onRestore={(rev) => {
                void restore(rev);
                setShowHistory(false);
              }}
              onActivate={(ver) => {
                void activate(ver);
                setShowHistory(false);
              }}
              onClose={() => setShowHistory(false)}
              onPublishedCountChange={setPublishedCount}
            />
          </div>
        </div>
      )}
      {showSiteLayout && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000000,
          background: "rgba(0, 0, 0, 0.8)",
          backdropFilter: "blur(8px)",
          display: "flex",
          flexDirection: "column",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 20px",
            background: "#18202a",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
          }}>
            <strong style={{ fontSize: "1rem", color: "#ffffff" }}>
              ویرایشگر قالب کلی، هدر، منو و تم پروژه: {project.name}
            </strong>
            <button
              type="button"
              className={ui.button}
              style={{ fontWeight: 600 }}
              onClick={() => setShowSiteLayout(false)}
            >
              ✕ بستن و بازگشت به صفحه
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <SiteLayoutStudio project={project} appearanceMode={appearanceMode} />
          </div>
        </div>
      )}
    </div>
  );
}
