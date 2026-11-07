import { useEffect, useState } from "react";
import { ApiError, http } from "../../shared/api/http";
import type { DataBinding, DataSource } from "../../shared/api/types";
import type { FieldSelection, SchemaLatest } from "../../shared/binding/types";
import { concreteBindPath, samplePreview } from "../../shared/binding/paths";
import ui from "../../shared/ui/controls.module.css";
import type { ApiOptionSet } from "./ApiOptionPicker";
import styles from "./BindingExplorer.module.css";
import { DataExplorer } from "./DataExplorer";
import { HierarchicalOptionList } from "./HierarchicalOptionList";

type Mode = "static" | "dynamic";
type BrowseTab = "quick" | "json";

interface Props {
  projectId: string;
  dataSources: DataSource[];
  mode?: Mode;
  staticValue?: string;
  onModeChange?: (m: Mode) => void;
  onStaticChange?: (v: string) => void;
  onCreated: (binding: DataBinding) => Promise<void> | void;
  onApplied?: (bindingId: string) => void;
  title?: string;
}

function loadLatestSchema(dataSourceId: string, queryKey: string) {
  return http.get<SchemaLatest>(`/data-sources/${dataSourceId}/schema/latest`, {
    query: { queryKey },
  });
}

export function BindingConfigPanel({
  projectId, dataSources, mode: modeProp, staticValue, onModeChange, onStaticChange,
  onCreated, onApplied, title = "اتصال از API",
}: Props) {
  const [mode, setMode] = useState<Mode>(modeProp ?? "dynamic");
  const [tab, setTab] = useState<BrowseTab>("quick");
  const [dataSourceId, setDataSourceId] = useState("");
  const [queryKey, setQueryKey] = useState("");
  const [queries, setQueries] = useState<Array<{
    key: string; name?: string; resultMode?: string; refreshIntervalMs?: number;
  }>>([]);
  const [optionSets, setOptionSets] = useState<ApiOptionSet[]>([]);
  const [optionSetKey, setOptionSetKey] = useState("");
  const [optionValue, setOptionValue] = useState("");
  const [schema, setSchema] = useState<SchemaLatest | null>(null);
  const [sample, setSample] = useState<unknown>(undefined);
  const [selection, setSelection] = useState<FieldSelection | null>(null);
  const [defaultValue, setDefaultValue] = useState("");
  const [format, setFormat] = useState("none");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedOptionSet = optionSets.find((s) => s.key === optionSetKey);
  const selectedQuery = queries.find((q) => q.key === queryKey);
  const jsonQueries = queries.filter((q) => q.resultMode === "json");

  const staleAfterForQuery = (signalKey: string) => {
    const q = queries.find((x) => x.key === signalKey);
    const refresh = typeof q?.refreshIntervalMs === "number" ? q.refreshIntervalMs : 5000;
    return Math.max(60_000, refresh * 2);
  };

  useEffect(() => {
    if (modeProp) setMode(modeProp);
  }, [modeProp]);

  useEffect(() => {
    const ds = dataSources.find((d) => d.id === dataSourceId);
    const qs = Array.isArray(ds?.config?.queries)
      ? (ds!.config!.queries as Array<{
        key: string; name?: string; resultMode?: string; refreshIntervalMs?: number;
      }>)
      : [];
    setQueries(qs);
    const preferred = qs.find((q) => q.resultMode === "json")?.key ?? qs[0]?.key ?? "";
    setQueryKey(preferred);
    setSchema(null);
    setSample(undefined);
    setSelection(null);
    setOptionSets([]);
    setOptionSetKey("");
    setOptionValue("");
    if (!dataSourceId) return;
    let cancelled = false;
    void http.get<{ items: ApiOptionSet[] }>(`/data-sources/${dataSourceId}/option-sets`)
      .then(({ data }) => {
        if (cancelled) return;
        setOptionSets(data.items);
        setOptionSetKey(data.items[0]?.key ?? "");
        if (data.items.length === 0) setTab("json");
      })
      .catch(() => { if (!cancelled) setOptionSets([]); });
    return () => { cancelled = true; };
  }, [dataSourceId, dataSources]);

  useEffect(() => {
    if (!dataSourceId || !queryKey || tab !== "json") return;
    let cancelled = false;
    void loadLatestSchema(dataSourceId, queryKey)
      .then(({ data }) => {
        if (cancelled) return;
        setSchema(data);
        if (data.sample !== undefined) setSample(data.sample);
      })
      .catch(() => { if (!cancelled) setSchema(null); });
    return () => { cancelled = true; };
  }, [dataSourceId, queryKey, tab]);

  const discover = async () => {
    if (!dataSourceId || !queryKey) return;
    setBusy(true);
    setError(null);
    try {
      const { data: exec } = await http.post<{
        ok: boolean;
        message?: string;
        body?: unknown;
        schema?: SchemaLatest | null;
      }>(`/data-sources/${dataSourceId}/execute`, {
        body: { queryKey, discover: true },
      });
      if (!exec.ok) {
        setError(exec.message || "اجرای API ناموفق بود");
        return;
      }
      if (exec.body !== undefined) setSample(exec.body);
      const opt = await http.get<{ items: ApiOptionSet[] }>(`/data-sources/${dataSourceId}/option-sets`);
      setOptionSets(opt.data.items);
      if (!optionSetKey && opt.data.items[0]) setOptionSetKey(opt.data.items[0].key);
      if (exec.schema) {
        setSchema(exec.schema);
        if (exec.schema.sample !== undefined) setSample(exec.schema.sample);
        return;
      }
      const { data } = await loadLatestSchema(dataSourceId, queryKey);
      setSchema(data);
      if (data.sample !== undefined) setSample(data.sample);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "بارگذاری JSON ناموفق بود");
    } finally {
      setBusy(false);
    }
  };

  const applyOption = async (value = optionValue) => {
    if (!dataSourceId || !value) return;
    setBusy(true);
    setError(null);
    setOptionValue(value);
    const ds = dataSources.find((d) => d.id === dataSourceId);
    const flat = selectedOptionSet?.options ?? [];
    const nested = (selectedOptionSet?.groups ?? []).flatMap((g) => g.options);
    const picked = [...flat, ...nested].find((o) => o.value === value);
    const label = picked?.label || value;
    const fieldPath = picked?.fieldPath;
    const jsonSignal = queries.find((q) => q.resultMode === "json")?.key;
    const name = `${ds?.name ?? "api"}:${selectedOptionSet?.name ?? "option"}:${label}`.slice(0, 120);
    try {
      const body = fieldPath && jsonSignal
        ? {
            name,
            source: {
              kind: "data_source_signal" as const,
              dataSourceId,
              signal: jsonSignal,
              fieldPath,
            },
            delivery: { mode: "live" as const, staleAfterMs: staleAfterForQuery(jsonSignal) },
          }
        : {
            name,
            source: { kind: "static" as const, value },
            delivery: { mode: "on_load" as const, staleAfterMs: 60000 },
          };
      const { data } = await http.post<DataBinding>(`/projects/${projectId}/data-bindings`, { body });
      await onCreated(data);
      onApplied?.(data.id);
    } catch (e) {
      setError(e instanceof ApiError ? (e.problem.errors?.map((x) => x.message).join("; ") || e.message) : "اعمال آپشن ناموفق");
    } finally {
      setBusy(false);
    }
  };

  const applyDynamic = async () => {
    if (!dataSourceId || !queryKey || !selection) return;
    setBusy(true);
    setError(null);
    const ds = dataSources.find((d) => d.id === dataSourceId);
    const bindSignal = selectedQuery?.resultMode === "options"
      ? (queries.find((q) => q.resultMode === "json")?.key || queryKey)
      : queryKey;
    const fieldPath = concreteBindPath(selection.path, selection.type);
    const name = `${ds?.name ?? "api"}:${bindSignal}:${fieldPath}`.slice(0, 120);
    const leafNumeric = selection.type === "number" || selection.type === "integer";
    const effectiveFormat = leafNumeric && format === "string" ? "none" : format;
    try {
      const { data } = await http.post<DataBinding>(`/projects/${projectId}/data-bindings`, {
        body: {
          name,
          source: {
            kind: "data_source_signal",
            dataSourceId,
            signal: bindSignal,
            fieldPath,
          },
          ...(defaultValue !== ""
            ? {
                defaultValue: leafNumeric && defaultValue.trim() !== "" && Number.isFinite(Number(defaultValue))
                  ? Number(defaultValue)
                  : defaultValue,
              }
            : {}),
          transform: effectiveFormat !== "none" ? { format: effectiveFormat } : {},
          delivery: { mode: "live", staleAfterMs: staleAfterForQuery(bindSignal) },
        },
      });
      await onCreated(data);
      onApplied?.(data.id);
    } catch (e) {
      setError(e instanceof ApiError ? (e.problem.errors?.map((x) => x.message).join("; ") || e.message) : "ساخت بایندینگ ناموفق");
    } finally {
      setBusy(false);
    }
  };

  const httpSources = dataSources.filter((d) => d.kind === "http_json");

  return (
    <div className={`${ui.form} ${styles.shell}`}>
      <strong>{title}</strong>
      <div className={styles.tabs}>
        <button type="button" className={`${styles.tab}${mode === "static" ? ` ${styles.tabActive}` : ""}`}
                onClick={() => { setMode("static"); onModeChange?.("static"); }}>ثابت</button>
        <button type="button" className={`${styles.tab}${mode === "dynamic" ? ` ${styles.tabActive}` : ""}`}
                onClick={() => { setMode("dynamic"); onModeChange?.("dynamic"); }}>از API</button>
      </div>

      {mode === "static" ? (
        <label className={ui.field}>
          <span className={ui.label}>مقدار ثابت</span>
          <input className={ui.input} value={staticValue ?? ""} onChange={(e) => onStaticChange?.(e.target.value)} />
        </label>
      ) : (
        <>
          <select className={ui.select} value={dataSourceId} onChange={(e) => setDataSourceId(e.target.value)}
                  aria-label="منبع داده">
            <option value="">منبع داده…</option>
            {httpSources.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>

          {dataSourceId && (
            <>
              <div className={styles.tabs} role="tablist">
                <button type="button" role="tab" className={`${styles.tab}${tab === "quick" ? ` ${styles.tabActive}` : ""}`}
                        onClick={() => setTab("quick")}>انتخاب سریع</button>
                <button type="button" role="tab" className={`${styles.tab}${tab === "json" ? ` ${styles.tabActive}` : ""}`}
                        onClick={() => setTab("json")}>مرور JSON</button>
              </div>

              {tab === "quick" && (
                <div className={styles.panel}>
                  {optionSets.length === 0 ? (
                    <div className={styles.empty}>
                      آپشن آماده‌ای نیست. از تب «مرور JSON» استفاده کنید یا در منابع داده کوئری آپشن بسازید.
                    </div>
                  ) : (
                    <>
                      <select className={ui.select} value={optionSetKey}
                              onChange={(e) => { setOptionSetKey(e.target.value); setOptionValue(""); }}>
                        {optionSets.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.name}
                            {s.groups && s.groups.length > 1 ? ` · ${s.groups.length} گروه` : ` · ${s.options.length}`}
                          </option>
                        ))}
                      </select>
                      <HierarchicalOptionList
                        key={optionSetKey}
                        groups={selectedOptionSet?.groups}
                        options={selectedOptionSet?.options ?? []}
                        value={optionValue}
                        onChange={setOptionValue}
                        onApply={(v) => { void applyOption(v); }}
                        disabled={busy}
                        emptyHint="آیتمی نیست — در تب JSON بارگذاری کنید."
                      />
                      <button type="button" className={`${ui.button} ${ui.primary}`}
                              disabled={!optionValue || busy} onClick={() => void applyOption()}>
                        اعمال انتخاب
                      </button>
                    </>
                  )}
                </div>
              )}

              {tab === "json" && (
                <div className={styles.panel}>
                  <div className={styles.toolbar}>
                    <select className={ui.select} value={queryKey} style={{ flex: 1 }}
                            onChange={(e) => { setQueryKey(e.target.value); setSelection(null); }}>
                      {(jsonQueries.length ? jsonQueries : queries).map((q) => (
                        <option key={q.key} value={q.key}>{q.name || q.key}</option>
                      ))}
                    </select>
                    <button type="button" className={ui.button} disabled={!queryKey || busy}
                            onClick={() => void discover()}>
                      {busy ? "…" : "بارگذاری"}
                    </button>
                  </div>

                  {(schema || sample !== undefined) && (
                    <DataExplorer
                      apiId={dataSourceId}
                      queryKey={queryKey}
                      paths={schema?.paths ?? []}
                      sample={sample ?? schema?.sample}
                      selectedPath={selection?.path}
                      onSelect={setSelection}
                    />
                  )}

                  {selection && (
                    <div className={styles.selectionBar}>
                      <div className={styles.selectionPath}>{concreteBindPath(selection.path, selection.type)}</div>
                      <div className={styles.selectionMeta}>
                        {selection.type}
                        {selection.sampleValue !== undefined
                          ? ` · ${samplePreview(selection.sampleValue, 72)}`
                          : ""}
                      </div>
                      <button type="button" className={`${ui.button} ${ui.primary}`} disabled={busy}
                              onClick={() => void applyDynamic()}>
                        اتصال این فیلد
                      </button>
                    </div>
                  )}

                  <details className={styles.advanced}>
                    <summary>تنظیمات بیشتر</summary>
                    <div className={styles.panel} style={{ marginTop: 8 }}>
                      <label className={ui.field}>
                        <span className={ui.label}>مقدار پیش‌فرض</span>
                        <input className={ui.input} value={defaultValue} onChange={(e) => setDefaultValue(e.target.value)} />
                      </label>
                      <label className={ui.field}>
                        <span className={ui.label}>قالب نمایش</span>
                        <select className={ui.select} value={format} onChange={(e) => setFormat(e.target.value)}>
                          <option value="none">بدون قالب (برای KPI)</option>
                          <option value="number">عدد</option>
                          <option value="percent">درصد</option>
                          <option value="string">رشته</option>
                          <option value="date">تاریخ</option>
                          <option value="datetime">تاریخ‌زمان</option>
                        </select>
                      </label>
                    </div>
                  </details>
                </div>
              )}
            </>
          )}
        </>
      )}
      {error && <div className={ui.alert}>{error}</div>}
    </div>
  );
}
