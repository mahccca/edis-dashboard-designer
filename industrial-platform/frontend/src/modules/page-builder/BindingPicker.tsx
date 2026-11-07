import { useMemo, useState } from "react";
import { ApiError, http } from "../../shared/api/http";
import type { BindingRef, BindingValue, DataBinding } from "../../shared/api/types";
import { localize } from "../../shared/i18n";
import { TestDataBadge } from "../../shared/ui/TestDataBadge";
import ui from "../../shared/ui/controls.module.css";
import { BindingConfigPanel } from "./BindingConfigPanel";
import type { EditorCatalog } from "./useEditorData";

const SAME_QUANTITY: Record<string, string[]> = {
  W: ["W", "kW", "MW"], kW: ["W", "kW", "MW"], MW: ["W", "kW", "MW"],
  Wh: ["Wh", "kWh", "MWh"], kWh: ["Wh", "kWh", "MWh"], MWh: ["Wh", "kWh", "MWh"],
};

function formatBoundValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

interface Props {
  projectId: string;
  inputKey: string;
  current: BindingRef | undefined;
  catalog: EditorCatalog;
  values: Record<string, BindingValue>;
  onChange: (ref: BindingRef | undefined) => void;
  onCreated: (binding: DataBinding) => Promise<void> | void;
}

export function BindingPicker({ projectId, inputKey, current, catalog, values, onChange, onCreated }: Props) {
  const [objectId, setObjectId] = useState("");
  const [variable, setVariable] = useState("");
  const [toUnit, setToUnit] = useState("");
  const [decimals, setDecimals] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const bound = catalog.bindings.find((b) => b.id === current?.bindingId);
  const value = current ? values[current.bindingId] : undefined;
  const object = catalog.objects.find((o) => o.id === objectId);
  const type = object && catalog.objectTypes.find((t) => t.id === object.typeId && t.version === object.typeVersion);
  const variables = useMemo(
    () => (type?.variables ?? []).filter((v) => v.dataType === "number" || v.dataType === "integer"),
    [type],
  );
  const unitOptions = SAME_QUANTITY[variables.find((v) => v.key === variable)?.unit ?? ""] ?? [];

  const create = async () => {
    setError(null);
    const name = `${object?.key ?? "object"}.${variable}`;
    try {
      const { data } = await http.post<DataBinding>(`/projects/${projectId}/data-bindings`, {
        body: {
          name,
          source: { kind: "object_variable", objectId, variable },
          transform: { ...(toUnit ? { toUnit } : {}), decimals },
          delivery: { mode: "live", staleAfterMs: 60000 },
        },
      });
      await onCreated(data);
      onChange({ bindingId: data.id });
      setObjectId("");
      setVariable("");
    } catch (e) {
      setError(e instanceof ApiError ? (e.problem.errors?.map((x) => x.message).join("; ") || e.message) : "ساخت اتصال ناموفق بود");
    }
  };

  const missingRequired = inputKey === "value" && !current?.bindingId;

  return (
    <div className={ui.form} data-binding-input={inputKey}>
      <div className={ui.row} style={{ justifyContent: "space-between" }}>
        <strong>{inputKey}{missingRequired ? " *" : ""}</strong>
        {value?.isTestData && <TestDataBadge />}
      </div>
      {missingRequired && (
        <div className={ui.hint}>برای انتشار باید اتصال داده انتخاب شود؛ ذخیرهٔ پیش‌نویس بدون آن مجاز است.</div>
      )}
      <select className={ui.select} value={current?.bindingId ?? ""} aria-label={`اتصال داده برای ${inputKey}`}
              onChange={(e) => onChange(e.target.value ? { bindingId: e.target.value } : undefined)}>
        <option value="">— بدون اتصال —</option>
        {catalog.bindings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      {bound && (
        <div className={ui.muted} style={{ wordBreak: "break-word" }}>
          {value
            ? `${formatBoundValue(value.value)}${value.unit ? ` ${value.unit}` : ""} · ${value.quality} · ${value.dataOrigin}`
            : "…"}
        </div>
      )}

      <BindingConfigPanel
        projectId={projectId}
        dataSources={catalog.dataSources}
        onCreated={async (b) => {
          await onCreated(b);
          onChange({ bindingId: b.id });
        }}
      />

      <details>
        <summary className={ui.muted}>اتصال از متغیر شیء</summary>
        <div className={ui.form} style={{ marginTop: 8 }}>
          <select className={ui.select} value={objectId} onChange={(e) => { setObjectId(e.target.value); setVariable(""); setToUnit(""); }}>
            <option value="">انتخاب شیء…</option>
            {catalog.objects.map((o) => <option key={o.id} value={o.id}>{o.key} — {localize(o.name, "fa")}</option>)}
          </select>
          <select className={ui.select} value={variable} disabled={!type} onChange={(e) => { setVariable(e.target.value); setToUnit(""); }}>
            <option value="">انتخاب متغیر…</option>
            {variables.map((v) => <option key={v.key} value={v.key}>{v.key} ({v.unit ?? ""}) — {localize(v.name, "fa")}</option>)}
          </select>
          <div className={ui.row}>
            <select className={ui.select} value={toUnit} disabled={!unitOptions.length} onChange={(e) => setToUnit(e.target.value)} aria-label="واحد نمایش">
              <option value="">واحد خود متغیر</option>
              {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <input className={ui.input} type="number" min={0} max={6} value={decimals} aria-label="تعداد رقم اعشار"
                   onChange={(e) => setDecimals(Math.max(0, Math.min(6, Number(e.target.value))))} style={{ width: 80 }} />
          </div>
          {error && <div className={ui.alert}>{error}</div>}
          <button className={ui.button} disabled={!objectId || !variable} onClick={() => void create()}>ساخت و اتصال</button>
        </div>
      </details>
    </div>
  );
}
