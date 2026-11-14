import type { BindingRef, BindingValue, ComponentSpec, DataBinding, DataSource, DocNode, PropertySpec, ProblemError, StyleBlock, StyleValue } from "../../shared/api/types";
import { localize } from "../../shared/i18n";
import ui from "../../shared/ui/controls.module.css";
import { ApiOptionPicker } from "./ApiOptionPicker";
import { BindingConfigPanel } from "./BindingConfigPanel";
import { BindingPicker } from "./BindingPicker";
import styles from "./Editor.module.css";
import type { EditorCatalog } from "./useEditorData";
import { patchPartStyle, type AppearanceMode } from "../../shared/style-engine/parts";
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
}

export function Inspector({ node, spec, projectId, catalog, values, errors, onPatch, onBindingCreated, appearanceMode = "night", onAppearanceModeChange }: Props) {
  if (!node) return <div className={styles.panel}><div className={ui.muted}>یک عنصر را انتخاب کنید.</div></div>;
  const setBinding = (key: string) => (ref: BindingRef | undefined) =>
    onPatch((n) => {
      const bindings = { ...(n.bindings ?? {}) };
      if (ref) bindings[key] = ref;
      else delete bindings[key];
      return { ...n, bindings };
    });

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelTitle}>
          <span>تنظیمات عنصر:</span>
          <strong>{node.type}</strong>
        </div>
        <code className={styles.pagePath}>{node.id}</code>
      </div>
      {errors.length > 0 && (
        <div className={ui.alert} role="alert">{errors.map((e) => <div key={e.pointer + e.code}>{e.message} <code>{e.code}</code></div>)}</div>
      )}
      <div className={ui.form}>
        <div className={ui.info} style={{ fontSize: "0.78rem" }}>
          💡 برای ویرایش مستقیم رنگ، فونت و قاب، ابزار <strong>مداد</strong> را از نوار بالا فعال کرده و روی عنصر کلیک کنید.
        </div>
        {(node.type === "root" || node.type === "section" || node.type === "container") && (
          <div className={ui.card} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className={styles.panelTitle}>
              <span>🎨 رنگ‌های وابسته به تم ({node.type === "root" ? "ریشه" : node.type})</span>
            </div>
            <div className={ui.row} style={{ justifyContent: "space-between", alignItems: "center" }}>
              <span className={ui.label}>تم فعال:</span>
              <div className={styles.toolGroup}>
                <button
                  type="button"
                  className={`${ui.button} ${appearanceMode === "night" ? ui.primary : ""}`}
                  style={{ padding: "3px 10px", fontSize: "0.76rem" }}
                  onClick={() => onAppearanceModeChange?.("night")}
                  title="تنظیم رنگ‌ها در حالت شب"
                >
                  🌙 تم شب
                </button>
                <button
                  type="button"
                  className={`${ui.button} ${appearanceMode === "day" ? ui.primary : ""}`}
                  style={{ padding: "3px 10px", fontSize: "0.76rem" }}
                  onClick={() => onAppearanceModeChange?.("day")}
                  title="تنظیم رنگ‌ها در حالت روز"
                >
                  ☀️ تم روز
                </button>
              </div>
            </div>

            <ColorField
              label={`رنگ پس‌زمینه (${appearanceMode === "day" ? "حالت روز" : "حالت شب"})`}
              value={(appearanceMode === "day" ? node.partStylesDay?.box?.background : node.partStyles?.box?.background) ?? ""}
              onChange={(val) => onPatch((n) => patchPartStyle(n, "box", "background", val as StyleValue | undefined, appearanceMode))}
            />
            <div className={ui.row} style={{ gap: 4, marginTop: -4 }}>
              <span className={ui.hint} style={{ width: "100%", marginBottom: 1 }}>پیشنهاد پس‌زمینه:</span>
              {(appearanceMode === "day"
                ? ["#f0f3f7", "#ffffff", "#f8fafc", "#e8edf5", "transparent"]
                : ["#0f1419", "#121820", "#18202a", "#1a2433", "transparent"]
              ).map((hex) => (
                <button
                  key={hex}
                  type="button"
                  className={ui.button}
                  style={{
                    padding: "2px 7px",
                    fontSize: "0.7rem",
                    background: hex === "transparent" ? "transparent" : hex,
                    color: appearanceMode === "day" && hex !== "transparent" ? "#1f2328" : "#e6edf3",
                    border: "1px solid rgba(128,128,128,0.3)",
                  }}
                  onClick={() => onPatch((n) => patchPartStyle(n, "box", "background", hex === "transparent" ? "transparent" : hex, appearanceMode))}
                >
                  {hex === "transparent" ? "شفاف" : hex}
                </button>
              ))}
            </div>

            <ColorField
              label={`رنگ متون (${appearanceMode === "day" ? "حالت روز" : "حالت شب"})`}
              value={(appearanceMode === "day" ? node.partStylesDay?.box?.color : node.partStyles?.box?.color) ?? ""}
              onChange={(val) => onPatch((n) => patchPartStyle(n, "box", "color", val as StyleValue | undefined, appearanceMode))}
            />
            <div className={ui.row} style={{ gap: 4, marginTop: -4 }}>
              <span className={ui.hint} style={{ width: "100%", marginBottom: 1 }}>پیشنهاد رنگ متن:</span>
              {(appearanceMode === "day"
                ? ["#1f2328", "#0f172a", "#334155", "#64748b"]
                : ["#e6edf3", "#ffffff", "#cbd5e1", "#8b98a5"]
              ).map((hex) => (
                <button
                  key={hex}
                  type="button"
                  className={ui.button}
                  style={{
                    padding: "2px 7px",
                    fontSize: "0.7rem",
                    border: "1px solid rgba(128,128,128,0.3)",
                  }}
                  onClick={() => onPatch((n) => patchPartStyle(n, "box", "color", hex, appearanceMode))}
                >
                  <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: hex, marginInlineEnd: 4 }} />
                  {hex}
                </button>
              ))}
            </div>

            {Boolean(
              appearanceMode === "day"
                ? node.partStylesDay?.box?.background || node.partStylesDay?.box?.color
                : node.partStyles?.box?.background || node.partStyles?.box?.color
            ) && (
              <button
                type="button"
                className={ui.button}
                style={{ fontSize: "0.75rem", alignSelf: "flex-start", marginTop: 4 }}
                onClick={() => {
                  onPatch((n) => {
                    const u1 = patchPartStyle(n, "box", "background", undefined, appearanceMode);
                    return patchPartStyle(u1, "box", "color", undefined, appearanceMode);
                  });
                }}
              >
                ↺ بازنشانی رنگ‌های این تم به پیش‌فرض
              </button>
            )}
          </div>
        )}
        
        {node.type === "section" && (
          <div style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 8,
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}>
            <div className={styles.panelTitle} style={{ margin: 0, color: "#38bdf8" }}>
              📌 تنظیمات هدر صفحه و سایت (Header Settings)
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={Boolean(node.props?.fixedHeader)}
                onChange={(e) => onPatch(setProp("fixedHeader", e.target.checked ? true : undefined))}
              />
              ثابت‌سازی در بالای صفحه (Sticky Header)
            </label>
            <div className={ui.hint} style={{ margin: 0 }}>
              این بخش با اسکرول کردن صفحه در بالاترین نقطه ثابت (Sticky) می‌ماند و سایر بخش‌های داینامیک زیر آن اسکرول می‌شوند.
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: "0.85rem", fontWeight: 600, marginTop: 4, color: "#a855f7" }}>
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
              استفاده به عنوان هدر رسمی سایت (Global Site Header)
            </label>
            <div className={ui.hint} style={{ margin: 0 }}>
              با فعال کردن این گزینه، این سکشن به عنوان هدر اصلی سایت عمل کرده و هدر پیش‌فرض سایت به صورت خودکار با طراحی شما جایگزین می‌شود.
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: "0.85rem", fontWeight: 600, marginTop: 4, color: "#10b981" }}>
              <input
                type="checkbox"
                checked={Boolean(node.props?.sharedHeader)}
                onChange={(e) => {
                  const checked = e.target.checked;
                  onPatch((prev) => {
                    const p = { ...(prev.props ?? {}) };
                    if (checked) {
                      p.sharedHeader = true;
                      p.fixedHeader = true;
                      p.isSiteHeader = true;
                    } else {
                      delete p.sharedHeader;
                    }
                    return { ...prev, props: p };
                  });
                }}
              />
              اشتراک‌گذاری در تمام صفحات پروژه (Share Across Project)
            </label>
            <div className={ui.hint} style={{ margin: 0 }}>
              با فعال‌سازی این گزینه، این هدر به عنوان هدر ثابت و مشترک پروژه شناخته شده و روی تمامی صفحات دیگر نیز در بالاترین نقطه نمایش داده می‌شود.
            </div>
          </div>
        )}
        {(node.type === "heading" || node.type === "text") && (
          <>
            <label className={ui.field}><span className={ui.label}>متن</span>
              <LocalizedInput value={node.props?.text} onChange={(v) => onPatch(setProp("text", v))} />
            </label>
            {node.type === "heading" && (
              <label className={ui.field}><span className={ui.label}>سطح</span>
                <select className={ui.select} value={String(node.props?.level ?? 2)} onChange={(e) => onPatch(setProp("level", Number(e.target.value)))}>
                  {[1, 2, 3, 4, 5, 6].map((l) => <option key={l} value={l}>H{l}</option>)}
                </select>
              </label>
            )}

            <div style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: 8,
              padding: "12px 14px",
              marginTop: 8,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}>
              <div className={styles.panelTitle} style={{ margin: 0, color: "#38bdf8" }}>
                🔘 دکمه، پیوند و ناوبری (Button & Link)
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={Boolean(node.props?.asButton)}
                  onChange={(e) => onPatch(setProp("asButton", e.target.checked ? true : undefined))}
                />
                نمایش به‌صورت دکمه تعاملی (Button Style)
              </label>

              {Boolean(node.props?.asButton) && (
                <label className={ui.field}>
                  <span className={ui.label}>طرح دکمه (Button Variant)</span>
                  <select
                    className={ui.select}
                    value={String(node.props?.buttonVariant ?? "primary")}
                    onChange={(e) => onPatch(setProp("buttonVariant", e.target.value))}
                  >
                    <option value="primary">شاخص فیروزه‌ای (Primary Gradient)</option>
                    <option value="secondary">شیشه‌ای تیره (Secondary Glass)</option>
                    <option value="outline">خط دور باریک (Outline)</option>
                    <option value="danger">قرمز هشداری (Danger)</option>
                  </select>
                </label>
              )}

              <div className={ui.field}>
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
                <>
                  <label className={ui.field}>
                    <span className={ui.label}>نحوه باز شدن پیوند</span>
                    <select
                      className={ui.select}
                      value={String(node.props?.linkTarget ?? "_self")}
                      onChange={(e) => onPatch(setProp("linkTarget", e.target.value))}
                    >
                      <option value="_self">در همین صفحه (Same Page - _self)</option>
                      <option value="_blank">در صفحه / تب جدید (New Tab - _blank)</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className={ui.button}
                    style={{ fontSize: "0.8rem", alignSelf: "flex-start", gap: 6 }}
                    onClick={() => {
                      const href = resolveLinkHref(String(node.props?.link));
                      window.open(href, "_blank");
                    }}
                  >
                    ↗ تست باز کردن در تب جدید
                  </button>
                </>
              )}
            </div>
          </>
        )}
        {node.type === "column" && (
          <label className={ui.field}><span className={ui.label}>عرض ستون (از ۱۲)</span>
            <input className={ui.input} type="number" min={1} max={12} value={String(node.style?.columnSpan ?? "")} placeholder="خودکار"
                   onChange={(e) => onPatch(setStyle("columnSpan",
                     e.target.value ? Math.max(1, Math.min(12, Number(e.target.value))) : undefined))} />
          </label>
        )}
        {node.type === "component" && spec && (
          <>
            <div className={ui.muted}>{spec.key}@{spec.version}</div>
            {spec.properties.map((p) => (
              <PropertyField key={p.key} spec={p} value={node.props?.[p.key]} fallback={spec.defaults[p.key]}
                             dataSources={catalog.dataSources} projectId={projectId}
                             onBindingCreated={onBindingCreated}
                             onDynamicBind={(bindingId) => setBinding(p.key)({ bindingId })}
                             onChange={(v) => onPatch(setProp(p.key, v))} />
            ))}
            <div className={styles.panelTitle}>🔗 اتصال داده‌های زنده (Live Telemetry)</div>
            {spec.inputs.map((input) => (
              <BindingPicker key={input.key} projectId={projectId} inputKey={input.key} current={node.bindings?.[input.key]}
                             catalog={catalog} values={values} onChange={setBinding(input.key)} onCreated={onBindingCreated} />
            ))}
          </>
        )}
        {node.type === "component" && !spec && <div className={ui.alert}>این نسخه از کامپوننت در این پروژه در دسترس نیست.</div>}

        <div className={styles.panelTitle}>📐 فاصله‌گذاری و حاشیه‌ها (Padding / Margin)</div>
        <div className={ui.hint}>عدد = پیکسل. یا واحد CSS مثل 12px / 1rem / 8px 16px</div>
        <SpacingField
          label="Padding (همه طرف)"
          value={node.style?.padding}
          onChange={(v) => onPatch(setStyle("padding", v))}
        />
        <div className={ui.row}>
          <SpacingField
            label="Padding افقی"
            value={node.style?.paddingX}
            onChange={(v) => onPatch(setStyle("paddingX", v))}
          />
          <SpacingField
            label="Padding عمودی"
            value={node.style?.paddingY}
            onChange={(v) => onPatch(setStyle("paddingY", v))}
          />
        </div>
        <SpacingField
          label="Margin (همه طرف)"
          value={node.style?.margin}
          onChange={(v) => onPatch(setStyle("margin", v))}
        />
        <div className={ui.row}>
          <SpacingField
            label="Margin افقی"
            value={node.style?.marginX}
            onChange={(v) => onPatch(setStyle("marginX", v))}
          />
          <SpacingField
            label="Margin عمودی"
            value={node.style?.marginY}
            onChange={(v) => onPatch(setStyle("marginY", v))}
          />
        </div>

        {node.type === "repeater" && (
          <div className={ui.form}>
            <div className={styles.panelTitle}>Repeater</div>
            <label className={ui.field}>
              <span className={ui.label}>منبع آرایه (binding)</span>
              <select className={ui.select} value={node.repeater?.sourceBindingId ?? ""}
                      onChange={(e) => onPatch((n) => ({
                        ...n,
                        repeater: { sourceBindingId: e.target.value, itemAlias: n.repeater?.itemAlias || "item" },
                      }))}>
                <option value="">انتخاب بایندینگ آرایه…</option>
                {catalog.bindings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label className={ui.field}>
              <span className={ui.label}>نام آیتم (alias)</span>
              <input className={ui.input} dir="ltr" value={node.repeater?.itemAlias ?? "item"}
                     onChange={(e) => onPatch((n) => ({
                       ...n,
                       repeater: {
                         sourceBindingId: n.repeater?.sourceBindingId ?? "",
                         itemAlias: e.target.value || "item",
                       },
                     }))} />
            </label>
            <div className={ui.hint}>فرزندان این گره برای هر عنصر آرایه تکرار می‌شوند. فیلدها را با Data Explorer به مسیرهایی مثل item.name وصل کنید.</div>
          </div>
        )}
      </div>
    </div>
  );
}
