import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, http } from "../../shared/api/http";
import type { BindingValue, ComponentSpec, ComponentSummary, Project } from "../../shared/api/types";
import { getRenderer } from "../../shared/element-registry";
import { localize } from "../../shared/i18n";
import ui from "../../shared/ui/controls.module.css";

type RendererInfo = { rendererId: string; category: string; supportedInputs: string[]; description?: string };

type PropDraft = { key: string; labelFa: string; type: "string" | "number" | "integer" | "boolean" | "enum"; enumText: string };
type InputDraft = {
  key: string;
  dataType: "number" | "integer" | "boolean" | "string";
  required: boolean;
  sources: { object_variable: boolean; model_output: boolean; data_source_signal: boolean; static: boolean };
};

type FormState = {
  definitionId: string | null;
  version: string;
  etag: string | null;
  key: string;
  nameFa: string;
  nameEn: string;
  category: string;
  rendererId: string;
  properties: PropDraft[];
  defaultsText: string;
  inputs: InputDraft[];
  status: string;
  scope: "project" | "global";
};

const CATEGORIES = ["kpi", "chart", "gauge", "table", "status", "symbol", "layout", "text", "control"] as const;

const emptyProp = (): PropDraft => ({ key: "", labelFa: "", type: "string", enumText: "" });
const emptyInput = (): InputDraft => ({
  key: "value",
  dataType: "number",
  required: true,
  sources: { object_variable: true, model_output: true, data_source_signal: true, static: true },
});

function emptyForm(rendererId = "builtin.kpi-card@1"): FormState {
  return {
    definitionId: null,
    version: "0.1.0",
    etag: null,
    key: "",
    nameFa: "",
    nameEn: "",
    category: "kpi",
    rendererId,
    properties: [
      { key: "title", labelFa: "عنوان", type: "string", enumText: "" },
    ],
    defaultsText: '{\n  "title": "عنوان"\n}',
    inputs: [emptyInput()],
    status: "draft",
    scope: "project",
  };
}

function errText(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) return fallback;
  return err.problem.errors?.map((x) => `${x.pointer}: ${x.message}`).join("; ") || err.message;
}

function buildSpec(form: FormState, definitionId: string, status: string): Record<string, unknown> {
  let defaults: Record<string, unknown> = {};
  try {
    defaults = JSON.parse(form.defaultsText || "{}") as Record<string, unknown>;
  } catch {
    throw new Error("defaults باید JSON معتبر باشد");
  }
  const properties = form.properties
    .filter((p) => p.key.trim())
    .map((p) => {
      const base: Record<string, unknown> = {
        key: p.key.trim(),
        label: { fa: p.labelFa || p.key, en: p.key },
        type: p.type,
      };
      if (p.type === "enum") {
        const values = p.enumText.split(",").map((s) => s.trim()).filter(Boolean);
        base.enum = values;
      }
      return base;
    });
  const inputs = form.inputs
    .filter((i) => i.key.trim())
    .map((i) => ({
      key: i.key.trim(),
      label: { fa: i.key, en: i.key },
      dataType: i.dataType,
      ...(i.required ? { required: true } : {}),
    }));
  const bindings = form.inputs
    .filter((i) => i.key.trim())
    .map((i) => {
      const allowedSources = (Object.entries(i.sources) as Array<[keyof InputDraft["sources"], boolean]>)
        .filter(([, on]) => on)
        .map(([k]) => k);
      return { input: i.key.trim(), allowedSources: allowedSources.length ? allowedSources : ["static"] };
    });
  return {
    id: definitionId,
    key: form.key.trim(),
    schemaVersion: 1,
    version: form.version,
    category: form.category,
    name: { ...(form.nameFa ? { fa: form.nameFa } : {}), ...(form.nameEn ? { en: form.nameEn } : { en: form.key }) },
    status,
    rendererId: form.rendererId,
    properties,
    defaults,
    inputs,
    bindings,
    layoutConstraints: {
      minWidth: 80,
      minHeight: 80,
      resizable: true,
      allowedParents: ["column", "grid", "stack", "container"],
      allowedDocumentTypes: ["page", "dashboard", "template"],
    },
    permissions: { use: ["component.use"], edit: ["component.edit"] },
  };
}

function formFromSpec(spec: ComponentSpec & Record<string, unknown>, etag: string | null, scope: "project" | "global"): FormState {
  const name = typeof spec.name === "string" ? { en: spec.name } : (spec.name ?? {});
  const bindings = Array.isArray(spec.bindings) ? spec.bindings as Array<{ input: string; allowedSources: string[] }> : [];
  const sourceMap = Object.fromEntries(bindings.map((b) => [b.input, new Set(b.allowedSources)]));
  return {
    definitionId: spec.id,
    version: spec.version,
    etag,
    key: spec.key,
    nameFa: name.fa ?? "",
    nameEn: name.en ?? "",
    category: spec.category,
    rendererId: spec.rendererId,
    properties: (spec.properties ?? []).map((p) => ({
      key: p.key,
      labelFa: typeof p.label === "string" ? p.label : (p.label?.fa ?? p.key),
      type: (p.type === "number" || p.type === "integer" || p.type === "boolean" || p.type === "enum" ? p.type : "string"),
      enumText: (p.enum ?? []).map(String).join(", "),
    })),
    defaultsText: JSON.stringify(spec.defaults ?? {}, null, 2),
    inputs: (spec.inputs ?? []).map((i) => {
      const allowed = sourceMap[i.key] ?? new Set(["data_source_signal", "static"]);
      return {
        key: i.key,
        dataType: (i.dataType === "integer" || i.dataType === "boolean" || i.dataType === "string" ? i.dataType : "number"),
        required: Boolean(i.required),
        sources: {
          object_variable: allowed.has("object_variable"),
          model_output: allowed.has("model_output"),
          data_source_signal: allowed.has("data_source_signal"),
          static: allowed.has("static"),
        },
      };
    }),
    status: spec.status,
    scope,
  };
}

function Preview({ form }: { form: FormState }) {
  const Renderer = getRenderer(form.rendererId);
  const spec = useMemo(() => {
    try {
      return buildSpec(form, form.definitionId ?? "00000000-0000-7000-8000-000000000099", "draft") as unknown as ComponentSpec;
    } catch {
      return null;
    }
  }, [form]);
  if (!Renderer || !spec) {
    return <div className={ui.muted}>پیش‌نمایش در دسترس نیست</div>;
  }
  const sampleValue = form.rendererId.includes("image")
    ? "https://placehold.co/320x160/png"
    : form.rendererId.includes("chart")
      ? [
        { category: "A", power: 42, energy: 18 },
        { category: "B", power: 55, energy: 22 },
        { category: "C", power: 61, energy: 27 },
      ]
      : form.rendererId.includes("map")
        ? [
          { id: "IR-07", value: 12 },
          { id: "IR-11", value: 8 },
          { id: "IR-10", value: 15 },
        ]
        : 72.5;
  const sample: BindingValue = {
    bindingId: "preview",
    value: sampleValue,
    quality: "good",
    unit: "",
    sourceTimestamp: new Date().toISOString(),
    origin: "static",
    dataOrigin: "static",
    isTestData: true,
  };
  const inputs: Record<string, BindingValue | undefined> = {};
  for (const i of form.inputs) {
    if (i.key) inputs[i.key] = sample;
  }
  const node = {
    id: "preview",
    type: "component" as const,
    props: { ...(spec.defaults ?? {}) },
    component: { definitionId: spec.id, version: spec.version },
  };
  return (
    <div style={{ maxWidth: 280 }}>
      <Renderer node={node} spec={spec} inputs={inputs} testData={{}} locale="fa" />
    </div>
  );
}

export function ComponentStudio({ project }: { project: Project }) {
  const [items, setItems] = useState<ComponentSummary[] | null>(null);
  const [renderers, setRenderers] = useState<RendererInfo[]>([]);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const [{ data: list }, { data: rs }] = await Promise.all([
      http.get<{ items: ComponentSummary[] }>(`/projects/${project.id}/components`),
      http.get<{ items: RendererInfo[] }>("/renderers"),
    ]);
    setItems(list.items);
    setRenderers(rs.items);
  };

  useEffect(() => {
    void reload().catch((err) => setError(errText(err, "بارگذاری ناموفق بود")));
  }, [project.id]);

  const openVersion = async (summary: ComponentSummary, version: string) => {
    setError(null);
    try {
      const { data, etag } = await http.get<ComponentSpec>(`/components/${summary.id}/versions/${version}`);
      setForm(formFromSpec(data as ComponentSpec & Record<string, unknown>, etag ?? null, summary.scope));
    } catch (err) {
      setError(errText(err, "خواندن نسخه ناموفق بود"));
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (!form.definitionId) {
        const body = buildSpec(form, "00000000-0000-7000-8000-000000000000", "draft");
        const { data } = await http.post<ComponentSummary>(`/projects/${project.id}/components`, { body });
        const version = data.draftVersion ?? form.version;
        await openVersion(data, version);
      } else {
        if (form.scope === "global") throw new Error("تعاریف سراسری فقط‌خواندنی هستند");
        if (!form.etag) throw new Error("ETag موجود نیست؛ دوباره باز کنید");
        const body = buildSpec(form, form.definitionId, "draft");
        const { data, etag } = await http.put<ComponentSpec>(
          `/components/${form.definitionId}/versions/${form.version}`,
          { body, ifMatch: form.etag },
        );
        setForm(formFromSpec(data as ComponentSpec & Record<string, unknown>, etag ?? null, "project"));
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error && !(err instanceof ApiError) ? err.message : errText(err, "ذخیره ناموفق بود"));
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!form.definitionId) return;
    setError(null);
    setBusy(true);
    try {
      await http.post(`/components/${form.definitionId}/versions/${form.version}/publish`);
      await reload();
      const summary = (await http.get<{ items: ComponentSummary[] }>(`/projects/${project.id}/components`)).data.items
        .find((x) => x.id === form.definitionId);
      if (summary?.latestPublishedVersion) await openVersion(summary, summary.latestPublishedVersion);
    } catch (err) {
      setError(errText(err, "انتشار ناموفق بود"));
    } finally {
      setBusy(false);
    }
  };

  const bump = async () => {
    if (!form.definitionId) return;
    setError(null);
    setBusy(true);
    try {
      const fromVersion = form.version;
      const { data, etag } = await http.post<ComponentSpec>(`/components/${form.definitionId}/versions`, {
        body: { fromVersion, bump: "minor" },
      });
      setForm(formFromSpec(data as ComponentSpec & Record<string, unknown>, etag ?? null, "project"));
      await reload();
    } catch (err) {
      setError(errText(err, "نسخهٔ جدید ساخته نشد"));
    } finally {
      setBusy(false);
    }
  };

  const exportJson = () => {
    setError(null);
    try {
      const id = form.definitionId ?? "00000000-0000-7000-8000-000000000000";
      const spec = buildSpec(form, id, form.status === "published" ? "published" : "draft");
      const blob = new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${form.key || "component"}@${form.version || "0.1.0"}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خروجی JSON ناموفق بود");
    }
  };

  const importJson = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object") throw new Error("فایل باید یک آبجکت JSON باشد");
      const key = typeof parsed.key === "string" ? parsed.key : "";
      if (!key) throw new Error("کلید (key) در فایل الزامی است");
      const body = {
        ...parsed,
        version: typeof parsed.version === "string" ? parsed.version : "0.1.0",
        status: "draft",
      };
      const { data } = await http.post<ComponentSummary>(`/projects/${project.id}/components`, { body });
      const version = data.draftVersion ?? "0.1.0";
      await reload();
      await openVersion(data, version);
    } catch (err) {
      if (err instanceof SyntaxError) setError("JSON نامعتبر است");
      else setError(err instanceof Error && !(err instanceof ApiError) ? err.message : errText(err, "ورود از فایل ناموفق بود"));
    } finally {
      setBusy(false);
    }
  };

  const readOnly = form.scope === "global" || form.status === "published" || form.status === "deprecated";

  return (
    <div className={ui.form} style={{ maxWidth: 960, margin: "32px auto", gap: 20 }}>
      <div>
        <h2 style={{ margin: 0 }}>استودیوی کامپوننت</h2>
        <p className={ui.muted} style={{ margin: "8px 0 0" }}>
          تعریف ویجت‌های declarative بسازید و منتشر کنید. رندر فقط از whitelist پلتفرم است (بدون JS سفارشی).
          بستهٔ JSON را می‌توانید از بیرون وارد یا خارج کنید.
        </p>
        <div className={ui.row} style={{ marginTop: 12 }}>
          <button type="button" className={ui.button} disabled={busy || !form.key} onClick={exportJson}>
            خروجی JSON
          </button>
          <label className={ui.button} style={{ cursor: busy ? "not-allowed" : "pointer" }}>
            ورود از فایل
            <input
              type="file"
              accept="application/json,.json"
              hidden
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                void importJson(f);
              }}
            />
          </label>
        </div>
      </div>

      {items === null ? <div className={ui.muted}>…</div> : (
        <ul className={ui.list}>
          {items.map((c) => (
            <li key={c.id} className={`${ui.card} ${ui.row}`} style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
              <span>
                <strong>{localize(c.name, "fa")}</strong>{" "}
                <code dir="ltr">{c.key}</code>{" "}
                <span className={ui.muted}>
                  {c.category} · {c.scope === "global" ? "سراسری" : "پروژه"}
                  {c.latestPublishedVersion ? ` · منتشر ${c.latestPublishedVersion}` : ""}
                  {c.draftVersion ? ` · پیش‌نویس ${c.draftVersion}` : ""}
                </span>
              </span>
              <span className={ui.row}>
                {c.draftVersion && (
                  <button type="button" className={ui.button} onClick={() => void openVersion(c, c.draftVersion!)}>پیش‌نویس</button>
                )}
                {c.latestPublishedVersion && (
                  <button type="button" className={ui.button} onClick={() => void openVersion(c, c.latestPublishedVersion!)}>منتشرشده</button>
                )}
              </span>
            </li>
          ))}
          {items.length === 0 && <li className={ui.muted}>هنوز کامپوننتی نیست.</li>}
        </ul>
      )}

      <form className={`${ui.card} ${ui.form}`} onSubmit={(e) => void save(e)}>
        <div className={ui.row} style={{ justifyContent: "space-between" }}>
          <strong>{form.definitionId ? `ویرایش ${form.version} (${form.status})` : "کامپوننت جدید"}</strong>
          <button type="button" className={ui.button} onClick={() => setForm(emptyForm(renderers[0]?.rendererId ?? "builtin.kpi-card@1"))}>
            پاک کردن فرم
          </button>
        </div>

        <div className={ui.row}>
          <input className={ui.input} placeholder="نام فارسی" value={form.nameFa} disabled={readOnly}
                 onChange={(e) => setForm({ ...form, nameFa: e.target.value })} required={!form.nameEn} />
          <input className={ui.input} placeholder="نام انگلیسی" dir="ltr" value={form.nameEn} disabled={readOnly}
                 onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
        </div>
        <div className={ui.row}>
          <input className={ui.input} placeholder="کلید (مثلاً project.my-gauge)" dir="ltr" value={form.key}
                 disabled={readOnly || Boolean(form.definitionId)}
                 onChange={(e) => setForm({ ...form, key: e.target.value })} required />
          <select className={ui.select} value={form.category} disabled={readOnly}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={ui.select} value={form.rendererId} disabled={readOnly}
                  onChange={(e) => setForm({ ...form, rendererId: e.target.value })}>
            {(renderers.length ? renderers : [{ rendererId: form.rendererId, category: "", supportedInputs: [] }]).map((r) => (
              <option key={r.rendererId} value={r.rendererId}>{r.rendererId}</option>
            ))}
          </select>
        </div>

        <strong>ویژگی‌ها (properties)</strong>
        {form.properties.map((p, idx) => (
          <div key={idx} className={ui.row}>
            <input className={ui.input} placeholder="key" dir="ltr" value={p.key} disabled={readOnly}
                   onChange={(e) => {
                     const properties = [...form.properties];
                     properties[idx] = { ...p, key: e.target.value };
                     setForm({ ...form, properties });
                   }} />
            <input className={ui.input} placeholder="برچسب" value={p.labelFa} disabled={readOnly}
                   onChange={(e) => {
                     const properties = [...form.properties];
                     properties[idx] = { ...p, labelFa: e.target.value };
                     setForm({ ...form, properties });
                   }} />
            <select className={ui.select} value={p.type} disabled={readOnly}
                    onChange={(e) => {
                      const properties = [...form.properties];
                      properties[idx] = { ...p, type: e.target.value as PropDraft["type"] };
                      setForm({ ...form, properties });
                    }}>
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="integer">integer</option>
              <option value="boolean">boolean</option>
              <option value="enum">enum</option>
            </select>
            {p.type === "enum" && (
              <input className={ui.input} placeholder="a,b,c" dir="ltr" value={p.enumText} disabled={readOnly}
                     onChange={(e) => {
                       const properties = [...form.properties];
                       properties[idx] = { ...p, enumText: e.target.value };
                       setForm({ ...form, properties });
                     }} />
            )}
          </div>
        ))}
        {!readOnly && (
          <button type="button" className={ui.button} onClick={() => setForm({ ...form, properties: [...form.properties, emptyProp()] })}>
            + ویژگی
          </button>
        )}

        <label>
          پیش‌فرض‌ها (JSON)
          <textarea className={ui.input} dir="ltr" rows={4} value={form.defaultsText} disabled={readOnly}
                    onChange={(e) => setForm({ ...form, defaultsText: e.target.value })} />
        </label>

        <strong>ورودی‌های داده</strong>
        {form.inputs.map((inp, idx) => (
          <div key={idx} className={ui.form} style={{ gap: 8, padding: 8, border: "1px solid var(--color-border-subtle, #333)", borderRadius: 8 }}>
            <div className={ui.row}>
              <input className={ui.input} placeholder="key" dir="ltr" value={inp.key} disabled={readOnly}
                     onChange={(e) => {
                       const inputs = [...form.inputs];
                       inputs[idx] = { ...inp, key: e.target.value };
                       setForm({ ...form, inputs });
                     }} />
              <select className={ui.select} value={inp.dataType} disabled={readOnly}
                      onChange={(e) => {
                        const inputs = [...form.inputs];
                        inputs[idx] = { ...inp, dataType: e.target.value as InputDraft["dataType"] };
                        setForm({ ...form, inputs });
                      }}>
                <option value="number">number</option>
                <option value="integer">integer</option>
                <option value="string">string</option>
                <option value="boolean">boolean</option>
              </select>
              <label className={ui.row}>
                <input type="checkbox" checked={inp.required} disabled={readOnly}
                       onChange={(e) => {
                         const inputs = [...form.inputs];
                         inputs[idx] = { ...inp, required: e.target.checked };
                         setForm({ ...form, inputs });
                       }} />
                الزامی
              </label>
            </div>
            <div className={ui.row} style={{ flexWrap: "wrap" }}>
              {(Object.keys(inp.sources) as Array<keyof InputDraft["sources"]>).map((src) => (
                <label key={src} className={ui.row}>
                  <input type="checkbox" checked={inp.sources[src]} disabled={readOnly}
                         onChange={(e) => {
                           const inputs = [...form.inputs];
                           inputs[idx] = { ...inp, sources: { ...inp.sources, [src]: e.target.checked } };
                           setForm({ ...form, inputs });
                         }} />
                  <code dir="ltr">{src}</code>
                </label>
              ))}
            </div>
          </div>
        ))}
        {!readOnly && (
          <button type="button" className={ui.button} onClick={() => setForm({ ...form, inputs: [...form.inputs, emptyInput()] })}>
            + ورودی
          </button>
        )}

        <div>
          <strong>پیش‌نمایش</strong>
          <Preview form={form} />
        </div>

        {error && <div className={ui.alert} role="alert">{error}</div>}

        <div className={ui.row}>
          {!readOnly && (
            <button className={`${ui.button} ${ui.primary}`} disabled={busy} type="submit">
              {form.definitionId ? "ذخیرهٔ پیش‌نویس" : "ساخت پیش‌نویس"}
            </button>
          )}
          {form.definitionId && form.status === "draft" && form.scope === "project" && (
            <button type="button" className={`${ui.button} ${ui.primary}`} disabled={busy} onClick={() => void publish()}>
              انتشار
            </button>
          )}
          {form.definitionId && form.status === "published" && form.scope === "project" && (
            <button type="button" className={ui.button} disabled={busy} onClick={() => void bump()}>
              نسخهٔ minor جدید
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
