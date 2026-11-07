import { useEffect, useState } from "react";
import { http } from "../../shared/api/http";
import type { DataSource } from "../../shared/api/types";
import ui from "../../shared/ui/controls.module.css";
import { HierarchicalOptionList } from "./HierarchicalOptionList";

export type ApiOption = {
  value: string;
  label: string;
  /** Live JSON path — bind dynamically instead of static string. */
  fieldPath?: string;
  sampleValue?: unknown;
};
export type ApiOptionGroup = { value: string; label: string; options: ApiOption[] };
export type ApiOptionSet = {
  key: string;
  name: string;
  options: ApiOption[];
  groups?: ApiOptionGroup[];
};

interface Props {
  dataSources: DataSource[];
  /** Called with the selected option value (plain string for the prop). */
  onPick: (value: string) => void;
}

export function ApiOptionPicker({ dataSources, onPick }: Props) {
  const httpSources = dataSources.filter((d) => d.kind === "http_json");
  const [dataSourceId, setDataSourceId] = useState("");
  const [sets, setSets] = useState<ApiOptionSet[]>([]);
  const [setKey, setSetKey] = useState("");
  const [optionValue, setOptionValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dataSourceId) {
      setSets([]);
      setSetKey("");
      setOptionValue("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void http.get<{ items: ApiOptionSet[] }>(`/data-sources/${dataSourceId}/option-sets`)
      .then(({ data }) => {
        if (cancelled) return;
        setSets(data.items);
        setSetKey(data.items[0]?.key ?? "");
        setOptionValue("");
      })
      .catch(() => {
        if (cancelled) return;
        setSets([]);
        setError("خواندن آپشن‌های API ناموفق بود");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [dataSourceId]);

  const selectedSet = sets.find((s) => s.key === setKey);
  const options = selectedSet?.options ?? [];

  if (httpSources.length === 0) {
    return <div className={ui.hint}>برای انتخاب از API، یک منبع HTTP JSON با کوئری «آپشن‌ها» بسازید.</div>;
  }

  return (
    <details className={ui.form} style={{ marginTop: 6 }}>
      <summary className={ui.muted}>از API</summary>
      <div className={ui.form} style={{ marginTop: 8 }}>
        <select className={ui.select} value={dataSourceId} aria-label="منبع داده"
                onChange={(e) => setDataSourceId(e.target.value)}>
          <option value="">انتخاب منبع داده…</option>
          {httpSources.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select className={ui.select} value={setKey} disabled={!dataSourceId || loading || sets.length === 0}
                aria-label="مجموعه آپشن"
                onChange={(e) => { setSetKey(e.target.value); setOptionValue(""); }}>
          <option value="">{loading ? "در حال بارگذاری…" : (sets.length ? "انتخاب مجموعه…" : "مجموعه‌ای نیست")}</option>
          {sets.map((s) => (
            <option key={s.key} value={s.key}>{s.name} ({s.options.length})</option>
          ))}
        </select>
        {!setKey ? (
          <span className={ui.hint}>مجموعه را انتخاب کنید.</span>
        ) : (
          <HierarchicalOptionList
            key={setKey}
            groups={selectedSet?.groups}
            options={options}
            value={optionValue}
            onChange={setOptionValue}
            onApply={(v) => {
              const all = [...options, ...(selectedSet?.groups ?? []).flatMap((g) => g.options)];
              const picked = all.find((o) => o.value === v);
              const snap = picked?.sampleValue;
              onPick(snap !== undefined && snap !== null && typeof snap !== "object" ? String(snap) : v);
            }}
            disabled={!setKey}
            emptyHint="آیتمی نیست."
          />
        )}
        {optionValue && (
          <div className={ui.muted} dir="ltr" style={{ fontSize: 12 }}>انتخاب: {optionValue}</div>
        )}
        {error && <div className={ui.alert}>{error}</div>}
        <button type="button" className={ui.button} disabled={!optionValue}
                onClick={() => {
                  const all = [...options, ...(selectedSet?.groups ?? []).flatMap((g) => g.options)];
                  const picked = all.find((o) => o.value === optionValue);
                  const snap = picked?.sampleValue;
                  onPick(snap !== undefined && snap !== null && typeof snap !== "object" ? String(snap) : optionValue);
                }}>
          اعمال روی prop
        </button>
      </div>
    </details>
  );
}
