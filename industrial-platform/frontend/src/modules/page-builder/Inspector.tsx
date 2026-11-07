import type { BindingRef, BindingValue, ComponentSpec, DataBinding, DataSource, DocNode, PropertySpec, ProblemError, StyleBlock } from "../../shared/api/types";
import { localize } from "../../shared/i18n";
import ui from "../../shared/ui/controls.module.css";
import { ApiOptionPicker } from "./ApiOptionPicker";
import { BindingConfigPanel } from "./BindingConfigPanel";
import { BindingPicker } from "./BindingPicker";
import styles from "./Editor.module.css";
import type { EditorCatalog } from "./useEditorData";

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
    <div className={ui.field}>
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
    </div>
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
}

export function Inspector({ node, spec, projectId, catalog, values, errors, onPatch, onBindingCreated }: Props) {
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
      <div className={styles.panelTitle}>{node.type} <code>{node.id}</code></div>
      {errors.length > 0 && (
        <div className={ui.alert} role="alert">{errors.map((e) => <div key={e.pointer + e.code}>{e.message} <code>{e.code}</code></div>)}</div>
      )}
      <div className={ui.form}>
        <div className={ui.hint}>برای تغییر رنگ و فونت، ابزار مداد را از نوار بالا بزنید و روی همان ناحیه روی بوم کلیک کنید.</div>
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
                             onDynamicBind={(bindingId) => onPatch(setBinding(p.key)({ bindingId }))}
                             onChange={(v) => onPatch(setProp(p.key, v))} />
            ))}
            <div className={styles.panelTitle}>اتصال داده</div>
            {spec.inputs.map((input) => (
              <BindingPicker key={input.key} projectId={projectId} inputKey={input.key} current={node.bindings?.[input.key]}
                             catalog={catalog} values={values} onChange={setBinding(input.key)} onCreated={onBindingCreated} />
            ))}
          </>
        )}
        {node.type === "component" && !spec && <div className={ui.alert}>این نسخه از کامپوننت در این پروژه در دسترس نیست.</div>}

        <div className={styles.panelTitle}>فاصله‌گذاری (padding / margin)</div>
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
