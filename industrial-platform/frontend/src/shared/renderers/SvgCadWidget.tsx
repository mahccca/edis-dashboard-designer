import { useMemo, useState } from "react";
import type { BindingValue } from "../api/types";
import type { RendererProps } from "../element-registry";
import { localize } from "../i18n";
import styles from "./SvgCadWidget.module.css";

export interface SvgHotspot {
  id: string;
  x: number; // 0 to 100 percentage
  y: number; // 0 to 100 percentage
  inputKey: string;
  label?: string;
  unit?: string;
  displayType?: "badge" | "lamp" | "level" | "gauge";
  color?: string;
  warnAbove?: number;
  critAbove?: number;
}

const DEFAULT_SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="100%" height="100%">
  <defs>
    <linearGradient id="tankGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="50%" stop-color="#334155"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <linearGradient id="pipeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0284c7"/>
      <stop offset="100%" stop-color="#0369a1"/>
    </linearGradient>
    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="800" height="450" fill="url(#grid)" />
  <!-- Piping Line 1 -->
  <path d="M 80 180 L 260 180 L 260 220 L 460 220 L 460 180 L 700 180" fill="none" stroke="#38bdf8" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>
  <path d="M 80 180 L 260 180 L 260 220 L 460 220 L 460 180 L 700 180" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="8 12" opacity="0.6"/>
  <!-- Primary Vessel / Tank -->
  <rect x="220" y="80" width="120" height="180" rx="20" fill="url(#tankGrad)" stroke="#38bdf8" stroke-width="3"/>
  <ellipse cx="280" cy="80" rx="60" ry="15" fill="#475569" stroke="#38bdf8" stroke-width="2"/>
  <text x="280" y="140" fill="#94a3b8" font-size="14" font-weight="bold" text-anchor="middle">REACTION TANK</text>
  <text x="280" y="160" fill="#38bdf8" font-size="12" text-anchor="middle">TK-201</text>
  <!-- Pump / Motor -->
  <circle cx="500" cy="220" r="32" fill="#1e293b" stroke="#10b981" stroke-width="3"/>
  <path d="M 500 195 L 525 240 L 475 240 Z" fill="#10b981" opacity="0.75"/>
  <text x="500" y="270" fill="#10b981" font-size="12" font-weight="bold" text-anchor="middle">PUMP P-101</text>
  <!-- Valve 1 -->
  <polygon points="140,165 180,195 180,165 140,195" fill="#f59e0b" stroke="#ffffff" stroke-width="1.5"/>
  <line x1="160" y1="180" x2="160" y2="160" stroke="#ffffff" stroke-width="2"/>
  <circle cx="160" cy="158" r="5" fill="#f59e0b"/>
  <text x="160" y="215" fill="#cbd5e1" font-size="11" text-anchor="middle">FCV-101</text>
  <!-- Heat Exchanger -->
  <rect x="600" y="130" width="80" height="100" rx="8" fill="#1e293b" stroke="#ec4899" stroke-width="2.5"/>
  <path d="M 615 150 Q 640 165 665 150 T 665 190" fill="none" stroke="#ec4899" stroke-width="2"/>
  <text x="640" y="215" fill="#ec4899" font-size="11" text-anchor="middle">HEX-301</text>
</svg>`;

function sanitizeSvg(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/javascript:/gi, "");
}

function formatValue(v: BindingValue | undefined, fallback = 0): { text: string; num: number | null } {
  if (!v || v.quality === "no_data") return { text: String(fallback), num: fallback };
  const raw = v.value;
  if (raw === null || raw === undefined) return { text: "—", num: null };
  if (typeof raw === "number") {
    return {
      text: Number.isInteger(raw) ? String(raw) : raw.toFixed(1),
      num: raw,
    };
  }
  return { text: String(raw), num: Number(raw) || null };
}

function wrapImageInSvg(url: string, width = 800, height = 500): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
  <rect width="${width}" height="${height}" fill="#0f172a" />
  <image href="${url}" xlink:href="${url}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" />
</svg>`;
}

export function SvgCadWidget({ node, spec, inputs, locale = "fa" }: RendererProps) {
  const props = { ...spec.defaults, ...(node.props ?? {}) } as Record<string, unknown>;
  const title = typeof props.title === "string" ? props.title : localize(spec.name, locale);

  let rawSvg = typeof props.svgContent === "string" && props.svgContent.trim()
    ? props.svgContent.trim()
    : "";

  if (!rawSvg) {
    const fallbackImg = typeof props.imageUrl === "string" && props.imageUrl.trim()
      ? props.imageUrl.trim()
      : typeof props.backgroundImage === "string" && props.backgroundImage.trim()
      ? props.backgroundImage.trim()
      : typeof props.imageSrc === "string" && props.imageSrc.trim()
      ? props.imageSrc.trim()
      : "";
    if (fallbackImg) {
      rawSvg = fallbackImg.includes("<svg") ? fallbackImg : wrapImageInSvg(fallbackImg);
    }
  }

  if (rawSvg && !rawSvg.includes("<svg")) {
    rawSvg = wrapImageInSvg(rawSvg);
  }

  if (!rawSvg) {
    rawSvg = DEFAULT_SAMPLE_SVG;
  }

  const sanitized = useMemo(() => sanitizeSvg(rawSvg), [rawSvg]);
  const [zoom, setZoom] = useState(1);
  const [showHotspots, setShowHotspots] = useState(true);

  const hotspots = useMemo<SvgHotspot[]>(() => {
    if (Array.isArray(props.hotspots)) return props.hotspots as SvgHotspot[];
    // Default sample hotspots if none configured
    return [
      { id: "h1", x: 35, y: 35, inputKey: "tank_level", label: "سطح مخزن TK-201", unit: "%", displayType: "badge" },
      { id: "h2", x: 20, y: 40, inputKey: "valve_pressure", label: "فشار خط", unit: "Bar", displayType: "badge" },
      { id: "h3", x: 62.5, y: 52, inputKey: "pump_status", label: "وضعیت پمپ P-101", unit: "RPM", displayType: "lamp" },
      { id: "h4", x: 80, y: 38, inputKey: "temp_hex", label: "دمای مبدل", unit: "°C", displayType: "badge" },
    ];
  }, [props.hotspots]);

  return (
    <div className={styles.container} data-renderer="builtin.svg-cad@1" dir="rtl">
      {/* Header Toolbar */}
      <div className={styles.header}>
        <div className={styles.title}>
          <span>📐</span>
          <span>{title || "نقشه و دیاگرام صنعتی (CAD / SVG)"}</span>
        </div>
        <div className={styles.toolbar}>
          <button type="button" className={styles.toolBtn} onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))} title="بزرگ‌نمایی">
            +
          </button>
          <button type="button" className={styles.toolBtn} onClick={() => setZoom(1)} title="بازنشانی اندازه">
            100%
          </button>
          <button type="button" className={styles.toolBtn} onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))} title="کوچک‌نمایی">
            -
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => setShowHotspots((s) => !s)}
            style={{ color: showHotspots ? "#38bdf8" : "#8b98a5" }}
            title="تغییر وضعیت نمایش نقاط داده"
          >
            {showHotspots ? "نقاط داده: روشن" : "نقاط داده: خاموش"}
          </button>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className={styles.canvasWrapper} style={{ minHeight: typeof props.height === "number" ? props.height : 360 }}>
        <div
          className={styles.svgViewport}
          style={{ transform: `scale(${zoom})`, transformOrigin: "center center", transition: "transform 0.2s ease" }}
        >
          {/* Raw Rendered AutoCAD / Canvas SVG */}
          <div
            className={styles.svgContent}
            dangerouslySetInnerHTML={{ __html: sanitized }}
          />

          {/* Dynamic Telemetry Hotspots Overlay */}
          {showHotspots &&
            hotspots.map((h) => {
              const boundVal = inputs[h.inputKey];
              const { text: valText, num } = formatValue(boundVal, 75);
              const isCrit = num !== null && h.critAbove !== undefined && num >= h.critAbove;
              const isWarn = num !== null && h.warnAbove !== undefined && num >= h.warnAbove;

              return (
                <div
                  key={h.id}
                  className={styles.hotspot}
                  style={{ left: `${h.x}%`, top: `${h.y}%` }}
                  title={`${h.label || h.inputKey}: ${valText} ${h.unit || ""}`}
                >
                  {h.displayType === "lamp" ? (
                    <div className={`${styles.lampIndicator} ${isCrit ? styles.lampCrit : isWarn ? styles.lampWarn : ""}`}>
                      <div className={styles.lampPulse} />
                    </div>
                  ) : h.displayType === "level" ? (
                    <div className={styles.levelBarContainer}>
                      <div className={styles.levelBarTrack}>
                        <div className={styles.levelBarFill} style={{ height: `${Math.min(100, Math.max(0, num ?? 50))}%` }} />
                      </div>
                      <span className={styles.levelValueText}>{valText}%</span>
                    </div>
                  ) : (
                    <div
                      className={styles.badgeCard}
                      style={{
                        borderColor: isCrit ? "#ef4444" : isWarn ? "#f59e0b" : h.color || "rgba(56, 189, 248, 0.45)",
                      }}
                    >
                      {h.label && <span className={styles.badgeLabel}>{h.label}</span>}
                      <div className={styles.badgeValueRow} style={{ color: isCrit ? "#ef4444" : isWarn ? "#f59e0b" : h.color || "#38bdf8" }}>
                        <span>{valText}</span>
                        {h.unit && <span className={styles.badgeUnit}>{h.unit}</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

