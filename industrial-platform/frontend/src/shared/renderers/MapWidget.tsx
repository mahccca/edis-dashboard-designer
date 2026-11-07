import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { RendererProps } from "../element-registry";
import { localize } from "../i18n";
import { loadGeoCatalog, loadRegionGeo, resolveRegion } from "./geo/catalog";
import { bboxOfCollection, projectFeatures, viewportForBbox } from "./geo/project";
import type { GeoCatalog, GeoJsonFeatureCollection, MapLevel } from "./geo/types";
import styles from "./MapWidget.module.css";

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 8;
const ZOOM_STEP = 1.2;

function asLevel(raw: unknown): MapLevel {
  if (raw === "continent" || raw === "country" || raw === "province" || raw === "city" || raw === "world") return raw;
  return "country";
}

function asCssColor(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const t = raw.trim();
  if (!t) return fallback;
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(t)) return t;
  if (/^rgba?\(/.test(t) || t === "transparent" || t === "white" || t === "black") return t;
  return fallback;
}

function metricsMap(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!Array.isArray(raw)) return out;
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = String(r.id ?? r.regionId ?? r.code ?? "");
    const v = r.value ?? r.v ?? r.metric;
    if (!id || typeof v !== "number" || !Number.isFinite(v)) continue;
    out[id] = v;
  }
  return out;
}

function mixToward(hex: string, toward: string, t: number): string {
  const parse = (c: string) => {
    const h = c.replace("#", "");
    const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
    return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16));
  };
  try {
    const a = parse(hex.startsWith("#") ? hex : "#ffffff");
    const b = parse(toward.startsWith("#") ? toward : "#3d8bfd");
    if (a.some((n) => Number.isNaN(n)) || b.some((n) => Number.isNaN(n))) return hex;
    const x = Math.max(0, Math.min(1, t));
    const ch = a.map((v, i) => Math.round(v + ((b[i] ?? v) - v) * x));
    return `#${ch.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return hex;
  }
}

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

export function MapWidget({ node, spec, inputs, locale }: RendererProps) {
  const props = { ...spec.defaults, ...(node.props ?? {}) } as Record<string, unknown>;
  const title = typeof props.title === "string" ? props.title : localize(spec.name, locale);
  const level = asLevel(props.level);
  const regionId = typeof props.region === "string" && props.region.trim()
    ? props.region.trim()
    : (level === "world" ? "WORLD" : "364");
  const showLabels = props.showLabels !== false;
  const showTitle = props.showTitle === true;
  const landColor = asCssColor(props.landColor, "#ffffff");
  const strokeColor = asCssColor(props.strokeColor, "rgba(20, 28, 40, 0.55)");
  const maxHeight = typeof props.height === "number" && props.height >= 160 ? props.height : 480;

  const bound = inputs.metrics;
  const usableMetrics = bound
    && (bound.quality === "good" || bound.quality === "uncertain" || bound.quality === "stale");
  const metrics = usableMetrics ? metricsMap(bound.value) : {};

  const [catalog, setCatalog] = useState<GeoCatalog | null>(null);
  const [geo, setGeo] = useState<GeoJsonFeatureCollection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop = false;
    setLoading(true);
    setError(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    void (async () => {
      try {
        const cat = await loadGeoCatalog();
        if (stop) return;
        setCatalog(cat);
        const nodeRegion = resolveRegion(cat, level, regionId);
        if (!nodeRegion) {
          setGeo(null);
          setError(`ناحیهٔ «${regionId}» در کاتالوگ نیست`);
          return;
        }
        const preferPack = Boolean(nodeRegion.packPath) && level === "country";
        const fc = await loadRegionGeo(nodeRegion, preferPack);
        if (stop) return;
        setGeo(fc);
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : "بارگذاری نقشه ناموفق بود");
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => { stop = true; };
  }, [level, regionId]);

  const focus = useMemo(() => (geo ? bboxOfCollection(geo) : null), [geo]);
  const viewport = useMemo(
    () => (focus ? viewportForBbox(focus, 1000) : { width: 1000, height: 800, aspect: 1.25 }),
    [focus],
  );

  const paths = useMemo(() => {
    if (!geo || !focus) return [];
    // pad=0 → map touches the edges of the aspect-matched viewport.
    return projectFeatures(geo, viewport.width, viewport.height, 0, focus);
  }, [geo, focus, viewport.width, viewport.height]);

  const metricValues = Object.values(metrics);
  const mMin = metricValues.length ? Math.min(...metricValues) : 0;
  const mMax = metricValues.length ? Math.max(...metricValues) : 1;

  const crumb = catalog
    ? (() => {
      const n = resolveRegion(catalog, level, regionId);
      if (!n) return regionId;
      const label = locale === "fa" ? n.name.fa : n.name.en;
      return `${n.level} · ${label}`;
    })()
    : `${level} · ${regionId}`;

  const zoomBy = useCallback((factor: number) => {
    setZoom((z) => clampZoom(z * factor));
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => clampZoom(z * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)));
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, [loading, error]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    setPanning(true);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = stageRef.current?.getBoundingClientRect();
    const sx = rect && rect.width > 0 ? viewport.width / rect.width : 1;
    const sy = rect && rect.height > 0 ? viewport.height / rect.height : 1;
    setPan({
      x: drag.panX + (e.clientX - drag.x) * sx,
      y: drag.panY + (e.clientY - drag.y) * sy,
    });
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    setPanning(false);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  const transform = `translate(${cx + pan.x} ${cy + pan.y}) scale(${zoom}) translate(${-cx} ${-cy})`;

  return (
    <div className={styles.frame} data-renderer="builtin.map@1" data-map-level={level} data-map-region={regionId}>
      {showTitle && (
        <div className={styles.header}>
          <div className={styles.title}>{title}</div>
          <div className={styles.crumb}>{crumb}</div>
        </div>
      )}

      {loading && <div className={styles.muted}>در حال بارگذاری نقشهٔ ناحیه…</div>}
      {error && !loading && <div className={styles.muted}>{error}</div>}

      {!loading && !error && (
        <div
          ref={stageRef}
          className={`${styles.stage}${panning ? ` ${styles.stagePanning}` : ""}`}
          style={{ aspectRatio: `${viewport.width} / ${viewport.height}`, maxHeight }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className={styles.zoomBar} onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" className={styles.zoomBtn} aria-label="بزرگ‌نمایی" title="زوم +" onClick={() => zoomBy(ZOOM_STEP)}>+</button>
            <button type="button" className={styles.zoomBtn} aria-label="کوچک‌نمایی" title="زوم −" onClick={() => zoomBy(1 / ZOOM_STEP)}>−</button>
            <button type="button" className={styles.zoomBtn} aria-label="بازنشانی" title="بازنشانی" onClick={resetView}>⟲</button>
            <div className={styles.zoomLabel}>{Math.round(zoom * 100)}%</div>
          </div>
          <svg
            className={styles.svg}
            viewBox={`0 0 ${viewport.width} ${viewport.height}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={title}
          >
            <g transform={transform}>
              {paths.map((p) => {
                const metric = metrics[p.id];
                const fill = typeof metric === "number"
                  ? mixToward(landColor, "#3d8bfd", mMax === mMin ? 0.45 : (metric - mMin) / (mMax - mMin))
                  : landColor;
                const active = hoverId === p.id;
                return (
                  <g key={p.id}>
                    <path
                      className={`${styles.land}${active ? ` ${styles.landActive}` : ""}`}
                      d={p.d}
                      style={{ fill, stroke: strokeColor }}
                      onMouseEnter={() => setHoverId(p.id)}
                      onMouseLeave={() => setHoverId(null)}
                    >
                      <title>{locale === "fa" ? p.nameFa : p.nameEn}</title>
                    </path>
                    {showLabels && (level === "province" || level === "city" || paths.length <= 35) && (
                      <text className={styles.label} x={p.centroid[0]} y={p.centroid[1]}>
                        {locale === "fa" ? p.nameFa : p.nameEn}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      )}

      {hoverId && (
        <div className={styles.hint}>
          {paths.find((p) => p.id === hoverId)?.[locale === "fa" ? "nameFa" : "nameEn"] ?? hoverId}
        </div>
      )}
    </div>
  );
}
