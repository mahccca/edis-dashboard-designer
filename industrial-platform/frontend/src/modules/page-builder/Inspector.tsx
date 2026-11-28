import { useState } from "react";
import type { BindingRef, BindingValue, ComponentSpec, DataBinding, DataSource, DocNode, PropertySpec, ProblemError, StyleBlock } from "../../shared/api/types";
import { localize } from "../../shared/i18n";
import ui from "../../shared/ui/controls.module.css";
import { TrashIcon } from "../../shared/ui/TrashIcon";
import { ApiOptionPicker } from "./ApiOptionPicker";
import { BindingConfigPanel } from "./BindingConfigPanel";
import { BindingPicker } from "./BindingPicker";
import styles from "./Editor.module.css";
import type { EditorCatalog } from "./useEditorData";
import type { AppearanceMode } from "../../shared/style-engine/parts";
import { resolveLinkHref } from "../../shared/rendering/DocumentRenderer";

type Patch = (n: DocNode) => DocNode;

function setProp(key: string, value: unknown): Patch {
  return (n) => {
    const props = { ...(n.props ?? {}) };
    if (value === undefined || value === "") delete props[key];
    else props[key] = value;
    return { ...n, props };
  };
}

function setStyle(key: string, value: unknown): Patch {
  return (n) => {
    const style: StyleBlock = { ...(n.style ?? {}) };
    if (value === undefined || value === "") {
      const { [key]: _removed, ...rest } = style;
      return Object.keys(rest).length ? { ...n, style: rest } : { ...n, style: undefined };
    }
    return { ...n, style: { ...style, [key]: value as StyleBlock[string] } };
  };
}

function LocalizedInput({ value, onChange, maxLength }: { value: unknown; onChange: (v: unknown) => void; maxLength?: number }) {
  const obj: Record<string, string> = typeof value === "string" ? { fa: value } : ((value as Record<string, string>) ?? {});
  const update = (lang: string, text: string) => {
    const next = { ...obj, [lang]: text };
    if (!text) delete next[lang];
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <div className={ui.row}>
      <input className={ui.input} dir="rtl" placeholder="فارسی" maxLength={maxLength} value={obj.fa ?? ""} onChange={(e) => update("fa", e.target.value)} />
      <input className={ui.input} dir="ltr" placeholder="انگلیسی" maxLength={maxLength} value={obj.en ?? ""} onChange={(e) => update("en", e.target.value)} />
    </div>
  );
}

/** Accepts bare px number or CSS length / 1–4 length list (e.g. 16 or "8px 16px"). */
function parseSpacing(raw: string): string | number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t;
}

function spacingDisplay(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "object" && value !== null && "$token" in value) return `token:${(value as { $token: string }).$token}`;
  return String(value);
}

function SpacingField({
  label, hint, value, onChange,
}: {
  label: string;
  hint?: string;
  value: unknown;
  onChange: (v: string | number | undefined) => void;
}) {
  return (
    <label className={ui.field}>
      <span className={ui.label}>{label}</span>
      <div className={ui.row}>
        <input
          className={ui.input}
          dir="ltr"
          placeholder="مثلاً 16 یا 8px 16px"
          value={spacingDisplay(value)}
          onChange={(e) => onChange(parseSpacing(e.target.value))}
        />
        {value !== undefined && value !== "" && (
          <button type="button" className={ui.button} onClick={() => onChange(undefined)}>پاک</button>
        )}
      </div>
      {hint && <span className={ui.hint}>{hint}</span>}
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: unknown; onChange: (v: unknown) => void }) {
  const hex = typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : "";
  const picker = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : (hex || "#18202a");
  return (
    <label className={ui.field}>
      <span className={ui.label}>{label}</span>
      <div className={ui.row}>
        <input type="color" value={picker.slice(0, 7)} aria-label={label}
               onChange={(e) => onChange(e.target.value)} />
        <input className={ui.input} dir="ltr" placeholder="#18202a یا transparent" value={typeof value === "string" ? value : ""}
               onChange={(e) => onChange(e.target.value || undefined)} />
        {value !== undefined && value !== "" && (
          <button type="button" className={ui.button} onClick={() => onChange(undefined)}>پاک</button>
        )}
      </div>
    </label>
  );
}

function PropertyField({
  spec, value, fallback, onChange, dataSources, projectId, onDynamicBind, onBindingCreated,
}: {
  spec: PropertySpec;
  value: unknown;
  fallback: unknown;
  onChange: (v: unknown) => void;
  dataSources: DataSource[];
  projectId?: string;
  onDynamicBind?: (bindingId: string) => void;
  onBindingCreated?: (b: DataBinding) => Promise<void>;
}) {
  const hint = [spec.required ? "الزامی" : "", spec.minimum !== undefined ? `≥ ${spec.minimum}` : "", spec.maximum !== undefined ? `≤ ${spec.maximum}` : ""]
    .filter(Boolean).join(" · ");
  const apiEligible = spec.type === "string" || spec.type === "text" || spec.type === "enum";
  let input;
  switch (spec.type) {
    case "string":
    case "text":
      input = <LocalizedInput value={value} onChange={onChange} maxLength={spec.maxLength} />;
      break;
    case "number":
    case "integer":
      input = (
        <input className={ui.input} type="number" step={spec.type === "integer" ? 1 : "any"} min={spec.minimum} max={spec.maximum}
               aria-label={localize(spec.label, "fa")}
               placeholder={fallback === undefined ? "" : String(fallback)} value={value === undefined ? "" : String(value)}
               onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} />
      );
      break;
    case "boolean":
      input = <input type="checkbox" checked={Boolean(value ?? fallback)} onChange={(e) => onChange(e.target.checked)} />;
      break;
    case "enum":
      input = (
        <select className={ui.select} value={value === undefined ? "" : String(value)} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">{fallback === undefined ? "—" : `پیش‌فرض (${String(fallback)})`}</option>
          {(spec.enum ?? []).map((o) => <option key={String(o)} value={String(o)}>{String(o)}</option>)}
        </select>
      );
      break;
    case "color":
      return <ColorField label={`${localize(spec.label, "fa")} (${spec.key})`} value={value} onChange={onChange} />;
    default:
      input = <input className={ui.input} placeholder={fallback === undefined ? "" : String(fallback)} value={value === undefined ? "" : String(value)}
                     onChange={(e) => onChange(e.target.value || undefined)} />;
  }
  return (
    <label className={ui.field}>
      <span className={ui.label}>{localize(spec.label, "fa")} <code>{spec.key}</code></span>
      {input}
      {hint && <span className={ui.hint}>{hint}</span>}
      {apiEligible && (
        <ApiOptionPicker
          dataSources={dataSources}
          onPick={(v) => {
            if (spec.type === "string" || spec.type === "text") onChange({ fa: v });
            else onChange(v);
          }}
        />
      )}
      {apiEligible && onDynamicBind && (
        <details style={{ marginTop: 6 }}>
          <summary className={ui.muted}>بایندینگ پویا (Live)</summary>
          <BindingConfigPanel
            projectId={projectId!}
            dataSources={dataSources}
            onCreated={async (b) => {
              await onBindingCreated?.(b);
              onDynamicBind(b.id);
            }}
          />
        </details>
      )}
    </label>
  );
}

interface Props {
  node: DocNode | null;
  spec: ComponentSpec | undefined;
  projectId: string;
  catalog: EditorCatalog;
  values: Record<string, BindingValue>;
  errors: ProblemError[];
  onPatch: (patch: Patch) => void;
  onBindingCreated: (b: DataBinding) => Promise<void>;
  appearanceMode?: AppearanceMode;
  onAppearanceModeChange?: (mode: AppearanceMode) => void;
  totalNodes?: number;
  selectedIndex?: number;
  onDuplicate?: (nodeId: string) => void;
  onRemove?: (nodeId: string) => void;
}

export function Inspector({
  node,
  spec,
  projectId,
  catalog,
  values,
  errors,
  onPatch,
  onBindingCreated,
  appearanceMode = "night",
  onAppearanceModeChange,
  totalNodes,
  selectedIndex,
  onDuplicate,
  onRemove,
}: Props) {
  const [rightTab, setRightTab] = useState<"style" | "detail">("detail");

  if (!node) {
    return (
      <div className={styles.panel}>
        <div className={styles.segmentedTabContainer}>
          <div className={styles.segmentedTabTrack} role="tablist">
            <button
              type="button"
              className={`${styles.segmentedTabBtn} ${rightTab === "style" ? styles.segmentedTabBtnActive : ""}`}
              onClick={() => setRightTab("style")}
              role="tab"
              aria-selected={rightTab === "style"}
            >
              Style
            </button>
            <button
              type="button"
              className={`${styles.segmentedTabBtn} ${rightTab === "detail" ? styles.segmentedTabBtnActive : ""}`}
              onClick={() => setRightTab("detail")}
              role="tab"
              aria-selected={rightTab === "detail"}
            >
              component detail
            </button>
          </div>
        </div>
        <div style={{ padding: 28, textAlign: "center", color: "var(--dp-ink-3)" }}>
          <div style={{ fontSize: "2rem", marginBottom: 8 }}>👆</div>
          <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--dp-ink-2)" }}>یک کامپوننت را انتخاب کنید</div>
          <div style={{ fontSize: "0.74rem", marginTop: 6, color: "var(--dp-ink-4)", lineHeight: 1.5 }}>
            از ستون لایه‌ها در سمت چپ یا مستقیماً روی بوم صفحه، روی یک کامپوننت کلیک کنید تا تنظیمات دیتا یا استایل آن فعال شود.
          </div>
        </div>
      </div>
    );
  }

  const setBinding = (key: string) => (ref: BindingRef | undefined) =>
    onPatch((n) => {
      const bindings = { ...(n.bindings ?? {}) };
      if (ref) bindings[key] = ref;
      else delete bindings[key];
      return { ...n, bindings };
    });

  const nodeTitle = spec
    ? localize(spec.name, "fa")
    : node.props?.fixedHeader
    ? "هدر چسبنده (Sticky Header)"
    : node.props?.asButton
    ? "دکمه تعاملی"
    : node.type;

  return (
    <div className={styles.panel}>
      {/* Sunken Pill Segmented Tab Toggle (Style vs. Component Detail) matching the screenshot */}
      <div className={styles.segmentedTabContainer}>
        <div className={styles.segmentedTabTrack} role="tablist">
          <button
            type="button"
            className={`${styles.segmentedTabBtn} ${rightTab === "style" ? styles.segmentedTabBtnActive : ""}`}
            onClick={() => setRightTab("style")}
            role="tab"
            aria-selected={rightTab === "style"}
          >
            Style
          </button>
          <button
            type="button"
            className={`${styles.segmentedTabBtn} ${rightTab === "detail" ? styles.segmentedTabBtnActive : ""}`}
            onClick={() => setRightTab("detail")}
            role="tab"
            aria-selected={rightTab === "detail"}
          >
            component detail
          </button>
        </div>
      </div>

      <div className={styles.inspectorBody}>
        {/* Subtitle matching DesignPrompts: "Changes this block only. Block X of Y on the page." */}
        <div className={styles.inspectorSubtitle}>
          تنظیمات مختص این المان است.{" "}
          {totalNodes && selectedIndex ? (
            <span>المان {selectedIndex} از {totalNodes} در این صفحه.</span>
          ) : (
            <span>شناسه: <code>{node.id}</code></span>
          )}
        </div>

        {/* Component Header with Title, Duplicate and Delete Buttons */}
        <div className={styles.inspectorHeader}>
          <div className={styles.inspectorTitle}>{nodeTitle}</div>
          <div className={styles.inspectorActions}>
            <button
              type="button"
              className={styles.inspectorActionBtn}
              onClick={() => onDuplicate?.(node.id)}
              title="تکرار و کپی این المان (Duplicate)"
            >
              ⧉
            </button>
            <button
              type="button"
              className={styles.inspectorActionBtn}
              onClick={() => onRemove?.(node.id)}
              title="حذف این المان (Delete)"
            >
              <TrashIcon size={13} />
            </button>
          </div>
        </div>

        {errors.length > 0 && (
          <div className={ui.alert} role="alert">
            {errors.map((e) => (
              <div key={e.pointer + e.code}>{e.message} <code>{e.code}</code></div>
            ))}
          </div>
        )}

        {/* TAB 1: COMPONENT DETAIL & LIVE TELEMETRY DATA */}
        {rightTab === "detail" && (
          <div className={ui.form}>
            {/* Block Variation / Type */}
            {(node.type === "heading" || node.props?.asButton || (node.type === "component" && spec)) && (
              <div>
                <div className={styles.inspectorSectionTitle}>
                  <span>مدل و تنوع (BLOCK VARIATION)</span>
                  <span className={styles.inspectorSectionBadge}>
                    {node.props?.asButton ? "۴ طرح دکمه" : node.type === "heading" ? "۴ سطح تیتر" : `${spec?.key ?? ""}`}
                  </span>
                </div>

                {Boolean(node.props?.asButton) && (
                  <div className={styles.segmentedChoiceGroup}>
                    {(["primary", "secondary", "outline", "danger"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={`${styles.segmentedChoiceBtn} ${
                          (node.props?.buttonVariant ?? "primary") === v ? styles.segmentedChoiceBtnActive : ""
                        }`}
                        onClick={() => onPatch(setProp("buttonVariant", v))}
                      >
                        {v === "primary" ? "شاخص" : v === "secondary" ? "تیره" : v === "outline" ? "خطی" : "هشدار"}
                      </button>
                    ))}
                  </div>
                )}

                {node.type === "heading" && (
                  <div className={styles.segmentedChoiceGroup}>
                    {(["h1", "h2", "h3", "h4"] as const).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        className={`${styles.segmentedChoiceBtn} ${
                          (node.props?.level ?? "h2") === lvl ? styles.segmentedChoiceBtnActive : ""
                        }`}
                        onClick={() => onPatch(setProp("level", lvl))}
                      >
                        {lvl.toUpperCase()}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* OPTIONS & PROPS */}
            <div>
              <div className={styles.inspectorSectionTitle}>
                <span>مشخصات و ورودی‌ها (OPTIONS)</span>
              </div>

              {node.type === "component" && spec && (
                <>
                  <div className={ui.muted} style={{ fontSize: "0.72rem", marginBottom: 6 }}>
                    {spec.key}@{spec.version}
                  </div>
                  {spec.properties.map((p) => (
                    <PropertyField
                      key={p.key}
                      spec={p}
                      value={node.props?.[p.key]}
                      fallback={spec.defaults[p.key]}
                      dataSources={catalog.dataSources}
                      projectId={projectId}
                      onBindingCreated={onBindingCreated}
                      onDynamicBind={(bindingId) => setBinding(p.key)({ bindingId })}
                      onChange={(v) => onPatch(setProp(p.key, v))}
                    />
                  ))}
                </>
              )}

              {(node.type === "heading" || node.type === "text") && (
                <div className={ui.field}>
                  <span className={ui.label}>متن {node.props?.asButton ? "دکمه" : node.type}</span>
                  <LocalizedInput value={node.props?.text} onChange={(v) => onPatch(setProp("text", v))} />

                  <div className={ui.field} style={{ marginTop: 8 }}>
                    <span className={ui.label}>پیوند به صفحه پروژه یا URL</span>
                    {catalog.pages && catalog.pages.length > 0 && (
                      <select
                        className={ui.select}
                        style={{ marginBottom: 6 }}
                        value={catalog.pages.some((p) => p.path === node.props?.link) ? String(node.props?.link) : ""}
                        onChange={(e) => {
                          if (e.target.value) onPatch(setProp("link", e.target.value));
                        }}
                      >
                        <option value="">-- انتخاب از صفحات این پروژه --</option>
                        {catalog.pages.map((p) => (
                          <option key={p.id} value={p.path}>
                            {localize(p.title, "fa")} ({p.path})
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      className={ui.input}
                      dir="ltr"
                      placeholder="مثلاً /monitoring یا https://example.com"
                      value={String(node.props?.link ?? "")}
                      onChange={(e) => onPatch(setProp("link", e.target.value || undefined))}
                    />
                  </div>

                  {Boolean(node.props?.link) && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                      <select
                        className={ui.select}
                        value={String(node.props?.linkTarget ?? "_self")}
                        onChange={(e) => onPatch(setProp("linkTarget", e.target.value))}
                        style={{ flex: 1 }}
                      >
                        <option value="_self">در همین صفحه (_self)</option>
                        <option value="_blank">در تب جدید (_blank)</option>
                      </select>
                      <button
                        type="button"
                        className={ui.button}
                        style={{ fontSize: "0.75rem" }}
                        onClick={() => {
                          const href = resolveLinkHref(String(node.props?.link));
                          window.open(href, "_blank");
                        }}
                      >
                        ↗ تست لینک
                      </button>
                    </div>
                  )}
                </div>
              )}

              {node.type === "section" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.82rem" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(node.props?.fixedHeader)}
                      onChange={(e) => onPatch(setProp("fixedHeader", e.target.checked ? true : undefined))}
                    />
                    هدر ثابت (Sticky Header)
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.82rem", color: "#38bdf8" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(node.props?.isSiteHeader)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        onPatch((prev) => {
                          const p = { ...(prev.props ?? {}) };
                          if (checked) {
                            p.isSiteHeader = true;
                            p.fixedHeader = true;
                          } else {
                            delete p.isSiteHeader;
                          }
                          return { ...prev, props: p };
                        });
                      }}
                    />
                    هدر اصلی سایت (Global Site Header)
                  </label>
                </div>
              )}
            </div>

            {/* DATA BINDINGS & LIVE TELEMETRY */}
            {node.type === "component" && spec && spec.inputs.length > 0 && (
              <div>
                <div className={styles.inspectorSectionTitle}>
                  <span>🔗 اتصال داده‌های زنده (LIVE TELEMETRY)</span>
                </div>
                {spec.inputs.map((input) => (
                  <BindingPicker
                    key={input.key}
                    projectId={projectId}
                    inputKey={input.key}
                    current={node.bindings?.[input.key]}
                    catalog={catalog}
                    values={values}
                    onChange={setBinding(input.key)}
                    onCreated={onBindingCreated}
                  />
                ))}
              </div>
            )}

            {/* Repeater settings */}
            {node.type === "repeater" && (
              <div>
                <div className={styles.inspectorSectionTitle}><span>تنظیمات تکرارکننده (REPEATER)</span></div>
                <label className={ui.field}>
                  <span className={ui.label}>منبع آرایه (binding)</span>
                  <select
                    className={ui.select}
                    value={node.repeater?.sourceBindingId ?? ""}
                    onChange={(e) => onPatch((n) => ({
                      ...n,
                      repeater: { sourceBindingId: e.target.value, itemAlias: n.repeater?.itemAlias || "item" },
                    }))}
                  >
                    <option value="">انتخاب بایندینگ آرایه…</option>
                    {catalog.bindings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </label>
                <label className={ui.field}>
                  <span className={ui.label}>نام آیتم (alias)</span>
                  <input
                    className={ui.input}
                    dir="ltr"
                    value={node.repeater?.itemAlias ?? "item"}
                    onChange={(e) => onPatch((n) => ({
                      ...n,
                      repeater: {
                        sourceBindingId: n.repeater?.sourceBindingId ?? "",
                        itemAlias: e.target.value || "item",
                      },
                    }))}
                  />
                </label>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: STYLE & VISUAL APPEARANCE */}
        {rightTab === "style" && (
          <div className={ui.form}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span className={styles.inspectorSubtitle}>حالت رنگی پیش‌نمایش:</span>
              <button
                type="button"
                className={styles.segmentedChoiceBtn}
                style={{ fontSize: "0.72rem", padding: "3px 10px", width: "auto" }}
                onClick={() => onAppearanceModeChange?.(appearanceMode === "night" ? "day" : "night")}
              >
                {appearanceMode === "night" ? "🌙 حالت شب" : "☀️ حالت روز"}
              </button>
            </div>

            {/* Block Style (Flat / Raised / Inset) */}
            <div>
              <div className={styles.inspectorSectionTitle}>
                <span>طرح کارت و پوسته (BLOCK STYLE)</span>
              </div>
              <div className={styles.segmentedChoiceGroup}>
                {(["flat", "raised", "inset"] as const).map((styleOption) => (
                  <button
                    key={styleOption}
                    type="button"
                    className={`${styles.segmentedChoiceBtn} ${
                      (node.style?.surface ?? "raised") === styleOption ? styles.segmentedChoiceBtnActive : ""
                    }`}
                    onClick={() => onPatch(setStyle("surface", styleOption))}
                  >
                    {styleOption === "flat" ? "تخت (Flat)" : styleOption === "raised" ? "برجسته (Raised)" : "فرورفته (Inset)"}
                  </button>
                ))}
              </div>
            </div>

            {/* Colors */}
            <div>
              <div className={styles.inspectorSectionTitle}>
                <span>رنگ‌بندی (COLOURS)</span>
              </div>
              <ColorField
                label="رنگ پس‌زمینه (Background)"
                value={node.style?.background ?? ""}
                onChange={(v) => onPatch(setStyle("background", v))}
              />
              <ColorField
                label="رنگ متن (Text Colour)"
                value={node.style?.color ?? ""}
                onChange={(v) => onPatch(setStyle("color", v))}
              />
              <ColorField
                label="رنگ کادر (Border Colour)"
                value={node.style?.borderColor ?? ""}
                onChange={(v) => onPatch(setStyle("borderColor", v))}
              />
            </div>

            {/* Spacing & Padding */}
            <div>
              <div className={styles.inspectorSectionTitle}>
                <span>فاصله‌گذاری و پدینگ (SPACING)</span>
              </div>
              <SpacingField
                label="Padding (همه طرف)"
                value={node.style?.padding}
                onChange={(v) => onPatch(setStyle("padding", v))}
              />
              <div className={ui.row}>
                <SpacingField
                  label="Padding افقی (X)"
                  value={node.style?.paddingX}
                  onChange={(v) => onPatch(setStyle("paddingX", v))}
                />
                <SpacingField
                  label="Padding عمودی (Y)"
                  value={node.style?.paddingY}
                  onChange={(v) => onPatch(setStyle("paddingY", v))}
                />
              </div>
              <SpacingField
                label="Margin (همه طرف)"
                value={node.style?.margin}
                onChange={(v) => onPatch(setStyle("margin", v))}
              />
            </div>

            {/* Column Span */}
            {node.type === "column" && (
              <div>
                <div className={styles.inspectorSectionTitle}>
                  <span>عرض ستون (COLUMN SPAN)</span>
                </div>
                <div className={styles.stepperRow}>
                  <span className={styles.stepperLabel}>تعداد ستون‌ها (از ۱۲)</span>
                  <div className={styles.stepperControls}>
                    <button
                      type="button"
                      className={styles.stepperBtn}
                      onClick={() => {
                        const cur = Number(node.style?.columnSpan ?? 12);
                        if (cur > 1) onPatch(setStyle("columnSpan", cur - 1));
                      }}
                    >
                      -
                    </button>
                    <span className={styles.stepperValue}>{String(node.style?.columnSpan ?? "۱۲")}</span>
                    <button
                      type="button"
                      className={styles.stepperBtn}
                      onClick={() => {
                        const cur = Number(node.style?.columnSpan ?? 12);
                        if (cur < 12) onPatch(setStyle("columnSpan", cur + 1));
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
