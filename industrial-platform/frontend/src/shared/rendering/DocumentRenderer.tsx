import type { CSSProperties, MouseEvent, ReactNode } from "react";
import type { BindingValue, ComponentSpec, DocNode, DocumentContent, StyleBlock } from "../api/types";
import { getRenderer, type StyleEditHooks } from "../element-registry";
import { localize, type Locale } from "../i18n";
import { themeVariables } from "../style-engine";
import { BOX_PART, pagePartBag, resolvePartStyle, type AppearanceMode } from "../style-engine/parts";
import styles from "./DocumentRenderer.module.css";

export interface CanvasDragState {
  dragId: string | null;
  dropTarget: {
    parentId: string;
    index: number;
    hintId: string;
    place: "before" | "after" | "inside";
  } | null;
  onDragStart: (nodeId: string, e: React.DragEvent) => void;
  onDragOver: (node: DocNode, parent: DocNode | null, e: React.DragEvent) => void;
  onDragLeave: (node: DocNode, e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
}

export interface RenderContext {
  components: ComponentSpec[];
  values: Record<string, BindingValue | undefined>;
  /** bindingId -> fed by test data (from the bundle / binding metadata). */
  testDataBindings: Record<string, boolean>;
  locale: Locale;
  /** Day/night appearance for partStyles resolution. */
  appearanceMode?: AppearanceMode;
  /** Page-wide defaults from document.settings («همه آیتم‌ها»). */
  pagePartBag?: Record<string, StyleBlock>;
  /** Optional selection hook used by the studio canvas; the runtime never passes it. */
  selection?: { selectedId: string | null; onSelect: (id: string) => void };
  /** Studio pencil tool: click a region to edit its style in a floating popover. */
  styleEdit?: StyleEditHooks;
  /** Client-side SPA navigation handler to transition pages without full-page reloads */
  onNavigate?: (path: string) => void;
  /** Studio interactive Canvas Drag & Drop hook */
  canvasDrag?: CanvasDragState;
}

function specFor(ctx: RenderContext, node: DocNode): ComponentSpec | undefined {
  const ref = node.component;
  return ref ? ctx.components.find((c) => c.id === ref.definitionId && c.version === ref.version) : undefined;
}

function renderComponent(node: DocNode, ctx: RenderContext): ReactNode {
  const spec = specFor(ctx, node);
  const Renderer = spec ? getRenderer(spec.rendererId) : undefined;
  if (!spec || !Renderer) {
    return <div className={styles.unsupported}>کامپوننت پشتیبانی‌نشده: {node.component?.definitionKey ?? ""}@{node.component?.version ?? ""}</div>;
  }
  const inputs: Record<string, BindingValue | undefined> = {};
  const testData: Record<string, boolean> = {};
  for (const [key, ref] of Object.entries(node.bindings ?? {})) {
    inputs[key] = ctx.values[ref.bindingId];
    testData[key] = Boolean(ctx.testDataBindings[ref.bindingId]);
  }
  const appearanceMode = ctx.styleEdit?.appearanceMode ?? ctx.appearanceMode ?? "night";
  return (
    <Renderer node={node} spec={spec} inputs={inputs} testData={testData} locale={ctx.locale}
              appearanceMode={appearanceMode} pagePartBag={ctx.pagePartBag} styleEdit={ctx.styleEdit} />
  );
}

export function resolveLinkHref(link: string): string {
  if (!link) return "#";
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(link)) {
    return link;
  }
  const currentSearch = typeof window !== "undefined" ? window.location.search : "";
  const params = new URLSearchParams(currentSearch);
  const site = params.get("site");
  const normalizedPath = link.startsWith("/") ? link : `/${link}`;
  if (site) {
    const isRuntimeHtml = typeof window !== "undefined" && window.location.pathname.endsWith("runtime.html");
    const basePath = isRuntimeHtml ? "runtime.html" : window.location.pathname;
    return `${basePath}?site=${encodeURIComponent(site)}&path=${encodeURIComponent(normalizedPath)}`;
  }
  return normalizedPath;
}

function boundText(node: DocNode, ctx: RenderContext): string {
  const ref = node.bindings?.text;
  const v = ref ? ctx.values[ref.bindingId] : undefined;
  if (v && v.value !== null && v.quality !== "no_data" && v.quality !== "bad") return String(v.value);
  return localize(node.props?.text as never, ctx.locale);
}

function cloneTemplate(node: DocNode, index: number): DocNode {
  return {
    ...node,
    id: `${node.id}__${index}`,
    children: (node.children ?? []).map((c) => cloneTemplate(c, index)),
  };
}

function resolveItemScopedValues(
  template: DocNode,
  item: unknown,
  alias: string,
  base: Record<string, BindingValue | undefined>,
): Record<string, BindingValue | undefined> {
  const out: Record<string, BindingValue | undefined> = { ...base };
  for (const [key, ref] of Object.entries(template.bindings ?? {})) {
    const existing = base[ref.bindingId];
    // Studio/runtime may not re-resolve item paths server-side for every clone;
    // if the parent binding value is an array element context, prefer object field.
    if (existing && typeof item === "object" && item !== null && key) {
      void key;
    }
    out[ref.bindingId] = existing;
  }
  // Synthesize values for bindings that look like item.* by reading from the item object.
  // Convention: binding name/path stored separately — here we map bound text/value from item fields
  // when the resolved value is missing and item has matching keys used in props metadata.
  if (typeof item === "object" && item !== null) {
    const record = item as Record<string, unknown>;
    out[`__repeater_${alias}`] = {
      bindingId: `__repeater_${alias}`,
      value: item as never,
      unit: null,
      quality: "good",
      sourceTimestamp: null,
      origin: "static",
      dataOrigin: "static",
      isTestData: false,
    };
    for (const [k, v] of Object.entries(record)) {
      out[`__item_${alias}_${k}`] = {
        bindingId: `__item_${alias}_${k}`,
        value: v as never,
        unit: null,
        quality: "good",
        sourceTimestamp: null,
        origin: "static",
        dataOrigin: "static",
        isTestData: false,
      };
    }
  }
  return out;
}

function content(node: DocNode, ctx: RenderContext, siblings: number): ReactNode {
  if (node.type === "repeater") {
    const alias = node.repeater?.itemAlias || "item";
    const srcId = node.repeater?.sourceBindingId;
    const srcVal = srcId ? ctx.values[srcId] : undefined;
    const arr = Array.isArray(srcVal?.value) ? (srcVal!.value as unknown[]) : [];
    if (arr.length === 0) {
      return <div className={styles.container} data-repeater-empty>{/* empty collection */}</div>;
    }
    const templateKids = node.children ?? [];
    return (
      <div className={styles.stack} data-repeater={alias}>
        {arr.map((item, index) => {
          const itemCtx: RenderContext = {
            ...ctx,
            values: resolveItemScopedValues(
              { ...node, children: templateKids },
              item,
              alias,
              ctx.values,
            ),
          };
          return (
            <div key={`${node.id}::${index}`} data-repeater-index={index}>
              {templateKids.map((c) => (
                <NodeView key={`${c.id}__${index}`} node={cloneTemplate(c, index)} ctx={itemCtx} siblings={templateKids.length} />
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  const kids = (node.children ?? []).map((c) => (
    <NodeView key={c.id} node={c} parent={node} ctx={ctx} siblings={node.children?.length ?? 1} />
  ));
  const emptyHint =
    ctx.selection && (!node.children || node.children.length === 0) ? (
      <div className={styles.emptyContainerDropHint} data-empty-hint={node.id}>
        <span style={{ fontSize: "1rem" }}>➕</span>
        <span>این بخش خالی است — المان‌ها را با ماوس به اینجا بکشید</span>
      </div>
    ) : null;
  const mode = ctx.styleEdit?.appearanceMode ?? ctx.appearanceMode ?? "night";
  if (node.type === "component") {
    // Outer spacing (padding/margin/size) for widgets — keep renderer internals unchanged.
    const wrapStyle = resolvePartStyle(node, "box", mode, ctx.pagePartBag ?? {}) as CSSProperties;
    const styleEditing = Boolean(ctx.styleEdit?.active);
    const focused = ctx.styleEdit?.focus?.nodeId === node.id && ctx.styleEdit.focus.part === "box";
    const styleable = styleEditing ? `${styles.styleable}${focused ? ` ${styles.styleFocused}` : ""}` : "";
    return (
      <div className={styleable} style={wrapStyle} data-node-id={node.id} data-style-part="box">
        {renderComponent(node, ctx)}
      </div>
    );
  }
  const style: CSSProperties = resolvePartStyle(node, "box", mode, ctx.pagePartBag ?? {}) as CSSProperties;
  const styleEditing = Boolean(ctx.styleEdit?.active);
  const focused = ctx.styleEdit?.focus?.nodeId === node.id && ctx.styleEdit.focus.part === "box";
  const styleable = styleEditing ? `${styles.styleable}${focused ? ` ${styles.styleFocused}` : ""}` : "";

  switch (node.type) {
    case "root":
      return <div className={`${styles.root} ${styleable}`} style={style}>{kids.length > 0 ? kids : emptyHint}</div>;
    case "section": {
      const isHeader = Boolean(node.props?.fixedHeader) || Boolean(node.props?.isSiteHeader);
      return (
        <section
          className={`${styles.section} ${isHeader ? styles.fixedHeader : ""} ${node.props?.isSiteHeader ? styles.siteHeaderSection : ""} ${styleable}`}
          style={style}
          data-node-role={isHeader ? "header" : undefined}
          data-site-header={node.props?.isSiteHeader ? "true" : undefined}
        >
          {kids.length > 0 ? kids : emptyHint}
        </section>
      );
    }
    case "row":
      return <div className={`${styles.row} ${styleable}`} style={style}>{kids.length > 0 ? kids : emptyHint}</div>;
    case "column": {
      const span = Math.max(1, Math.floor(12 / Math.max(1, siblings)));
      return (
        <div className={`${styles.column} ${styleable}`} style={{ gridColumn: `span ${span}`, ...style }}>
          {kids.length > 0 ? kids : emptyHint}
        </div>
      );
    }
    case "container":
    case "stack":
    case "grid":
      return <div className={`${styles[node.type]} ${styleable}`} style={style}>{kids.length > 0 ? kids : emptyHint}</div>;
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.props?.level ?? 2)));
      const Tag = `h${level}` as "h1";
      const txt = boundText(node, ctx);
      const link = typeof node.props?.link === "string" ? node.props.link.trim() : "";
      const isButton = Boolean(node.props?.asButton);
      const variant = typeof node.props?.buttonVariant === "string" ? node.props.buttonVariant : "primary";
      const target = typeof node.props?.linkTarget === "string" ? node.props.linkTarget : "_self";

      const btnVariantClass = styles[`btn_${variant}`] ?? styles.btn_primary;
      const elementClass = isButton
        ? `${styles.buttonElement} ${btnVariantClass} ${styleable}`
        : `${styles.heading} ${styleable}`;

      if (link && !ctx.selection) {
        const href = resolveLinkHref(link);
        const isExternal = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(link);
        const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
          if (!isExternal && target !== "_blank" && ctx.onNavigate) {
            e.preventDefault();
            let targetPath = link;
            if (targetPath.includes("path=")) {
              try {
                const u = new URL(targetPath, "http://localhost");
                targetPath = u.searchParams.get("path") || targetPath;
              } catch {
                /* ignore */
              }
            }
            ctx.onNavigate(targetPath);
          }
        };
        return (
          <a
            href={href}
            target={target}
            rel={isExternal ? "noopener noreferrer" : undefined}
            className={elementClass}
            style={style}
            onClick={handleClick}
          >
            {txt}
          </a>
        );
      }

      return (
        <Tag className={elementClass} style={style}>
          {txt}
          {link && ctx.selection && (
            <span className={styles.linkBadge} title={`پیوند: ${link}`}>🔗</span>
          )}
        </Tag>
      );
    }
    case "text": {
      const txt = boundText(node, ctx);
      const link = typeof node.props?.link === "string" ? node.props.link.trim() : "";
      const isButton = Boolean(node.props?.asButton);
      const variant = typeof node.props?.buttonVariant === "string" ? node.props.buttonVariant : "primary";
      const target = typeof node.props?.linkTarget === "string" ? node.props.linkTarget : "_self";

      const btnVariantClass = styles[`btn_${variant}`] ?? styles.btn_primary;
      const elementClass = isButton
        ? `${styles.buttonElement} ${btnVariantClass} ${styleable}`
        : `${styles.text} ${styleable}`;

      if (link && !ctx.selection) {
        const href = resolveLinkHref(link);
        const isExternal = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(link);
        const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
          if (!isExternal && target !== "_blank" && ctx.onNavigate) {
            e.preventDefault();
            let targetPath = link;
            if (targetPath.includes("path=")) {
              try {
                const u = new URL(targetPath, "http://localhost");
                targetPath = u.searchParams.get("path") || targetPath;
              } catch {
                /* ignore */
              }
            }
            ctx.onNavigate(targetPath);
          }
        };
        return (
          <a
            href={href}
            target={target}
            rel={isExternal ? "noopener noreferrer" : undefined}
            className={elementClass}
            style={style}
            onClick={handleClick}
          >
            {txt}
          </a>
        );
      }

      const Tag = isButton ? "span" : "p";
      return (
        <Tag className={elementClass} style={style}>
          {txt}
          {link && ctx.selection && (
            <span className={styles.linkBadge} title={`پیوند: ${link}`}>🔗</span>
          )}
        </Tag>
      );
    }
    case "spacer":
      return <div className={styleable} style={{ height: 24, ...style }} />;
    case "divider":
      return <hr className={`${styles.divider} ${styleable}`} style={style} />;
    default:
      return null;
  }
}

export function NodeView({
  node,
  parent = null,
  ctx,
  siblings = 1,
}: {
  node: DocNode;
  parent?: DocNode | null;
  ctx: RenderContext;
  siblings?: number;
}) {
  const inner = content(node, ctx, siblings);
  if (!ctx.selection) return <>{inner}</>;
  const { selectedId, onSelect } = ctx.selection;
  const styleEdit = ctx.styleEdit;
  const canvasDrag = ctx.canvasDrag;

  const isSelected = !styleEdit?.active && selectedId === node.id;
  const isDragging = canvasDrag?.dragId === node.id;
  const isDropHint = canvasDrag?.dropTarget?.hintId === node.id;
  const dropPlace = isDropHint ? canvasDrag?.dropTarget?.place : null;

  const dropClass =
    dropPlace === "before"
      ? styles.canvasDropBefore
      : dropPlace === "after"
      ? styles.canvasDropAfter
      : dropPlace === "inside"
      ? styles.canvasDropInside
      : "";

  const isDraggable = node.type !== "root" && !styleEdit?.active;

  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    if ((e.ctrlKey || e.metaKey) && typeof node.props?.link === "string" && node.props.link.trim()) {
      const href = resolveLinkHref(node.props.link.trim());
      window.open(href, "_blank");
      return;
    }
    if (styleEdit?.active) {
      // Components handle their own parts; layout/text nodes use the "box" part.
      if (node.type === "component") return;
      styleEdit.onPickPart(node.id, "box", [BOX_PART], (e.currentTarget as HTMLElement).getBoundingClientRect());
      return;
    }
    onSelect(node.id);
  };

  const onDragStart = (e: React.DragEvent) => {
    if (!isDraggable || !canvasDrag) return;
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", node.id);
    canvasDrag.onDragStart(node.id, e);
  };

  const onDragOver = (e: React.DragEvent) => {
    if (!canvasDrag || !canvasDrag.dragId) return;
    canvasDrag.onDragOver(node, parent, e);
  };

  const onDragLeave = (e: React.DragEvent) => {
    if (!canvasDrag || !canvasDrag.dragId) return;
    canvasDrag.onDragLeave(node, e);
  };

  const onDrop = (e: React.DragEvent) => {
    if (!canvasDrag || !canvasDrag.dragId) return;
    canvasDrag.onDrop(e);
  };

  const onDragEnd = (e: React.DragEvent) => {
    if (!canvasDrag) return;
    canvasDrag.onDragEnd(e);
  };

  if (node.type === "root") {
    return (
      <div
        className={`${styles.rootWrapper} ${!styleEdit?.active && selectedId === "root" ? styles.selected : ""} ${
          styleEdit?.active ? styles.styleMode : ""
        } ${dropClass}`}
        data-node-id="root"
        onClick={onClick}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {inner}
      </div>
    );
  }

  return (
    <div
      className={`${styles.selectable} ${isSelected ? styles.selected : ""} ${
        styleEdit?.active ? styles.styleMode : ""
      } ${isDragging ? styles.nodeDragging : ""} ${dropClass}`}
      data-node-id={node.id}
      draggable={isDraggable}
      onClick={onClick}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      style={node.type === "column" ? { display: "contents" } : undefined}
    >
      {/* Floating Canvas Drag Handle & Badge when selected */}
      {isSelected && isDraggable && (
        <div
          className={styles.canvasDragHandleBadge}
          title="برای جابجایی با ماوس بکشید (Drag to move)"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <span className={styles.canvasDragHandleIcon}>⠿</span>
          <span className={styles.canvasDragHandleText}>جابجایی</span>
        </div>
      )}
      {inner}
    </div>
  );
}

export function DocumentRenderer({ document, ctx }: { document: DocumentContent; ctx: RenderContext }) {
  const dir = (document.settings?.direction as string | undefined) ?? "rtl";
  const mode = ctx.styleEdit?.appearanceMode ?? ctx.appearanceMode ?? "night";
  const enriched: RenderContext = {
    ...ctx,
    pagePartBag: ctx.pagePartBag ?? pagePartBag(document.settings, mode),
  };
  return (
    <div dir={dir} className={`${styles.document}${ctx.styleEdit?.active ? ` ${styles.styleModeCanvas}` : ""}`}>
      <NodeView node={document.root} parent={null} ctx={enriched} siblings={1} />
    </div>
  );
}

export function ThemeScope({
  tokens,
  className,
  style,
  children,
}: {
  tokens: Record<string, unknown>;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      className={`${styles.theme}${className ? ` ${className}` : ""}`}
      style={{ ...themeVariables(tokens), ...(style ?? {}) } as CSSProperties}
    >
      {children}
    </div>
  );
}
