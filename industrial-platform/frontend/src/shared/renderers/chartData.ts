/** Normalize API / binding payloads into rows the unified chart can plot. */

export type ChartKind = "line" | "bar" | "area" | "pie" | "scatter" | "combo";
export type SeriesKind = "line" | "bar" | "area" | "scatter";

export interface ChartRow {
  [key: string]: unknown;
}

export interface NormalizedChart {
  categories: string[];
  series: Array<{ name: string; data: number[]; type: SeriesKind }>;
  /** Pie uses name/value pairs derived from categories + first series. */
  pie: Array<{ name: string; value: number }>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function splitCsv(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function asSeriesKind(raw: string | undefined, fallback: SeriesKind): SeriesKind {
  if (raw === "line" || raw === "bar" || raw === "area" || raw === "scatter") return raw;
  return fallback;
}

/** Pull a usable dataset from a live binding value (json / table / echarts-like). */
export function extractRows(raw: unknown): ChartRow[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    if (raw.every((x) => typeof x === "number" || x === null)) {
      return raw.map((v, i) => ({ x: String(i + 1), value: v }));
    }
    if (raw.every((x) => isRecord(x))) return raw as ChartRow[];
    return [];
  }
  if (!isRecord(raw)) return [];

  // { categories: [...], series: [{ name, data }] }
  if (Array.isArray(raw.categories) && Array.isArray(raw.series)) {
    const cats = raw.categories.map((c) => String(c));
    const seriesList = raw.series.filter(isRecord);
    return cats.map((cat, i) => {
      const row: ChartRow = { x: cat };
      for (const s of seriesList) {
        const name = String(s.name ?? "series");
        const data = Array.isArray(s.data) ? s.data : [];
        row[name] = data[i] ?? null;
      }
      return row;
    });
  }

  // { columns: [...], rows: [[...]] } or { columns, rows: [{...}] }
  if (Array.isArray(raw.columns) && Array.isArray(raw.rows)) {
    const cols = raw.columns.map((c) => String(c));
    return raw.rows.map((row) => {
      if (isRecord(row)) return row as ChartRow;
      if (Array.isArray(row)) {
        const out: ChartRow = {};
        cols.forEach((c, i) => { out[c] = row[i]; });
        return out;
      }
      return {};
    });
  }

  // { items: [...] } / { data: [...] }
  for (const key of ["items", "data", "rows", "results"]) {
    if (Array.isArray(raw[key])) return extractRows(raw[key]);
  }
  return [];
}

function guessXField(rows: ChartRow[], preferred?: string): string {
  if (preferred && rows.some((r) => preferred in r)) return preferred;
  const keys = rows[0] ? Object.keys(rows[0]) : [];
  const candidates = ["category", "name", "label", "x", "time", "timestamp", "date", "month", "t"];
  for (const c of candidates) if (keys.includes(c)) return c;
  return keys[0] ?? "x";
}

function guessYFields(rows: ChartRow[], xField: string, preferred: string[]): string[] {
  if (preferred.length) return preferred.filter((f) => f !== xField);
  const keys = rows[0] ? Object.keys(rows[0]).filter((k) => k !== xField) : [];
  const numeric = keys.filter((k) => rows.some((r) => asNumber(r[k]) !== null));
  return numeric.length ? numeric.slice(0, 6) : keys.slice(0, 3);
}

export interface ChartMapping {
  chartType: ChartKind;
  xField?: string;
  yFields?: string;
  seriesField?: string;
  seriesTypes?: string;
  dualAxis?: boolean;
}

export function normalizeChart(raw: unknown, mapping: ChartMapping): NormalizedChart {
  const empty: NormalizedChart = { categories: [], series: [], pie: [] };
  const rows = extractRows(raw);
  if (!rows.length) return empty;

  const chartType = mapping.chartType;
  const seriesField = typeof mapping.seriesField === "string" ? mapping.seriesField.trim() : "";
  const xField = guessXField(rows, mapping.xField?.trim() || undefined);
  const yPreferred = splitCsv(mapping.yFields);
  const typeList = splitCsv(mapping.seriesTypes);

  // Long format: one value column + a series dimension (metric name).
  if (seriesField && rows.some((r) => seriesField in r)) {
    const yField = yPreferred[0] ?? Object.keys(rows[0]!).find((k) => k !== xField && k !== seriesField) ?? "value";
    const categories = [...new Set(rows.map((r) => String(r[xField] ?? "")))];
    const seriesNames = [...new Set(rows.map((r) => String(r[seriesField] ?? "series")))];
    const series = seriesNames.map((name, si) => {
      const data = categories.map((cat) => {
        const hit = rows.find((r) => String(r[xField] ?? "") === cat && String(r[seriesField] ?? "") === name);
        return asNumber(hit?.[yField]) ?? 0;
      });
      const kind = chartType === "combo"
        ? asSeriesKind(typeList[si], si === 0 ? "bar" : "line")
        : chartType === "pie"
          ? "bar"
          : asSeriesKind(chartType === "area" ? "area" : chartType === "scatter" ? "scatter" : chartType === "bar" ? "bar" : "line", "line");
      return { name, data, type: kind };
    });
    const pie = categories.map((name, i) => ({ name, value: series[0]?.data[i] ?? 0 }));
    return { categories, series, pie };
  }

  // Wide format: one row per category, multiple numeric columns.
  const yFields = guessYFields(rows, xField, yPreferred);
  const categories = rows.map((r) => String(r[xField] ?? ""));
  const series = yFields.map((name, si) => {
    const data = rows.map((r) => asNumber(r[name]) ?? 0);
    let kind: SeriesKind = "line";
    if (chartType === "combo") kind = asSeriesKind(typeList[si], si === 0 ? "bar" : "line");
    else if (chartType === "bar") kind = "bar";
    else if (chartType === "area") kind = "area";
    else if (chartType === "scatter") kind = "scatter";
    else if (chartType === "pie") kind = "bar";
    else kind = "line";
    return { name, data, type: kind };
  });
  const first = series[0];
  const pie = categories.map((name, i) => ({ name, value: first?.data[i] ?? 0 }));
  return { categories, series, pie };
}

export function sampleDataset(): ChartRow[] {
  return [
    { category: "فروردین", power: 42, energy: 18 },
    { category: "اردیبهشت", power: 55, energy: 22 },
    { category: "خرداد", power: 61, energy: 27 },
    { category: "تیر", power: 48, energy: 25 },
    { category: "مرداد", power: 70, energy: 31 },
  ];
}
