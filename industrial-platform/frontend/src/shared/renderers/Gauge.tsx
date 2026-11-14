import type { BindingValue } from "../api/types";
import type { RendererProps } from "../element-registry";
import { localize } from "../i18n";
import styles from "./Gauge.module.css";

function asNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(raw.trim())) return Number(raw.trim());
  return null;
}

function bindingNumber(v: BindingValue | undefined): number | null {
  if (!v) return null;
  if (!(v.quality === "good" || v.quality === "uncertain" || v.quality === "stale")) return null;
  const raw = Array.isArray(v.value) && v.value.length === 1 ? v.value[0] : v.value;
  return asNumber(raw);
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(endDeg));
  const y2 = cy + r * Math.sin(toRad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

export function Gauge({ node, spec, inputs, locale }: RendererProps) {
  const props = { ...spec.defaults, ...(node.props ?? {}) } as Record<string, unknown>;
  const title = typeof props.title === "string" ? props.title : localize(spec.name, locale);
  const unit = typeof props.unit === "string" ? props.unit : "";
  const propMin = typeof props.min === "number" ? props.min : 0;
  const propMax = typeof props.max === "number" ? props.max : propMin + 100;
  const decimals = typeof props.decimals === "number" ? props.decimals : 1;
  const warnAbove = typeof props.warnAbove === "number" ? props.warnAbove : null;
  const critAbove = typeof props.critAbove === "number" ? props.critAbove : null;
  const customColor = typeof props.color === "string" && props.color.trim()
    ? props.color.trim()
    : typeof props.barColor === "string" && props.barColor.trim()
    ? props.barColor.trim()
    : null;
  const trackColor = typeof props.trackColor === "string" && props.trackColor.trim()
    ? props.trackColor.trim()
    : "var(--color-border-subtle, #2a3440)";
  const bgImage = typeof props.backgroundImage === "string" && props.backgroundImage.trim()
    ? props.backgroundImage.trim()
    : typeof props.imageUrl === "string" && props.imageUrl.trim()
    ? props.imageUrl.trim()
    : null;
  const showNeedle = Boolean(props.showNeedle) || Boolean(bgImage);
  const showArc = props.showArc !== false;

  const boundMin = bindingNumber(inputs.min);
  const boundMax = bindingNumber(inputs.max);
  const min = boundMin ?? propMin;
  let max = boundMax ?? propMax;
  if (!(max > min)) max = min + 100;

  const v = inputs.value;
  const usable = v != null && (v.quality === "good" || v.quality === "uncertain" || v.quality === "stale");
  const numeric = usable ? bindingNumber(v) : null;
  const span = max - min;
  const ratio = numeric == null || span <= 0 ? 0 : Math.max(0, Math.min(1, (numeric - min) / span));

  let needleColor = customColor ?? "var(--color-accent-primary, #3d8bfd)";
  if (numeric != null && critAbove != null && numeric >= critAbove) needleColor = "var(--color-status-critical, #f85149)";
  else if (numeric != null && warnAbove != null && numeric >= warnAbove) needleColor = "var(--color-status-warning, #d29922)";

  const cx = 100;
  const cy = 90;
  const r = 70;
  const start = 180;
  const end = 180 + 180 * ratio;
  const needleAngle = -90 + 180 * ratio;
  const display = numeric == null
    ? "—"
    : new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(numeric);

  return (
    <div className={styles.frame} data-renderer="builtin.gauge@1" data-min={String(min)} data-max={String(max)}>
      {title ? <div className={styles.title}>{title}</div> : null}
      <svg className={styles.svg} viewBox="0 0 200 120" role="img" aria-label={title}>
        {bgImage && (
          <image
            href={bgImage}
            xlinkHref={bgImage}
            x="10"
            y="5"
            width="180"
            height="105"
            preserveAspectRatio="xMidYMid meet"
          />
        )}
        {showArc && (
          <>
            <path
              d={arcPath(cx, cy, r, 180, 360)}
              fill="none"
              stroke={trackColor}
              strokeWidth={bgImage ? "6" : "12"}
              opacity={bgImage ? 0.35 : 1}
              strokeLinecap="round"
            />
            {numeric != null ? (
              <path
                d={arcPath(cx, cy, r, start, end)}
                fill="none"
                stroke={needleColor}
                strokeWidth={bgImage ? "6" : "12"}
                opacity={bgImage ? 0.85 : 1}
                strokeLinecap="round"
              />
            ) : null}
          </>
        )}
        {showNeedle && numeric != null ? (
          <g transform={`rotate(${needleAngle}, ${cx}, ${cy})`} style={{ transition: "transform 0.4s ease" }}>
            <polygon
              points={`${cx - 3.5},${cy} ${cx + 3.5},${cy} ${cx},${cy - r + 8}`}
              fill={needleColor}
              style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}
            />
            <circle cx={cx} cy={cy} r="6" fill={needleColor} stroke="#ffffff" strokeWidth="1.5" />
          </g>
        ) : !showNeedle ? (
          <circle cx={cx} cy={cy} r="4" fill={needleColor} />
        ) : null}
      </svg>
      <div className={styles.valueRow}>
        <span>{display}</span>
        {unit ? <span className={styles.unit}>{unit}</span> : null}
      </div>
      <div className={styles.muted} style={{ fontSize: "0.75rem" }}>
        {new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(min)}
        {" — "}
        {new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(max)}
      </div>
      {!usable && <div className={styles.muted}>{v ? "بدون داده" : "در حال دریافت…"}</div>}
    </div>
  );
}
