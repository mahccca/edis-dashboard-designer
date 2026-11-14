import type { RendererProps } from "../element-registry";
import { localize } from "../i18n";
import styles from "./IndustrialPanelWidget.module.css";

const STATUS_TEXT: Record<string, { label: string; cls: string }> = {
  running: { label: "در حال کار", cls: styles.statusRunning ?? "" },
  normal: { label: "عادی", cls: styles.statusRunning ?? "" },
  standby: { label: "آماده‌باش", cls: styles.statusStandby ?? "" },
  warning: { label: "هشدار", cls: styles.statusWarning ?? "" },
  fault: { label: "خطا / تریپ", cls: styles.statusFault ?? "" },
  offline: { label: "غیرفعال", cls: styles.statusStandby ?? "" },
};

const DEFAULT_STATUS = { label: "عادی", cls: styles.statusRunning ?? "" };

function formatVal(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "number") {
    return Number.isInteger(val) ? String(val) : val.toFixed(1);
  }
  return String(val);
}

export function IndustrialPanelWidget({ node, inputs, locale = "fa" }: RendererProps) {
  const props = node.props ?? {};
  const type = String(props.equipmentType || "inverter");

  // Read dynamic bound inputs with fallback to static props
  const powerVal = formatVal(inputs.power?.value ?? inputs.primaryValue?.value ?? props.power ?? 185.4);
  const voltageVal = formatVal(inputs.voltage?.value ?? inputs.secondaryValue?.value ?? props.voltage ?? 720);
  const currentVal = formatVal(inputs.current?.value ?? props.current ?? 257.5);
  const tempVal = formatVal(inputs.temperature?.value ?? props.temperature ?? 46.2);
  const effVal = formatVal(inputs.efficiency?.value ?? props.efficiency ?? 98.6);
  const statusKey = String(inputs.status?.value ?? props.status ?? "running").toLowerCase();

  const statusInfo = STATUS_TEXT[statusKey] ?? STATUS_TEXT.running ?? DEFAULT_STATUS;

  const title = localize(props.title as never, locale) || (
    type === "solar-panel" ? "پنل خورشیدی فتوولتائیک" :
    type === "bess" ? "بانک باتری و ذخیره‌ساز" :
    type === "tank" ? "مخزن مایعات فرآیندی" :
    type === "motor" ? "الکتروپمپ سانتریفیوژ" :
    "اینورتر خورشیدی / صنعتی"
  );
  const subtitle = localize(props.subtitle as never, locale) || (
    type === "solar-panel" ? "Array A1 · 550W Monocrystalline" :
    type === "bess" ? "Lithium-Ion 200kWh ESS" :
    type === "tank" ? "Storage Tank TK-102" :
    type === "motor" ? "Booster Pump P-301" :
    "String Inverter 250kW — Online"
  );

  const icon = typeof props.icon === "string" ? props.icon : (
    type === "solar-panel" ? "☀️" :
    type === "bess" ? "🔋" :
    type === "tank" ? "🚰" :
    type === "motor" ? "⚙" :
    "⚡"
  );

  const imageUrl = typeof inputs.imageUrl?.value === "string" && inputs.imageUrl.value.trim()
    ? inputs.imageUrl.value.trim()
    : typeof props.imageUrl === "string" && props.imageUrl.trim()
    ? props.imageUrl.trim()
    : typeof props.imageSrc === "string" && props.imageSrc.trim()
    ? props.imageSrc.trim()
    : null;

  const imageHeight = typeof props.imageHeight === "number" && props.imageHeight > 0
    ? props.imageHeight
    : 110;

  return (
    <div className={styles.panel} data-equipment-type={type} dir="rtl">
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.iconBadge}>{icon}</div>
          <div className={styles.titleArea}>
            <span className={styles.title}>{title}</span>
            <span className={styles.subtitle}>{subtitle}</span>
          </div>
        </div>
        <div className={`${styles.statusBadge} ${statusInfo.cls}`}>
          <span className={styles.pulseDot} />
          <span>{statusInfo.label}</span>
        </div>
      </div>

      {/* Schematic Diagram or Custom Equipment Image */}
      <div className={styles.schematic}>
        {imageUrl ? (
          <div className={styles.customImageContainer}>
            {imageUrl.includes("<svg") ? (
              <div
                style={{ width: "100%", maxHeight: imageHeight, display: "flex", alignItems: "center", justifyContent: "center" }}
                dangerouslySetInnerHTML={{ __html: imageUrl }}
              />
            ) : (
              <img
                src={imageUrl}
                alt={title}
                className={styles.customImage}
                style={{ maxHeight: imageHeight }}
              />
            )}
            {type === "tank" && (
              <div className={styles.imageOverlayBadge}>
                سطح مخزن: {effVal}%
              </div>
            )}
          </div>
        ) : type === "inverter" ? (
          <div className={styles.inverterDiagram}>
            <div className={styles.diagramBox}>
              <span style={{ fontSize: "0.7rem", color: "#8b98a5" }}>DC ورودی</span>
              <span>{voltageVal} V</span>
            </div>
            <div className={styles.flowArrow} title="جریان تبدیل توان">➔ ⚡ ➔</div>
            <div className={styles.diagramBox} style={{ borderColor: "#38bdf8", color: "#38bdf8" }}>
              <span>∿ تبدیل</span>
              <span style={{ fontSize: "0.68rem" }}>{effVal}% بازده</span>
            </div>
            <div className={styles.flowArrow} title="جریان توان اکتیو">➔ ⚡ ➔</div>
            <div className={styles.diagramBox} style={{ borderColor: "#10b981", color: "#10b981" }}>
              <span style={{ fontSize: "0.7rem", color: "#8b98a5" }}>AC خروجی</span>
              <span>{powerVal} kW</span>
            </div>
          </div>
        ) : type === "solar-panel" ? (
          <div className={styles.solarGrid}>
            <div className={styles.solarVisual}>
              <div className={styles.solarCell} />
              <div className={styles.solarCell} />
              <div className={styles.solarCell} />
              <div className={styles.solarCell} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "0.8rem" }}>
              <span style={{ color: "#f59e0b", fontWeight: 600 }}>☀️ تابش: 885 W/m²</span>
              <span style={{ fontSize: "0.72rem", color: "#8b98a5" }}>توان آرایه: {powerVal} kW</span>
            </div>
          </div>
        ) : type === "tank" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div className={styles.tankVisual}>
              <div className={styles.tankFill} style={{ height: `${Math.min(100, Math.max(10, Number(effVal) || 75))}%` }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", fontSize: "0.8rem" }}>
              <strong>سطح مخزن: {effVal}%</strong>
              <span style={{ color: "#8b98a5", fontSize: "0.72rem" }}>فشار: {voltageVal} Bar</span>
            </div>
          </div>
        ) : type === "bess" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: "2rem" }}>🔋</span>
            <div style={{ display: "flex", flexDirection: "column", fontSize: "0.8rem" }}>
              <strong style={{ color: "#10b981" }}>شارژ (SoC): {effVal}%</strong>
              <span style={{ color: "#8b98a5", fontSize: "0.72rem" }}>توان تخلیه: {powerVal} kW</span>
            </div>
          </div>
        ) : type === "motor" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: "2rem" }}>⚙</span>
            <div style={{ display: "flex", flexDirection: "column", fontSize: "0.8rem" }}>
              <strong style={{ color: "#38bdf8" }}>سرعت دبی: {currentVal} RPM</strong>
              <span style={{ color: "#8b98a5", fontSize: "0.72rem" }}>توان مصرفی: {powerVal} kW</span>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: "2rem" }}>{icon}</span>
            <div style={{ display: "flex", flexDirection: "column", fontSize: "0.85rem" }}>
              <strong>{title}</strong>
              <span style={{ color: "#8b98a5", fontSize: "0.75rem" }}>{subtitle}</span>
            </div>
          </div>
        )}
      </div>

      {/* Metrics Grid */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>توان فعال</span>
          <div className={styles.metricValueWrap}>
            <span className={`${styles.metricValue} ${styles.highlightValue}`}>{powerVal}</span>
            <span className={styles.metricUnit}>kW</span>
          </div>
        </div>

        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>ولتاژ</span>
          <div className={styles.metricValueWrap}>
            <span className={styles.metricValue}>{voltageVal}</span>
            <span className={styles.metricUnit}>V</span>
          </div>
        </div>

        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>جریان</span>
          <div className={styles.metricValueWrap}>
            <span className={styles.metricValue}>{currentVal}</span>
            <span className={styles.metricUnit}>A</span>
          </div>
        </div>

        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>دما</span>
          <div className={styles.metricValueWrap}>
            <span className={styles.metricValue}>{tempVal}</span>
            <span className={styles.metricUnit}>°C</span>
          </div>
        </div>
      </div>
    </div>
  );
}
