import { useRef, type CSSProperties, type MouseEvent } from "react";
import type { RendererProps } from "../element-registry";
import { localize, type Locale } from "../i18n";
import { KPI_PARTS, readPartStyle, resolvePartStyle } from "../style-engine/parts";
import { PartResizeHandle } from "../ui/PartResizeHandle";
import { TestDataBadge } from "../ui/TestDataBadge";
import styles from "./KpiCard.module.css";

const QUALITY_LABEL: Record<string, { fa: string; en: string }> = {
  stale: { fa: "قدیمی", en: "Stale" },
  no_data: { fa: "بدون داده", en: "No data" },
  bad: { fa: "نامعتبر", en: "Bad quality" },
  uncertain: { fa: "نامطمئن", en: "Uncertain" },
  loading: { fa: "در حال دریافت", en: "Loading" },
};

const DEFAULT_FONT = {
  title: 14,
  value: 36,
  unit: 16,
  footer: 12,
  card: 14,
} as const;

function formatNumber(value: number, decimals: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatTime(iso: string, locale: Locale): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString(locale === "fa" ? "fa-IR" : "en-GB", { hour12: false });
}

function partClass(active: boolean, focused: boolean): string {
  if (!active) return "";
  return `${styles.styleable}${focused ? ` ${styles.styleFocused}` : ""}`;
}

function num(style: CSSProperties, key: "width" | "height" | "fontSize", fallback: number): number {
  const raw = style[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function KpiCard({ node, spec, inputs, testData, locale, appearanceMode = "night", pagePartBag = {}, styleEdit }: RendererProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const valueRef = useRef<HTMLDivElement>(null);
  const unitRef = useRef<HTMLSpanElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const mode = styleEdit?.appearanceMode ?? appearanceMode;

  const props = { ...spec.defaults, ...(node.props ?? {}) } as Record<string, unknown>;
  const decimals = typeof props.decimals === "number" ? props.decimals : 1;
  const v = inputs.value;
  const rawValue = Array.isArray(v?.value) && v.value.length === 1 ? v.value[0] : v?.value;
  const usableQuality = v != null
    && (v.quality === "good" || v.quality === "uncertain" || v.quality === "stale");
  const asNumber = usableQuality
    ? (typeof rawValue === "number" && Number.isFinite(rawValue)
      ? rawValue
      : (typeof rawValue === "string" && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(rawValue.trim())
        ? Number(rawValue.trim())
        : null))
    : null;
  const numeric = asNumber !== null;
  const textValue = usableQuality && !numeric && rawValue !== null && rawValue !== undefined
    && (typeof rawValue === "string" || typeof rawValue === "boolean")
    ? String(rawValue)
    : null;
  const quality = v ? v.quality : "loading";
  const isTest = Boolean(v?.isTestData ?? testData.value ?? testData.title);

  const titleBound = inputs.title;
  const titleRaw = Array.isArray(titleBound?.value) && titleBound.value.length === 1
    ? titleBound.value[0]
    : titleBound?.value;
  const titleFromBind = titleBound
    && titleRaw !== null && titleRaw !== undefined
    && (titleBound.quality === "good" || titleBound.quality === "uncertain" || titleBound.quality === "stale")
    ? String(titleRaw)
    : null;

  let severity = "normal";
  if (numeric && asNumber !== null) {
    if (typeof props.critBelow === "number" && asNumber < props.critBelow) severity = "critical";
    else if (typeof props.warnBelow === "number" && asNumber < props.warnBelow) severity = "warning";
  }

  const label = QUALITY_LABEL[quality];
  const cardStyle = resolvePartStyle(node, "card", mode, pagePartBag) as CSSProperties;
  const titleStyle = resolvePartStyle(node, "title", mode, pagePartBag) as CSSProperties;
  const valueStyle = resolvePartStyle(node, "value", mode, pagePartBag) as CSSProperties;
  const unitStyle = resolvePartStyle(node, "unit", mode, pagePartBag) as CSSProperties;
  const footerStyle = resolvePartStyle(node, "footer", mode, pagePartBag) as CSSProperties;
  const valueClass = valueStyle.color ? styles.value : `${styles.value} ${styles[severity] ?? ""}`;

  // Explicit size must win over the stretching column flex parent.
  if (cardStyle.width !== undefined || cardStyle.height !== undefined) {
    cardStyle.alignSelf = "flex-start";
    cardStyle.flex = "0 0 auto";
    cardStyle.maxWidth = "100%";
  }

  const editing = Boolean(styleEdit?.active);
  const focusPart = styleEdit?.focus?.nodeId === node.id ? styleEdit.focus.part : null;
  const storedCard = readPartStyle(node, "card", mode, pagePartBag);

  const pick = (part: string) => (e: MouseEvent) => {
    if (!styleEdit?.active) return;
    e.stopPropagation();
    e.preventDefault();
    styleEdit.onPickPart(node.id, part, KPI_PARTS, (e.currentTarget as HTMLElement).getBoundingClientRect());
  };

  const patch = (part: string, key: string, value: number) => {
    styleEdit?.onPatchPart(node.id, part, key, value);
  };

  const measured = (el: HTMLElement | null, fallbackW: number, fallbackH: number, fallbackFont: number) => ({
    width: el?.offsetWidth || fallbackW,
    height: el?.offsetHeight || fallbackH,
    fontSize: Number.parseFloat(getComputedStyle(el ?? document.body).fontSize) || fallbackFont,
  });

  return (
    <div
      ref={cardRef}
      className={`${styles.card} ${styles[`size-${String(props.size ?? "md")}`] ?? ""} ${partClass(editing, focusPart === "card")}`}
      style={cardStyle}
      data-quality={quality}
      data-severity={severity}
      data-test-data={isTest ? "true" : "false"}
      data-style-part="card"
      onClick={pick("card")}
    >
      <div className={styles.header}>
        <span
          ref={titleRef}
          className={`${styles.title} ${partClass(editing, focusPart === "title")}`}
          style={titleStyle}
          data-style-part="title"
          onClick={pick("title")}
        >
          {titleFromBind ?? localize(props.title as never, locale)}
          {editing && focusPart === "title" && (
            <PartResizeHandle
              mode="font"
              label="تغییر اندازه عنوان"
              start={measured(titleRef.current, 120, 20, num(titleStyle, "fontSize", DEFAULT_FONT.title))}
              onResizeStart={() => styleEdit?.onResizeStart()}
              onResize={(n) => { if (n.fontSize != null) patch("title", "fontSize", n.fontSize); }}
            />
          )}
        </span>
        {isTest && <TestDataBadge />}
      </div>
      <div
        ref={valueRef}
        className={`${valueClass} ${partClass(editing, focusPart === "value")}`}
        style={valueStyle}
        data-style-part="value"
        onClick={pick("value")}
      >
        {numeric && asNumber !== null
          ? formatNumber(asNumber, decimals, locale)
          : (textValue !== null
            ? <span className={styles.textValue} dir="auto">{textValue}</span>
            : <span className={styles.missing}>—</span>)}
        {numeric && props.showUnit !== false && v?.unit ? (
          <span
            ref={unitRef}
            className={`${styles.unit} ${partClass(editing, focusPart === "unit")}`}
            style={unitStyle}
            data-style-part="unit"
            onClick={pick("unit")}
          >
            {v.unit}
            {editing && focusPart === "unit" && (
              <PartResizeHandle
                mode="font"
                label="تغییر اندازه واحد"
                start={measured(unitRef.current, 40, 20, num(unitStyle, "fontSize", DEFAULT_FONT.unit))}
                onResizeStart={() => styleEdit?.onResizeStart()}
                onResize={(n) => { if (n.fontSize != null) patch("unit", "fontSize", n.fontSize); }}
              />
            )}
          </span>
        ) : null}
        {editing && focusPart === "value" && (
          <PartResizeHandle
            mode="font"
            label="تغییر اندازه مقدار"
            start={measured(valueRef.current, 120, 40, num(valueStyle, "fontSize", DEFAULT_FONT.value))}
            onResizeStart={() => styleEdit?.onResizeStart()}
            onResize={(n) => { if (n.fontSize != null) patch("value", "fontSize", n.fontSize); }}
          />
        )}
      </div>
      <div
        ref={footerRef}
        className={`${styles.footer} ${partClass(editing, focusPart === "footer")}`}
        style={footerStyle}
        data-style-part="footer"
        onClick={pick("footer")}
      >
        {label && <span className={styles.quality}>{label[locale]}</span>}
        {v?.sourceTimestamp && <time dateTime={v.sourceTimestamp}>{formatTime(v.sourceTimestamp, locale)}</time>}
        {editing && focusPart === "footer" && (
          <PartResizeHandle
            mode="font"
            label="تغییر اندازه پاورقی"
            start={measured(footerRef.current, 160, 18, num(footerStyle, "fontSize", DEFAULT_FONT.footer))}
            onResizeStart={() => styleEdit?.onResizeStart()}
            onResize={(n) => { if (n.fontSize != null) patch("footer", "fontSize", n.fontSize); }}
          />
        )}
      </div>
      {editing && focusPart === "card" && (
        <PartResizeHandle
          mode="box"
          label="تغییر اندازه کارت"
          start={{
            width: typeof storedCard.width === "number" ? storedCard.width : (cardRef.current?.offsetWidth || 240),
            height: typeof storedCard.height === "number" ? storedCard.height : (cardRef.current?.offsetHeight || 120),
            fontSize: num(cardStyle, "fontSize", DEFAULT_FONT.card),
          }}
          onResizeStart={() => styleEdit?.onResizeStart()}
          onResize={(n) => {
            if (n.width != null) patch("card", "width", n.width);
            if (n.height != null) patch("card", "height", n.height);
          }}
        />
      )}
    </div>
  );
}
