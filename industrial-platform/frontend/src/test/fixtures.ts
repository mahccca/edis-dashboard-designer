import type { BindingValue, ComponentSpec, DocumentContent, RenderBundle } from "../shared/api/types";

export const KPI_SPEC: ComponentSpec = {
  id: "01929f3a-1000-7000-8000-000000000001",
  key: "industrial.kpi-card",
  version: "1.2.0",
  name: { fa: "کارت شاخص (KPI)", en: "KPI card" },
  category: "kpi",
  status: "published",
  rendererId: "builtin.kpi-card@1",
  properties: [
    { key: "title", label: { en: "Title" }, type: "string", required: true, maxLength: 80 },
    { key: "decimals", label: { en: "Decimals" }, type: "integer", minimum: 0, maximum: 4 },
    { key: "showUnit", label: { en: "Show unit" }, type: "boolean" },
    { key: "warnBelow", label: { en: "Warning below" }, type: "number" },
    { key: "critBelow", label: { en: "Critical below" }, type: "number" },
    { key: "size", label: { en: "Size" }, type: "enum", enum: ["sm", "md", "lg"] },
  ],
  defaults: { title: "KPI", decimals: 1, showUnit: true, size: "md" },
  inputs: [{ key: "value", dataType: "number", required: true }, { key: "timestamp", dataType: "timestamp" }],
  layoutConstraints: { allowedParents: ["column", "grid", "stack", "container"], allowedDocumentTypes: ["page", "dashboard", "template"] },
};

export const BINDING_ID = "01a1817c-66ab-724e-987b-9d78d1b98aab";

export function pilotDocument(): DocumentContent {
  return {
    schemaVersion: 1,
    documentType: "dashboard",
    settings: { direction: "rtl" },
    root: {
      id: "root", type: "root", children: [{
        id: "sec-kpis", type: "section", children: [
          { id: "hd-title", type: "heading", props: { text: { fa: "نمای کلی نیروگاه", en: "Plant overview" }, level: 1 } },
          { id: "row-kpis", type: "row", children: [{
            id: "col-ac", type: "column", children: [{
              id: "kpi-ac-power", type: "component",
              component: { definitionId: KPI_SPEC.id, definitionKey: KPI_SPEC.key, version: "1.2.0" },
              props: { title: { fa: "توان AC کل", en: "Total AC power" }, decimals: 1, warnBelow: 50, critBelow: 10 },
              bindings: { value: { bindingId: BINDING_ID } },
            }],
          }] },
        ],
      }],
    },
  };
}

export function value(overrides: Partial<BindingValue> = {}): BindingValue {
  return {
    bindingId: BINDING_ID, value: 312.4, unit: "kW", quality: "good", sourceTimestamp: "2026-10-28T08:00:00+00:00",
    origin: "object_variable", dataOrigin: "simulated", isTestData: true, ...overrides,
  };
}

export function bundle(overrides: Partial<RenderBundle> = {}): RenderBundle {
  return {
    mode: "runtime",
    publishedVersionId: "01a1817c-0000-7000-8000-000000000099",
    page: { id: "p", title: { fa: "نمای کلی" }, path: "/plant/overview" },
    document: pilotDocument(),
    components: [KPI_SPEC],
    theme: { tokens: { color: { surface: { base: "#0f1419" } } } },
    bindings: [],
    bindingOrigins: { [BINDING_ID]: { dataOrigin: "simulated", isTestData: true } },
    containsTestData: true,
    liveChannel: { url: "/api/v1/runtime/ws", topics: [`binding:${BINDING_ID}`] },
    ...overrides,
  };
}
