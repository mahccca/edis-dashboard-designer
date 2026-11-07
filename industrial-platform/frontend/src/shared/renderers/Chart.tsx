import { useEffect, useRef } from "react";
import type { EChartsType } from "echarts/core";
import { init, use } from "echarts/core";
import { BarChart, LineChart, PieChart, ScatterChart } from "echarts/charts";
import {
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { RendererProps } from "../element-registry";
import { localize } from "../i18n";
import { normalizeChart, type ChartKind } from "./chartData";
import styles from "./Chart.module.css";

use([
  LineChart,
  BarChart,
  PieChart,
  ScatterChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  DatasetComponent,
  CanvasRenderer,
]);

function asChartKind(raw: unknown): ChartKind {
  if (raw === "bar" || raw === "area" || raw === "pie" || raw === "scatter" || raw === "combo") return raw;
  return "line";
}

function usableBinding(v: RendererProps["inputs"][string]): unknown {
  if (!v) return undefined;
  if (v.quality === "good" || v.quality === "uncertain" || v.quality === "stale") return v.value;
  return undefined;
}

export function Chart({ node, spec, inputs, locale }: RendererProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);

  const props = { ...spec.defaults, ...(node.props ?? {}) } as Record<string, unknown>;
  const title = typeof props.title === "string" ? props.title : localize(spec.name, locale);
  const chartType = asChartKind(props.chartType);
  const height = typeof props.height === "number" && props.height >= 120 ? props.height : 240;
  const showLegend = props.showLegend !== false;
  const stacked = props.stacked === true;
  const smooth = props.smooth !== false;
  const dualAxis = props.dualAxis === true;

  const bound = usableBinding(inputs.dataset);
  const raw = bound;
  const hasData = raw !== undefined;
  const normalized = normalizeChart(raw ?? [], {
    chartType,
    xField: typeof props.xField === "string" ? props.xField : undefined,
    yFields: typeof props.yFields === "string" ? props.yFields : undefined,
    seriesField: typeof props.seriesField === "string" ? props.seriesField : undefined,
    seriesTypes: typeof props.seriesTypes === "string" ? props.seriesTypes : undefined,
    dualAxis,
  });

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const chart = init(el, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    const ro = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => chart.resize())
      : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (!hasData || (!normalized.categories.length && !normalized.pie.length)) {
      chart.clear();
      return;
    }

    const textColor = "var(--color-text-muted, #8b98a5)";
    if (chartType === "pie") {
      chart.setOption({
        color: ["#3d8bfd", "#3fb950", "#d29922", "#a371f7", "#f85149", "#39c5cf"],
        tooltip: { trigger: "item" },
        legend: showLegend ? { bottom: 0, textStyle: { color: textColor } } : undefined,
        series: [{
          type: "pie",
          radius: ["36%", "68%"],
          data: normalized.pie,
          label: { color: textColor },
        }],
      }, true);
      return;
    }

    const useDual = dualAxis && chartType === "combo" && normalized.series.length > 1;
    chart.setOption({
      color: ["#3d8bfd", "#3fb950", "#d29922", "#a371f7", "#f85149", "#39c5cf"],
      tooltip: { trigger: "axis" },
      legend: showLegend ? { top: 0, textStyle: { color: textColor } } : undefined,
      grid: { left: 40, right: useDual ? 48 : 16, top: showLegend ? 36 : 16, bottom: 28 },
      xAxis: {
        type: "category",
        data: normalized.categories,
        axisLabel: { color: textColor },
        axisLine: { lineStyle: { color: "#2a3440" } },
      },
      yAxis: useDual
        ? [
          { type: "value", axisLabel: { color: textColor }, splitLine: { lineStyle: { color: "#2a3440" } } },
          { type: "value", axisLabel: { color: textColor }, splitLine: { show: false } },
        ]
        : { type: "value", axisLabel: { color: textColor }, splitLine: { lineStyle: { color: "#2a3440" } } },
      series: normalized.series.map((s, i) => {
        const type = s.type === "area" ? "line" : s.type;
        return {
          name: s.name,
          type,
          data: s.data,
          smooth: type === "line" ? smooth : undefined,
          areaStyle: s.type === "area" ? { opacity: 0.25 } : undefined,
          stack: stacked && (s.type === "bar" || s.type === "area") ? "total" : undefined,
          yAxisIndex: useDual && i > 0 ? 1 : 0,
        };
      }),
    }, true);
  }, [chartType, dualAxis, hasData, normalized, showLegend, smooth, stacked]);

  return (
    <div className={styles.frame} data-renderer="builtin.chart@1" data-chart-type={chartType}>
      {title ? <div className={styles.title}>{title}</div> : null}
      {!hasData ? (
        <div className={styles.muted}>دادهٔ نمودار را از API بایند کنید (ورودی dataset)</div>
      ) : !normalized.categories.length && !normalized.pie.length ? (
        <div className={styles.muted}>ساختار داده برای نمودار قابل تشخیص نیست</div>
      ) : (
        <div ref={hostRef} className={styles.canvas} style={{ height }} />
      )}
    </div>
  );
}
