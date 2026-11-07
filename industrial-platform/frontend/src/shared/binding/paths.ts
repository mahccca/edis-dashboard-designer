/** Normalize JSONPath-style paths for display / storage. */
export function normalizePath(path: string): string {
  const p = path.trim();
  if (!p || p === "$" || p === ".") return "$";
  if (p.startsWith("$")) return p;
  return `$.${p}`;
}

/**
 * Schema explorer emits `$[*].totals.x` which resolves to an array.
 * For scalar KPI/input bindings, pin the first parent: `$[0].totals.x`.
 */
export function concreteBindPath(path: string, type?: string): string {
  const normalized = normalizePath(path);
  if (type === "array" || type === "object") return normalized;
  return normalized.replace(/\[\*\]/g, "[0]");
}

export function pathLabel(path: string): string {
  return normalizePath(path);
}

export function samplePreview(value: unknown, max = 48): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") {
    try {
      const s = JSON.stringify(value);
      return s.length > max ? `${s.slice(0, max)}…` : s;
    } catch {
      return "[object]";
    }
  }
  const s = String(value);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
