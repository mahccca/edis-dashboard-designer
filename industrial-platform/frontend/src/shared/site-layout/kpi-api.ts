import { useEffect, useRef, useState } from "react";
import type { HeaderKpiWidget } from "./types";

/**
 * Extracts a value from a JSON response given a dot-notation or JSONPath string.
 * Examples:
 *   "value" -> data.value
 *   "$.data.metrics[0].power" -> data.data.metrics[0].power
 *   "scada.temperature" -> data.scada.temperature
 */
export function extractJsonValue(data: unknown, path?: string): unknown {
  if (!path || !path.trim()) return data;
  let p = path.trim();
  if (p.startsWith("$.")) p = p.slice(2);
  else if (p.startsWith("$")) p = p.slice(1);
  if (!p) return data;

  const normalized = p.replace(/\[(\w+)\]/g, ".$1");
  const segments = normalized.split(".").filter(Boolean);

  let cur: unknown = data;
  for (const seg of segments) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}

export function formatKpiValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "number") {
    if (Number.isInteger(val)) return val.toLocaleString();
    return Number(val.toFixed(2)).toLocaleString();
  }
  if (typeof val === "boolean") return val ? "فعال" : "غیرفعال";
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    if ("value" in obj && obj.value !== undefined) {
      return formatKpiValue(obj.value);
    }
    return JSON.stringify(val);
  }
  return String(val);
}

export interface LiveKpiState {
  value: string;
  unit?: string;
  status?: "good" | "warn" | "crit";
  lastUpdated: number;
}

/**
 * React hook that polls live APIs for header KPI widgets configured with dataSourceType === "api".
 */
export function useHeaderKpiPoller(
  widgets?: HeaderKpiWidget[]
): Record<string, LiveKpiState> {
  const [liveMap, setLiveMap] = useState<Record<string, LiveKpiState>>({});
  const activeWidgets = useRef<HeaderKpiWidget[]>([]);
  activeWidgets.current = widgets ?? [];

  useEffect(() => {
    const list = widgets?.filter((w) => w.dataSourceType === "api" && Boolean(w.apiUrl)) ?? [];
    if (list.length === 0) {
      setLiveMap({});
      return;
    }

    let isMounted = true;
    const timers: ReturnType<typeof setInterval>[] = [];

    const fetchSingle = async (widget: HeaderKpiWidget) => {
      if (!widget.apiUrl) return;
      try {
        const res = await fetch(widget.apiUrl, {
          method: widget.apiMethod || "GET",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const extracted = extractJsonValue(json, widget.apiJsonPath);

        let parsedVal = formatKpiValue(extracted);
        let parsedUnit = widget.unit;
        let parsedStatus = widget.status;

        // If the extracted payload is a rich object with { value, unit, status }
        if (extracted && typeof extracted === "object" && !Array.isArray(extracted)) {
          const rec = extracted as Record<string, unknown>;
          if ("value" in rec) parsedVal = formatKpiValue(rec.value);
          if (typeof rec.unit === "string") parsedUnit = rec.unit;
          if (rec.status === "good" || rec.status === "warn" || rec.status === "crit") {
            parsedStatus = rec.status;
          }
        }

        if (isMounted) {
          setLiveMap((prev) => ({
            ...prev,
            [widget.id]: {
              value: parsedVal,
              unit: parsedUnit,
              status: parsedStatus,
              lastUpdated: Date.now(),
            },
          }));
        }
      } catch {
        // Keep previous value on failure, or mark warn if never loaded
        if (isMounted) {
          setLiveMap((prev) => {
            if (prev[widget.id]) return prev;
            return {
              ...prev,
              [widget.id]: {
                value: widget.value,
                unit: widget.unit,
                status: "warn",
                lastUpdated: Date.now(),
              },
            };
          });
        }
      }
    };

    // Initial fetch for all
    for (const w of list) {
      void fetchSingle(w);
      const intervalMs = Math.max((w.apiRefreshSeconds || 5) * 1000, 1000);
      const timer = setInterval(() => {
        void fetchSingle(w);
      }, intervalMs);
      timers.push(timer);
    }

    return () => {
      isMounted = false;
      for (const t of timers) clearInterval(t);
    };
  }, [widgets]);

  return liveMap;
}

/**
 * Utility to test an API endpoint and JSONPath directly from SiteLayoutStudio
 */
export async function testApiEndpoint(
  url: string,
  method = "GET",
  jsonPath?: string
): Promise<{ success: boolean; formatted?: string; raw?: unknown; error?: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return { success: false, error: `پاسخ سرور با کد ${res.status} (${res.statusText})` };
    }
    const json = await res.json();
    const extracted = extractJsonValue(json, jsonPath);
    return {
      success: true,
      formatted: formatKpiValue(extracted),
      raw: extracted,
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "خطا در اتصال به آدرس API",
    };
  }
}
