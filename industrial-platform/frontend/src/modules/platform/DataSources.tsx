import { useEffect, useState, type FormEvent } from "react";
import { ApiError, http } from "../../shared/api/http";
import type { DataSource, Project } from "../../shared/api/types";
import ui from "../../shared/ui/controls.module.css";
import { TrashIcon } from "../../shared/ui/TrashIcon";

type ResultMode = "scalar" | "json" | "options";

type RefreshUnit = "s" | "m";

type QueryDraft = {
  key: string;
  name: string;
  method: "GET" | "POST";
  urlPath: string;
  resultMode: ResultMode;
  jsonPath: string;
  itemsPath: string;
  unit: string;
  /** Raw JSON text for POST body (validated on save). */
  bodyText: string;
  /** How often upstream may be called. */
  refreshValue: number;
  refreshUnit: RefreshUnit;
};

type FormState = {
  name: string;
  baseUrl: string;
  authHeader: string;
  queries: QueryDraft[];
};

type SignalPreview = {
  path: string;
  name?: string;
  unit: string;
  resultMode?: ResultMode;
  itemsPath?: string;
  lastValue: unknown;
};

const emptyQuery = (): QueryDraft => ({
  key: "", name: "", method: "GET", urlPath: "/", resultMode: "scalar", jsonPath: "0", itemsPath: "",
  unit: "", bodyText: "", refreshValue: 5, refreshUnit: "s",
});

function bodyTextFromConfig(body: unknown): string {
  if (body === undefined || body === null || body === "") return "";
  if (typeof body === "string") {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return "";
  }
}

function parseBodyText(text: string): { ok: true; value: unknown } | { ok: false; message: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown };
  } catch {
    return { ok: false, message: "بدنهٔ POST باید JSON معتبر باشد" };
  }
}

function msFromRefresh(value: number, unit: RefreshUnit): number {
  const n = Number.isFinite(value) && value > 0 ? value : 5;
  const ms = unit === "m" ? Math.round(n * 60_000) : Math.round(n * 1000);
  return Math.max(1000, Math.min(3_600_000, ms));
}

function refreshFromMs(ms: unknown): { refreshValue: number; refreshUnit: RefreshUnit } {
  const n = typeof ms === "number" && Number.isFinite(ms) ? ms : 5000;
  if (n >= 60_000 && n % 60_000 === 0) {
    return { refreshValue: n / 60_000, refreshUnit: "m" };
  }
  return { refreshValue: Math.max(1, Math.round(n / 1000)), refreshUnit: "s" };
}

function formatRefreshLabel(value: number, unit: RefreshUnit): string {
  return unit === "m" ? `هر ${value} دقیقه` : `هر ${value} ثانیه`;
}

const emptyForm = (): FormState => ({
  name: "", baseUrl: "", authHeader: "", queries: [emptyQuery()],
});

function parseResultMode(raw: unknown): ResultMode {
  if (raw === "json" || raw === "options") return raw;
  return "scalar";
}

/** Example for http://10.8.0.2:4000/api/public/subscriptions/watchlists */
const WATCHLISTS_EXAMPLE: FormState = {
  name: "SCADA Watchlists",
  baseUrl: "http://10.8.0.2:4000",
  authHeader: "",
  queries: [
    {
      key: "watchlists/signals",
      name: "سیگنال‌های watchlist (آپشن‌ها)",
      method: "GET",
      urlPath: "/api/public/subscriptions/watchlists",
      resultMode: "options",
      jsonPath: "$",
      itemsPath: "signals",
      unit: "",
      bodyText: "",
      refreshValue: 1,
      refreshUnit: "m",
    },
    {
      key: "watchlists/all",
      name: "همه watchlistها (JSON کامل)",
      method: "GET",
      urlPath: "/api/public/subscriptions/watchlists",
      resultMode: "json",
      jsonPath: "$",
      itemsPath: "",
      unit: "",
      bodyText: "",
      refreshValue: 1,
      refreshUnit: "m",
    },
    {
      key: "watchlists/first-id",
      name: "اولین watchlist (id)",
      method: "GET",
      urlPath: "/api/public/subscriptions/watchlists",
      resultMode: "scalar",
      jsonPath: "0.id",
      itemsPath: "",
      unit: "",
      bodyText: "",
      refreshValue: 5,
      refreshUnit: "m",
    },
    {
      key: "watchlists/first-name",
      name: "اولین watchlist (نام)",
      method: "GET",
      urlPath: "/api/public/subscriptions/watchlists",
      resultMode: "scalar",
      jsonPath: "0.name",
      itemsPath: "",
      unit: "",
      bodyText: "",
      refreshValue: 5,
      refreshUnit: "m",
    },
  ],
};

/** Example for http://10.8.0.2:4000/api/v1/public/sites */
const SITES_EXAMPLE: FormState = {
  name: "اطلاعات سایت‌ها",
  baseUrl: "http://10.8.0.2:4000",
  authHeader: "",
  queries: [
    {
      key: "sites/all",
      name: "همه سایت‌ها (JSON کامل)",
      method: "GET",
      urlPath: "/api/v1/public/sites",
      resultMode: "json",
      jsonPath: "$",
      itemsPath: "",
      unit: "",
      bodyText: "",
      refreshValue: 30,
      refreshUnit: "s",
    },
    {
      key: "sites/totals",
      name: "totals هر سایت (آپشن لایه‌ای)",
      method: "GET",
      urlPath: "/api/v1/public/sites",
      resultMode: "options",
      jsonPath: "$",
      itemsPath: "totals",
      unit: "",
      bodyText: "",
      refreshValue: 30,
      refreshUnit: "s",
    },
    {
      key: "sites/list",
      name: "لیست سایت‌ها (آپشن‌ها)",
      method: "GET",
      urlPath: "/api/v1/public/sites",
      resultMode: "options",
      jsonPath: "$",
      itemsPath: "",
      unit: "",
      bodyText: "",
      refreshValue: 10,
      refreshUnit: "m",
    },
  ],
};

const UNITS = ["", "W", "kW", "MW", "Wh", "kWh", "MWh", "V", "A", "Hz", "°C", "%", "W/m2", "h"];

function formatPreviewValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function formFromSource(ds: DataSource): FormState {
  const cfg = ds.config ?? {};
  const headers = (cfg.headers && typeof cfg.headers === "object") ? cfg.headers as Record<string, string> : {};
  const auth = headers.Authorization ?? headers.authorization ?? "";
  const queries = Array.isArray(cfg.queries)
    ? (cfg.queries as Array<Partial<QueryDraft> & { refreshIntervalMs?: number; body?: unknown }>).map((q) => {
        const resultMode = parseResultMode(q.resultMode);
        const refresh = refreshFromMs(q.refreshIntervalMs);
        return {
          key: q.key ?? "",
          name: q.name ?? "",
          method: (q.method === "POST" ? "POST" : "GET") as "GET" | "POST",
          urlPath: q.urlPath ?? "/",
          resultMode,
          jsonPath: q.jsonPath ?? (resultMode === "scalar" ? "0" : "$"),
          itemsPath: q.itemsPath ?? "",
          unit: q.unit ?? "",
          bodyText: bodyTextFromConfig(q.body),
          refreshValue: refresh.refreshValue,
          refreshUnit: refresh.refreshUnit,
        };
      })
    : [emptyQuery()];
  return {
    name: ds.name,
    baseUrl: typeof cfg.baseUrl === "string" ? cfg.baseUrl : "",
    authHeader: auth === "***" ? "" : auth,
    queries: queries.length ? queries : [emptyQuery()],
  };
}

function buildConfig(form: FormState, previous?: DataSource): { config: Record<string, unknown> } | { error: string } {
  const headers: Record<string, string> = {};
  if (form.authHeader.trim()) {
    headers.Authorization = form.authHeader.trim();
  } else if (previous?.hasCredentials) {
    // Keep existing secret when the field is left blank while editing.
    headers.Authorization = "***";
  }
  const queries: Record<string, unknown>[] = [];
  for (let i = 0; i < form.queries.length; i++) {
    const q = form.queries[i]!;
    const base: Record<string, unknown> = {
      key: q.key.trim(),
      name: (q.name.trim() || q.key.trim()),
      method: q.method,
      urlPath: q.urlPath.trim().startsWith("/") ? q.urlPath.trim() : `/${q.urlPath.trim()}`,
      resultMode: q.resultMode,
      jsonPath: q.resultMode === "scalar" ? q.jsonPath.trim() : (q.jsonPath.trim() || "$"),
      unit: q.unit,
      refreshIntervalMs: msFromRefresh(q.refreshValue, q.refreshUnit),
    };
    if (q.resultMode === "options") {
      base.itemsPath = q.itemsPath.trim();
    }
    if (q.method === "POST") {
      const parsed = parseBodyText(q.bodyText);
      if (!parsed.ok) {
        return { error: `کوئری ${i + 1}: ${parsed.message}` };
      }
      if (parsed.value !== undefined) {
        base.body = parsed.value;
      }
    }
    queries.push(base);
  }
  return {
    config: {
      baseUrl: form.baseUrl.trim().replace(/\/$/, ""),
      timeoutMs: 5000,
      ...(Object.keys(headers).length ? { headers } : {}),
      queries,
    },
  };
}

export function DataSources({ project }: { project: Project }) {
  const [items, setItems] = useState<DataSource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, SignalPreview[]>>({});
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<DataSource | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const reload = () => http.get<{ items: DataSource[] }>(`/projects/${project.id}/data-sources`)
    .then(({ data }) => setItems(data.items));

  useEffect(() => {
    void reload();
  }, [project.id]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setTestMsg(null);
    const built = buildConfig(form, editing ?? undefined);
    if ("error" in built) {
      setError(built.error);
      return;
    }
    try {
      if (editing) {
        await http.patch(`/data-sources/${editing.id}`, {
          body: { name: form.name.trim(), config: built.config },
          ifMatch: `"v-${editing.lockVersion ?? 1}"`,
        });
      } else {
        await http.post(`/projects/${project.id}/data-sources`, {
          body: { name: form.name.trim(), kind: "http_json", config: built.config },
        });
      }
      setForm(emptyForm());
      setEditing(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError
        ? (err.problem.errors?.map((x) => `${x.pointer}: ${x.message}`).join("; ") || err.message)
        : "ذخیرهٔ منبع داده ناموفق بود");
    }
  };

  const startEdit = (ds: DataSource) => {
    setEditing(ds);
    setForm(formFromSource(ds));
    setError(null);
    setConfirmId(null);
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm(emptyForm());
    setError(null);
  };

  const remove = async (ds: DataSource) => {
    setError(null);
    try {
      await http.delete(`/data-sources/${ds.id}`, { ifMatch: `"v-${ds.lockVersion ?? 1}"` });
      setConfirmId(null);
      if (editing?.id === ds.id) cancelEdit();
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "حذف ناموفق بود");
    }
  };

  const test = async (ds: DataSource) => {
    setTestMsg(null);
    try {
      const { data } = await http.post<{ ok: boolean; message: string; latencyMs: number | null }>(
        `/data-sources/${ds.id}/test`,
      );
      setTestMsg(`${ds.name}: ${data.ok ? "موفق" : "ناموفق"} — ${data.message}${data.latencyMs != null ? ` (${data.latencyMs}ms)` : ""}`);
    } catch (err) {
      setTestMsg(err instanceof ApiError ? err.message : "تست اتصال ناموفق بود");
    }
  };

  const loadSignals = async (ds: DataSource) => {
    try {
      const { data } = await http.get<{ items: SignalPreview[] }>(
        `/data-sources/${ds.id}/signals`,
      );
      setPreview((prev) => ({ ...prev, [ds.id]: data.items }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خواندن کوئری‌ها ناموفق بود");
    }
  };

  const executeFirst = async (ds: DataSource) => {
    const q = Array.isArray(ds.config?.queries) ? (ds.config!.queries as Array<{ key: string }>)[0] : null;
    if (!q?.key) {
      setError("کوئری‌ای برای اجرا نیست");
      return;
    }
    setTestMsg(null);
    try {
      const { data } = await http.post<{
        ok: boolean; message?: string; statusCode?: number; schema?: { version: number; paths: unknown[] };
      }>(`/data-sources/${ds.id}/execute`, { body: { queryKey: q.key, discover: true } });
      setTestMsg(
        `${ds.name} execute: ${data.ok ? "موفق" : "ناموفق"} — ${data.message ?? ""}${
          data.schema ? ` · schema v${data.schema.version} (${(data.schema.paths ?? []).length} paths)` : ""
        }`,
      );
      await loadSignals(ds);
    } catch (err) {
      setTestMsg(err instanceof ApiError ? err.message : "Execute ناموفق بود");
    }
  };

  const updateQuery = (i: number, patch: Partial<QueryDraft>) => {
    const queries = [...form.queries];
    const next = { ...queries[i]!, ...patch };
    if (patch.resultMode === "json" || patch.resultMode === "options") {
      if (!next.jsonPath || next.jsonPath === "0") next.jsonPath = "$";
    }
    if (patch.resultMode === "scalar" && (next.jsonPath === "$" || next.jsonPath === "")) {
      next.jsonPath = "0";
    }
    if (patch.resultMode && patch.resultMode !== "options") {
      next.itemsPath = "";
    }
    queries[i] = next;
    setForm({ ...form, queries });
  };

  return (
    <div className={ui.form} style={{ maxWidth: 860, margin: "32px auto" }}>
      <h2 style={{ margin: 0 }}>منابع داده</h2>
      <p className={ui.muted} style={{ margin: 0 }}>
        baseUrl فقط ریشهٔ سرور است (مثلاً <code dir="ltr">http://10.8.0.2:4000</code>)؛ مسیر API را در کوئری بگذارید.
        برای لیست قابل‌انتخاب: حالت <strong>آپشن‌ها</strong> —
        آرایه تو‌در‌تو مثل <code dir="ltr">itemsPath=signals</code> یا object مثل <code dir="ltr">itemsPath=totals</code>.
      </p>

      {items === null ? <div className={ui.muted}>…</div> : (
        <ul className={ui.list}>
          {items.map((ds) => (
            <li key={ds.id} className={`${ui.card} ${ui.form}`}>
              <div className={ui.row} style={{ justifyContent: "space-between" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong>{ds.name}</strong>
                    {ds.isTestData ? (
                      <span
                        style={{
                          fontSize: "0.72rem",
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: "rgba(245, 165, 36, 0.15)",
                          color: "#f5a524",
                          border: "1px solid rgba(245, 165, 36, 0.3)",
                          fontWeight: 600,
                        }}
                        title="این منبع داده آزمایشی و شبیه‌سازی‌شده است"
                      >
                        🧪 منبع داده تستی
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: "0.72rem",
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: "rgba(16, 185, 129, 0.15)",
                          color: "#34d399",
                          border: "1px solid rgba(16, 185, 129, 0.3)",
                          fontWeight: 600,
                        }}
                        title="این منبع داده متصل به ادوات زنده صنعتی است"
                      >
                        🟢 منبع داده واقعی (Live)
                      </span>
                    )}
                  </div>
                  <span className={ui.muted}>{ds.kind} · مبدأ: {ds.dataOrigin} · وضعیت: {ds.status}</span>
                  {ds.kind === "http_json" && typeof ds.config?.baseUrl === "string" ? (
                    <div className={ui.muted} dir="ltr">{ds.config.baseUrl}</div>
                  ) : null}
                </div>
                <span className={ui.row}>
                  <button type="button" className={ui.button} onClick={() => void test(ds)}>تست</button>
                  <button type="button" className={ui.button} onClick={() => void executeFirst(ds)}>Execute</button>
                  <button type="button" className={ui.button} onClick={() => void loadSignals(ds)}>نتیجه</button>
                  <button type="button" className={ui.button} onClick={() => startEdit(ds)}>ویرایش</button>
                  {confirmId === ds.id ? (
                    <span className={ui.row} role="group" aria-label="تأیید حذف">
                      <span className={ui.muted}>حذف شود؟</span>
                      <button type="button" className={`${ui.button} ${ui.danger}`} onClick={() => void remove(ds)}>بله</button>
                      <button type="button" className={ui.button} onClick={() => setConfirmId(null)}>انصراف</button>
                    </span>
                  ) : (
                    <button type="button" className={`${ui.button} ${ui.iconButton} ${ui.dangerIcon}`}
                            title="حذف منبع داده" aria-label={`حذف ${ds.name}`}
                            onClick={() => setConfirmId(ds.id)}>
                      <TrashIcon />
                    </button>
                  )}
                </span>
              </div>
              {ds.kind === "http_json" && Array.isArray(ds.config?.queries) ? (
                <ul className={ui.list}>
                  {(ds.config.queries as QueryDraft[]).map((q) => (
                    <li key={q.key} className={ui.muted} dir="ltr">
                      {q.name || q.key} → {q.method} {q.urlPath} · {q.resultMode ?? "scalar"}
                      {q.resultMode === "options" && q.itemsPath ? ` · items=${q.itemsPath}` : ` · ${q.jsonPath}`}
                      {(() => {
                        const ms = (q as { refreshIntervalMs?: number }).refreshIntervalMs;
                        if (typeof ms !== "number") return "";
                        const { refreshValue, refreshUnit } = refreshFromMs(ms);
                        return ` · ${formatRefreshLabel(refreshValue, refreshUnit)}`;
                      })()}
                      {" · "}{q.unit || "(no unit)"}
                    </li>
                  ))}
                </ul>
              ) : null}
              {preview[ds.id] ? (
                <div className={ui.info}>
                  {(preview[ds.id] ?? []).length === 0 && <span>کوئری‌ای برنگشت.</span>}
                  {(preview[ds.id] ?? []).map((s) => {
                    const isOptions = s.resultMode === "options";
                    const isJson = s.resultMode === "json" || (!isOptions && typeof s.lastValue === "object");
                    const optionList = isOptions && Array.isArray(s.lastValue)
                      ? (s.lastValue as Array<{ value?: string; label?: string }>)
                      : null;
                    return (
                      <div key={s.path} style={{ marginBottom: 8 }}>
                        <div className={ui.row} style={{ justifyContent: "space-between" }}>
                          <span>{s.name ?? s.path}</span>
                          <span className={ui.muted} dir="ltr">
                            {s.resultMode ?? (isJson ? "json" : "scalar")}
                            {s.itemsPath ? ` · ${s.itemsPath}` : ""}
                            {s.unit ? ` · ${s.unit}` : ""}
                          </span>
                        </div>
                        {optionList ? (
                          <ul className={ui.list} style={{ margin: "4px 0 0", maxHeight: 200, overflow: "auto" }}>
                            {optionList.length === 0 && <li className={ui.muted}>آپشنی استخراج نشد.</li>}
                            {optionList.map((o) => (
                              <li key={String(o.value)} dir="ltr" className={ui.muted}>
                                {o.label ?? o.value}{o.label && o.label !== o.value ? ` (${o.value})` : ""}
                              </li>
                            ))}
                          </ul>
                        ) : isJson ? (
                          <pre dir="ltr" style={{ margin: "4px 0 0", maxHeight: 240, overflow: "auto", fontSize: 12, whiteSpace: "pre-wrap" }}>
                            {formatPreviewValue(s.lastValue)}
                          </pre>
                        ) : (
                          <code dir="ltr">{formatPreviewValue(s.lastValue)} {s.unit}</code>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </li>
          ))}
          {items.length === 0 && <li className={ui.muted}>هنوز منبع داده‌ای ساخته نشده است.</li>}
        </ul>
      )}

      {testMsg && <div className={ui.info} role="status">{testMsg}</div>}

      <form className={`${ui.card} ${ui.form}`} onSubmit={(e) => void save(e)}>
        <div className={ui.row} style={{ justifyContent: "space-between" }}>
          <strong>{editing ? `ویرایش: ${editing.name}` : "منبع API جدید (HTTP JSON)"}</strong>
          <span className={ui.row}>
            <button type="button" className={ui.button} onClick={() => { setForm(WATCHLISTS_EXAMPLE); setError(null); }}>
              مثال Watchlists
            </button>
            <button type="button" className={ui.button} onClick={() => { setForm(SITES_EXAMPLE); setError(null); }}>
              مثال سایت‌ها
            </button>
            {editing && <button type="button" className={ui.button} onClick={cancelEdit}>انصراف ویرایش</button>}
          </span>
        </div>

        <div className={ui.info}>
          مثال‌ها: Watchlists (
          <code dir="ltr">/api/public/subscriptions/watchlists</code>
          ) و سایت‌ها (
          <code dir="ltr">/api/v1/public/sites</code>
          ) — آپشن‌ها، JSON کامل، اسکالر.
        </div>

        <label className={ui.field}>
          <span className={ui.label}>نام</span>
          <input className={ui.input} placeholder="مثلاً SCADA Watchlists" value={form.name}
                 onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </label>
        <label className={ui.field}>
          <span className={ui.label}>baseUrl (فقط ریشه — بدون مسیر)</span>
          <input className={ui.input} dir="ltr" placeholder="http://10.8.0.2:4000" value={form.baseUrl}
                 onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} required />
        </label>
        <label className={ui.field}>
          <span className={ui.label}>Authorization (اختیاری)</span>
          <input className={ui.input} dir="ltr"
                 placeholder={editing?.hasCredentials ? "خالی = همان مقدار قبلی حفظ می‌شود" : "Bearer …"}
                 value={form.authHeader} onChange={(e) => setForm({ ...form, authHeader: e.target.value })}
                 autoComplete="off" />
        </label>

        <div className={ui.form}>
          <div className={ui.row} style={{ justifyContent: "space-between" }}>
            <strong>کوئری‌ها</strong>
            <button type="button" className={ui.button}
                    onClick={() => setForm({ ...form, queries: [...form.queries, emptyQuery()] })}>
              + کوئری
            </button>
          </div>
          {form.queries.map((q, i) => (
            <div key={i} className={`${ui.card} ${ui.form}`} style={{ background: "transparent" }}>
              <div className={ui.row}>
                <input className={ui.input} dir="ltr" placeholder="key مثل watchlists/signals" value={q.key}
                       onChange={(e) => updateQuery(i, { key: e.target.value })} required />
                <input className={ui.input} placeholder="نام نمایشی" value={q.name}
                       onChange={(e) => updateQuery(i, { name: e.target.value })} />
              </div>
              <div className={ui.row}>
                <select className={ui.select} value={q.method} style={{ width: 100 }}
                        onChange={(e) => updateQuery(i, { method: e.target.value as "GET" | "POST" })}>
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                </select>
                <input className={ui.input} dir="ltr" placeholder="/api/public/subscriptions/watchlists" value={q.urlPath}
                       onChange={(e) => updateQuery(i, { urlPath: e.target.value })} required />
              </div>
              {q.method === "POST" && (
                <label className={ui.field}>
                  <span className={ui.label}>بدنهٔ درخواست (JSON)</span>
                  <textarea
                    className={ui.input}
                    dir="ltr"
                    rows={6}
                    placeholder={'{\n  "siteId": "Darkhoveyn",\n  "from": "2026-01-01"\n}'}
                    value={q.bodyText}
                    onChange={(e) => updateQuery(i, { bodyText: e.target.value })}
                    style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: 12, resize: "vertical" }}
                  />
                  <span className={ui.hint}>
                    برای POST خالی هم مجاز است. بازهٔ فراخوانی مثل GET عمل می‌کند — پاسخ تا TTL در کش می‌ماند.
                  </span>
                </label>
              )}
              <div className={ui.row}>
                <select className={ui.select} value={q.resultMode} style={{ width: 140 }}
                        onChange={(e) => updateQuery(i, { resultMode: e.target.value as ResultMode })}
                        aria-label="حالت نتیجه">
                  <option value="scalar">اسکالر</option>
                  <option value="json">JSON / لیست</option>
                  <option value="options">آپشن‌ها</option>
                </select>
                <input className={ui.input} dir="ltr"
                       placeholder={q.resultMode === "options"
                         ? "jsonPath: $ = کل پاسخ"
                         : q.resultMode === "json"
                           ? "jsonPath: $ = کل پاسخ، یا data.items"
                           : "jsonPath اسکالر مثل 0.name"}
                       value={q.jsonPath}
                       onChange={(e) => updateQuery(i, { jsonPath: e.target.value })}
                       required={q.resultMode === "scalar"} />
                <select className={ui.select} value={q.unit} style={{ width: 120 }}
                        onChange={(e) => updateQuery(i, { unit: e.target.value })}>
                  {UNITS.map((u) => <option key={u || "none"} value={u}>{u || "(بدون واحد)"}</option>)}
                </select>
                {form.queries.length > 1 && (
                  <button type="button" className={`${ui.button} ${ui.danger}`} onClick={() => {
                    setForm({ ...form, queries: form.queries.filter((_, j) => j !== i) });
                  }}>حذف کوئری</button>
                )}
              </div>
              <label className={ui.field}>
                <span className={ui.label}>بازهٔ فراخوانی API</span>
                <div className={ui.row}>
                  <input
                    className={ui.input}
                    type="number"
                    min={1}
                    max={q.refreshUnit === "m" ? 60 : 3600}
                    step={1}
                    value={q.refreshValue}
                    style={{ width: 100 }}
                    aria-label="مقدار بازه"
                    onChange={(e) => updateQuery(i, { refreshValue: Math.max(1, Number(e.target.value) || 1) })}
                  />
                  <select
                    className={ui.select}
                    value={q.refreshUnit}
                    style={{ width: 120 }}
                    aria-label="واحد بازه"
                    onChange={(e) => updateQuery(i, { refreshUnit: e.target.value as RefreshUnit })}
                  >
                    <option value="s">ثانیه</option>
                    <option value="m">دقیقه</option>
                  </select>
                  <select
                    className={ui.select}
                    style={{ width: 160 }}
                    aria-label="پیش‌فرض بازه"
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      if (v.endsWith("m")) {
                        updateQuery(i, { refreshValue: Number(v.slice(0, -1)), refreshUnit: "m" });
                      } else {
                        updateQuery(i, { refreshValue: Number(v.slice(0, -1)), refreshUnit: "s" });
                      }
                    }}
                  >
                    <option value="">میان‌بر…</option>
                    <option value="5s">۵ ثانیه</option>
                    <option value="30s">۳۰ ثانیه</option>
                    <option value="1m">۱ دقیقه</option>
                    <option value="5m">۵ دقیقه</option>
                    <option value="10m">۱۰ دقیقه</option>
                    <option value="30m">۳۰ دقیقه</option>
                    <option value="60m">۶۰ دقیقه</option>
                  </select>
                </div>
                <span className={ui.hint}>
                  {formatRefreshLabel(q.refreshValue, q.refreshUnit)} یک‌بار به API زده می‌شود
                  (حتی اگر صفحه‌ساز بیشتر poll کند).
                </span>
              </label>
              {q.resultMode === "options" && (
                <>
                  <label className={ui.field}>
                    <span className={ui.label}>itemsPath (اختیاری)</span>
                    <input className={ui.input} dir="ltr" placeholder="مثلاً signals — فیلد آرایه داخل هر آیتم"
                           value={q.itemsPath}
                           onChange={(e) => updateQuery(i, { itemsPath: e.target.value })} />
                  </label>
                  <div className={ui.hint}>
                    برای watchlistها: jsonPath=<code dir="ltr">$</code> و itemsPath=<code dir="ltr">signals</code>
                    تا هر سیگنال به‌عنوان آپشن در صفحه‌ساز قابل انتخاب باشد (فقط مقدار رشتهٔ prop).
                  </div>
                </>
              )}
              {q.resultMode === "json" && (
                <div className={ui.hint}>
                  کل پاسخ API به‌صورت JSON/لیست برمی‌گردد و در بایندینگ قابل استفاده است. برای کل پاسخ، <code dir="ltr">$</code> یا خالی بگذارید.
                </div>
              )}
            </div>
          ))}
        </div>

        {error && <div className={ui.alert}>{error}</div>}
        <button className={`${ui.button} ${ui.primary}`}>
          {editing ? "ذخیرهٔ تغییرات" : "ساخت منبع داده"}
        </button>
      </form>
    </div>
  );
}
