import type { CSSProperties, MouseEvent, ReactNode } from "react";
import type { BindingValue, ComponentSpec, DocNode, DocumentContent, StyleBlock } from "../api/types";
import { getRenderer, type StyleEditHooks } from "../element-registry";
import { localize, type Locale } from "../i18n";
import { themeVariables } from "../style-engine";
import { BOX_PART, pagePartBag, resolvePartStyle, type AppearanceMode } from "../style-engine/parts";
import styles from "./DocumentRenderer.module.css";

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

  const kids = (node.children ?? []).map((c) => <NodeView key={c.id} node={c} ctx={ctx} siblings={node.children?.length ?? 1} />);
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
      return <div className={`${styles.root} ${styleable}`} style={style}>{kids}</div>;
    case "section":
      return <section className={`${styles.section} ${styleable}`} style={style}>{kids}</section>;
    case "row":
      return <div className={`${styles.row} ${styleable}`} style={style}>{kids}</div>;
    case "column": {
      const span = Math.max(1, Math.floor(12 / Math.max(1, siblings)));
      return <div className={`${styles.column} ${styleable}`} style={{ gridColumn: `span ${span}`, ...style }}>{kids}</div>;
    }
    case "container":
    case "stack":
    case "grid":
      return <div className={`${styles[node.type]} ${styleable}`} style={style}>{kids}</div>;
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.props?.level ?? 2)));
      const Tag = `h${level}` as "h1";
      return <Tag className={`${styles.heading} ${styleable}`} style={style}>{boundText(node, ctx)}</Tag>;
    }
    case "text":
      return <p className={`${styles.text} ${styleable}`} style={style}>{boundText(node, ctx)}</p>;
    case "spacer":
      return <div className={styleable} style={{ height: 24, ...style }} />;
    case "divider":
      return <hr className={`${styles.divider} ${styleable}`} style={style} />;
    default:
      return null;
  }
}

function NodeView({ node, ctx, siblings }: { node: DocNode; ctx: RenderContext; siblings: number }) {
  const inner = content(node, ctx, siblings);
  if (!ctx.selection || node.type === "root") return <>{inner}</>;
  const { selectedId, onSelect } = ctx.selection;
  const styleEdit = ctx.styleEdit;

  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (styleEdit?.active) {
      // Components handle their own parts; layout/text nodes use the "box" part.
      if (node.type === "component") return;
      styleEdit.onPickPart(node.id, "box", [BOX_PART], (e.currentTarget as HTMLElement).getBoundingClientRect());
      return;
    }
    onSelect(node.id);
  };

  return (
    <div
      className={`${styles.selectable} ${!styleEdit?.active && selectedId === node.id ? styles.selected : ""} ${styleEdit?.active ? styles.styleMode : ""}`}
      data-node-id={node.id}
      onClick={onClick}
      style={node.type === "column" ? { display: "contents" } : undefined}
    >
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
      <NodeView node={document.root} ctx={enriched} siblings={1} />
    </div>
  );
}

export function ThemeScope({ tokens, children }: { tokens: Record<string, unknown>; children: ReactNode }) {
  return <div className={styles.theme} style={themeVariables(tokens) as CSSProperties}>{children}</div>;
}
