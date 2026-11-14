import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, http } from "../../shared/api/http";
import type { BindingJson, BindingPrimitive, BindingValue, ComponentSpec, ComponentSummary, Project } from "../../shared/api/types";
import { getRenderer } from "../../shared/element-registry";
import { localize } from "../../shared/i18n";
import { convertDxfToSvg } from "../../shared/cad/dxfToSvg";
import type { SvgHotspot } from "../../shared/renderers/SvgCadWidget";
import ui from "../../shared/ui/controls.module.css";
import styles from "./ComponentStudio.module.css";
import { VisualCadDesignerModal } from "./VisualCadDesignerModal";

export const RENDERER_METADATA: Record<string, { labelFa: string; icon: string; desc: string }> = {
  "builtin.kpi-card@1": { labelFa: "کارت شاخص عددی (KPI Card)", icon: "📊", desc: "شاخص لحظه‌ای، واحد و وضعیت" },
  "builtin.gauge@1": { labelFa: "گیج عقربه‌ای / مدرج (Gauge)", icon: "⏱️", desc: "نمایش زاویه‌ای، نواری و سطوح هشدار" },
  "builtin.chart@1": { labelFa: "نمودار روند و سری زمانی (Trend Chart)", icon: "📈", desc: "نمودار خطی/میله‌ای تله‌متری" },
  "builtin.map@1": { labelFa: "نقشه جغرافیایی و GIS (GIS Map)", icon: "🗺️", desc: "جانمایی و لایه‌های ژئورفرنس" },
  "builtin.industrial-panel@1": { labelFa: "پنل پیشرفته تجهیزات صنعتی (Equipment Panel)", icon: "⚙️", desc: "تجهیزات چندپارامتری، اینورتر، باتری و پمپ" },
  "builtin.svg-cad@1": { labelFa: "نقشه و دیاگرام CAD / SVG (P&ID)", icon: "📐", desc: "نقشه‌های وکتور اتوکد و نقاط داده" },
  "builtin.model-3d@1": { labelFa: "مدل و انیمیشن سه‌بعدی (3D Interactive)", icon: "🧊", desc: "مدل تعاملی 3D با پایش دور و دما" },
  "builtin.image@1": { labelFa: "تصویر استاتیک (Image Widget)", icon: "🖼️", desc: "شماتیک یا تصویر ثابت تجهیز" },
};

export const CATEGORY_METADATA: Record<string, { labelFa: string; icon: string }> = {
  kpi: { labelFa: "شاخص و متریک (KPI)", icon: "📊" },
  gauge: { labelFa: "گیج و سطح‌سنج (Gauge)", icon: "⏱️" },
  chart: { labelFa: "نمودار و تاریخچه (Chart)", icon: "📈" },
  control: { labelFa: "فرمان و کنترل تجهیزات (Control)", icon: "⚙️" },
  status: { labelFa: "وضعیت و هشدارها (Status)", icon: "🔔" },
  table: { labelFa: "جدول داده (Table)", icon: "📋" },
  symbol: { labelFa: "نماد و دیاگرام (Symbol)", icon: "🏷️" },
  layout: { labelFa: "چیدمان و ساختار (Layout)", icon: "▦" },
  text: { labelFa: "متن و برچسب (Text)", icon: "🔤" },
};

type RendererInfo = { rendererId: string; category: string; supportedInputs: string[]; description?: string };

type PropDraft = { key: string; labelFa: string; type: "string" | "number" | "integer" | "boolean" | "enum"; enumText: string };
type InputDraft = {
  key: string;
  dataType: "number" | "integer" | "boolean" | "string";
  required: boolean;
  sources: { object_variable: boolean; model_output: boolean; data_source_signal: boolean; static: boolean };
};

type FormState = {
  definitionId: string | null;
  version: string;
  etag: string | null;
  key: string;
  nameFa: string;
  nameEn: string;
  category: string;
  rendererId: string;
  properties: PropDraft[];
  defaultsText: string;
  inputs: InputDraft[];
  status: string;
  scope: "project" | "global";
};

const CATEGORIES = ["kpi", "chart", "gauge", "table", "status", "symbol", "layout", "text", "control"] as const;

export const EQUIPMENT_PRESETS = [
  {
    id: "inverter",
    titleFa: "اینورتر فتوولتائیک ۲۵۰ کیلووات",
    titleEn: "Central Inverter 250kW",
    icon: "⚡",
    desc: "طراحی اینورتر خورشیدی با تبدیل DC به AC، پالس جریان و پایش ولتاژ، توان و راندمان",
    category: "control",
    keySuffix: "inverter",
    properties: [
      { key: "title", labelFa: "عنوان تجهیز", type: "string" as const, enumText: "" },
      { key: "subtitle", labelFa: "زیرعنوان / مدل", type: "string" as const, enumText: "" },
      { key: "equipmentType", labelFa: "نوع تجهیز", type: "string" as const, enumText: "" },
      { key: "power", labelFa: "توان پیش‌فرض (kW)", type: "number" as const, enumText: "" },
      { key: "voltage", labelFa: "ولتاژ ورودی (V)", type: "number" as const, enumText: "" },
      { key: "current", labelFa: "جریان ورودی (A)", type: "number" as const, enumText: "" },
    ],
    defaults: {
      title: "اینورتر فتوولتائیک ۲۵۰ کیلووات",
      subtitle: "Sungrow SG250HX · Grid-Tied Inverter",
      equipmentType: "inverter",
      power: 215.4,
      voltage: 740,
      current: 291,
      temperature: 46.5,
      efficiency: 98.7,
      status: "running",
    },
    inputs: [
      { key: "power", dataType: "number" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
      { key: "voltage", dataType: "number" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
      { key: "current", dataType: "number" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
      { key: "temperature", dataType: "number" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
      { key: "efficiency", dataType: "number" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
      { key: "status", dataType: "string" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
    ],
  },
  {
    id: "solar-panel",
    titleFa: "پنل خورشیدی فتوولتائیک استرینگ",
    titleEn: "Solar PV Panel Array",
    icon: "☀️",
    desc: "طراحی آرایه پنل خورشیدی با تابش W/m²، توان خروجی، سلول‌های نوری و دمای سطح",
    category: "control",
    keySuffix: "solar-panel",
    properties: [
      { key: "title", labelFa: "عنوان تجهیز", type: "string" as const, enumText: "" },
      { key: "subtitle", labelFa: "مدل و مشخصات", type: "string" as const, enumText: "" },
      { key: "equipmentType", labelFa: "نوع تجهیز", type: "string" as const, enumText: "" },
      { key: "power", labelFa: "توان تولیدی (kW)", type: "number" as const, enumText: "" },
    ],
    defaults: {
      title: "پنل خورشیدی استرینگ A1",
      subtitle: "Tier-1 550W Monocrystalline PV Module",
      equipmentType: "solar-panel",
      power: 14.8,
      voltage: 520,
      current: 28.5,
      temperature: 42.0,
      efficiency: 21.6,
      status: "running",
    },
    inputs: [
      { key: "power", dataType: "number" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
      { key: "voltage", dataType: "number" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
      { key: "temperature", dataType: "number" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
      { key: "status", dataType: "string" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
    ],
  },
  {
    id: "bess",
    titleFa: "بانک باتری و ذخیره‌ساز (BESS)",
    titleEn: "Battery Storage Bank",
    icon: "🔋",
    desc: "سامانه ذخیره‌سازی انرژی با درصد شارژ SoC، توان شارژ/دشارژ و سلامت باتری",
    category: "control",
    keySuffix: "battery-bess",
    properties: [
      { key: "title", labelFa: "عنوان تجهیز", type: "string" as const, enumText: "" },
      { key: "subtitle", labelFa: "ظرفیت / نوع", type: "string" as const, enumText: "" },
      { key: "equipmentType", labelFa: "نوع تجهیز", type: "string" as const, enumText: "" },
    ],
    defaults: {
      title: "بانک باتری ذخیره‌ساز BESS",
      subtitle: "Lithium-Ion 250kWh Container",
      equipmentType: "bess",
      power: 85.0,
      voltage: 680,
      current: 125,
      temperature: 27.5,
      efficiency: 88.0,
      status: "running",
    },
    inputs: [
      { key: "power", dataType: "number" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
      { key: "efficiency", dataType: "number" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
      { key: "status", dataType: "string" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
    ],
  },
  {
    id: "tank",
    titleFa: "مخزن مایعات فرآیندی",
    titleEn: "Process Storage Tank",
    icon: "🚰",
    desc: "مخزن هوشمند با سطح سیال متحرک، گیج فشار و قابلیت بارگذاری تصویر و شماتیک دلخواه",
    category: "control",
    keySuffix: "tank-vessel",
    properties: [
      { key: "title", labelFa: "عنوان تجهیز", type: "string" as const, enumText: "" },
      { key: "subtitle", labelFa: "کد تانک / شناسه", type: "string" as const, enumText: "" },
      { key: "imageUrl", labelFa: "آدرس یا تصویر مخزن (اختیاری)", type: "string" as const, enumText: "" },
      { key: "equipmentType", labelFa: "نوع تجهیز", type: "string" as const, enumText: "" },
    ],
    defaults: {
      title: "مخزن ذخیره فرآیندی TK-102",
      subtitle: "Storage Tank · 50m³ Nitrogen Blanketed",
      equipmentType: "tank",
      imageUrl: "",
      power: 50.0,
      voltage: 5.2,
      current: 120,
      temperature: 29.0,
      efficiency: 78.5,
      status: "running",
    },
    inputs: [
      { key: "efficiency", dataType: "number" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
      { key: "voltage", dataType: "number" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
      { key: "temperature", dataType: "number" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
    ],
  },
  {
    id: "motor",
    titleFa: "الکتروپمپ / موتور صنعتی",
    titleEn: "Industrial Pump Motor",
    icon: "⚙",
    desc: "پمپ سانتریفیوژ و موتور محرک با سرعت دورانی RPM، لرزش و توان مصرفی",
    category: "control",
    keySuffix: "pump-motor",
    properties: [
      { key: "title", labelFa: "عنوان تجهیز", type: "string" as const, enumText: "" },
      { key: "subtitle", labelFa: "کد تجهیز / مدل", type: "string" as const, enumText: "" },
      { key: "imageUrl", labelFa: "تصویر یا شماتیک پمپ (اختیاری)", type: "string" as const, enumText: "" },
      { key: "equipmentType", labelFa: "نوع تجهیز", type: "string" as const, enumText: "" },
    ],
    defaults: {
      title: "الکتروپمپ سانتریفیوژ P-301",
      subtitle: "Booster Feed Pump · 55kW Induction",
      equipmentType: "motor",
      imageUrl: "",
      power: 48.5,
      voltage: 380,
      current: 2950,
      temperature: 56.0,
      efficiency: 93.5,
      status: "running",
    },
    inputs: [
      { key: "power", dataType: "number" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
      { key: "current", dataType: "number" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
      { key: "temperature", dataType: "number" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
      { key: "status", dataType: "string" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
    ],
  },
  {
    id: "custom-visual",
    titleFa: "تجهیز با تصویر و دیاگرام دلخواه",
    titleEn: "Custom Equipment with Graphic",
    icon: "🖼️",
    desc: "ساخت کامپوننت صنعتی با بارگذاری عکس واقعی تجهیز، نقشه P&ID یا فایل SVG همراه با پایش تلمتری زنده",
    category: "control",
    keySuffix: "custom-unit",
    properties: [
      { key: "title", labelFa: "عنوان تجهیز", type: "string" as const, enumText: "" },
      { key: "subtitle", labelFa: "کد فنی / مدل", type: "string" as const, enumText: "" },
      { key: "imageUrl", labelFa: "آدرس یا تصویر تجهیز (URL یا بارگذاری)", type: "string" as const, enumText: "" },
      { key: "equipmentType", labelFa: "نوع تجهیز", type: "string" as const, enumText: "" },
      { key: "imageHeight", labelFa: "ارتفاع تصویر (پیکسل)", type: "number" as const, enumText: "" },
      { key: "power", labelFa: "شاخص اول (توان/دبی)", type: "number" as const, enumText: "" },
      { key: "voltage", labelFa: "شاخص دوم (ولتاژ/فشار)", type: "number" as const, enumText: "" },
      { key: "efficiency", labelFa: "شاخص سوم (درصد/راندمان)", type: "number" as const, enumText: "" },
    ],
    defaults: {
      title: "تجهیز صنعتی سفارشی",
      subtitle: "Custom Process Unit · Online Telemetry",
      equipmentType: "custom",
      imageUrl: "",
      imageHeight: 110,
      power: 45.0,
      voltage: 380,
      current: 110,
      temperature: 32.0,
      efficiency: 85.0,
      status: "running",
    },
    inputs: [
      { key: "power", dataType: "number" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
      { key: "voltage", dataType: "number" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
      { key: "efficiency", dataType: "number" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
      { key: "status", dataType: "string" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
    ],
  },
  {
    id: "svg-cad",
    titleFa: "نقشه پایپینگ و اتوکد (AutoCAD / SVG)",
    titleEn: "CAD / P&ID Visual Schematic",
    icon: "📐",
    desc: "طراحی ویجت فرآیندی با وارد کردن نقشه P&ID، نقشه تک‌خطی الکتریکی یا المان‌های خروجی اتوکد، Canva و Canvas با پین‌گذاری تلمتری روی نقشه",
    category: "symbol",
    keySuffix: "cad-diagram",
    properties: [
      { key: "title", labelFa: "عنوان نقشه", type: "string" as const, enumText: "" },
      { key: "height", labelFa: "ارتفاع نمایش (پیکسل)", type: "number" as const, enumText: "" },
    ],
    defaults: {
      title: "دیاگرام فرآیندی پایپینگ P&ID",
      height: 380,
      svgContent: "",
      hotspots: [
        { id: "h1", x: 35, y: 35, inputKey: "tank_level", label: "سطح مخزن TK-201", unit: "%", displayType: "badge" },
        { id: "h2", x: 20, y: 40, inputKey: "valve_pressure", label: "فشار خط", unit: "Bar", displayType: "badge" },
        { id: "h3", x: 62.5, y: 52, inputKey: "pump_status", label: "وضعیت پمپ P-101", unit: "RPM", displayType: "lamp" },
        { id: "h4", x: 80, y: 38, inputKey: "temp_hex", label: "دمای مبدل", unit: "°C", displayType: "badge" },
      ],
    },
    inputs: [
      { key: "tank_level", dataType: "number" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
      { key: "valve_pressure", dataType: "number" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
      { key: "pump_status", dataType: "number" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
      { key: "temp_hex", dataType: "number" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
    ],
  },
  {
    id: "model-3d",
    titleFa: "تجهیز سه‌بعدی تعاملی (3D Interactive Model)",
    titleEn: "3D Industrial Interactive Model",
    icon: "🧊",
    desc: "طراحی ۳بعدی صنعتی با WebGL (Three.js): چرخش ۳۶۰ درجه و اسپین با ماوس، زوم و پایش زنده سطح سیال تانک، دور الکتروپمپ و اینورتر",
    category: "symbol",
    keySuffix: "model3d-unit",
    properties: [
      { key: "title", labelFa: "عنوان تجهیز ۳بعدی", type: "string" as const, enumText: "" },
      { key: "equipmentType", labelFa: "نوع مدل (tank, motor, inverter)", type: "string" as const, enumText: "" },
      { key: "autoSpin", labelFa: "چرخش خودکار اولیه", type: "boolean" as const, enumText: "" },
      { key: "height", labelFa: "ارتفاع بوم (پیکسل)", type: "number" as const, enumText: "" },
      { key: "color", labelFa: "رنگ بدنه تجهیز", type: "string" as const, enumText: "" },
      { key: "accentColor", labelFa: "رنگ ثانویه / قطعات متحرک", type: "string" as const, enumText: "" },
    ],
    defaults: {
      title: "مخزن فرآیندی سه‌بعدی TK-101",
      equipmentType: "tank",
      autoSpin: true,
      height: 380,
      color: "#38bdf8",
      accentColor: "#10b981",
      level: 78.5,
      speed: 1450,
      temperature: 52.4,
      status: "running",
    },
    inputs: [
      { key: "level", dataType: "number" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
      { key: "speed", dataType: "number" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
      { key: "temperature", dataType: "number" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
      { key: "status", dataType: "string" as const, required: false, sources: { object_variable: true, model_output: true, data_source_signal: true, static: true } },
    ],
  },
];

const emptyProp = (): PropDraft => ({ key: "", labelFa: "", type: "string", enumText: "" });
const emptyInput = (): InputDraft => ({
  key: "value",
  dataType: "number",
  required: true,
  sources: { object_variable: true, model_output: true, data_source_signal: true, static: true },
});

function emptyForm(rendererId = "builtin.kpi-card@1"): FormState {
  return {
    definitionId: null,
    version: "0.1.0",
    etag: null,
    key: "",
    nameFa: "",
    nameEn: "",
    category: "kpi",
    rendererId,
    properties: [
      { key: "title", labelFa: "عنوان", type: "string", enumText: "" },
    ],
    defaultsText: '{\n  "title": "عنوان"\n}',
    inputs: [emptyInput()],
    status: "draft",
    scope: "project",
  };
}

function errText(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) return fallback;
  return err.problem.errors?.map((x) => `${x.pointer}: ${x.message}`).join("; ") || err.message;
}

function normalizeKey(raw: string, projectSlug = "darkhoveyn"): string {
  let k = (raw || "").trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
  if (!k) return "";
  if (!k.includes(".")) {
    const cleanSlug = projectSlug.toLowerCase().replace(/[^a-z0-9-]/g, "") || "project";
    k = `${cleanSlug}.${k}`;
  }
  return k;
}

function buildSpec(form: FormState, definitionId: string, status: string, projectSlug?: string): Record<string, unknown> {
  let defaults: Record<string, unknown> = {};
  try {
    defaults = JSON.parse(form.defaultsText || "{}") as Record<string, unknown>;
  } catch {
    throw new Error("defaults باید JSON معتبر باشد");
  }
  const properties = form.properties
    .filter((p) => p.key.trim())
    .map((p) => {
      const base: Record<string, unknown> = {
        key: p.key.trim(),
        label: { fa: p.labelFa || p.key, en: p.key },
        type: p.type,
      };
      if (p.type === "enum") {
        const values = p.enumText.split(",").map((s) => s.trim()).filter(Boolean);
        base.enum = values;
      }
      return base;
    });
  const inputs = form.inputs
    .filter((i) => i.key.trim())
    .map((i) => ({
      key: i.key.trim(),
      label: { fa: i.key, en: i.key },
      dataType: i.dataType,
      ...(i.required ? { required: true } : {}),
    }));
  const bindings = form.inputs
    .filter((i) => i.key.trim())
    .map((i) => {
      const allowedSources = (Object.entries(i.sources) as Array<[keyof InputDraft["sources"], boolean]>)
        .filter(([, on]) => on)
        .map(([k]) => k);
      return { input: i.key.trim(), allowedSources: allowedSources.length ? allowedSources : ["static"] };
    });
  const finalKey = normalizeKey(form.key, projectSlug) || form.key.trim();
  return {
    id: definitionId,
    key: finalKey,
    schemaVersion: 1,
    version: form.version,
    category: form.category,
    name: { ...(form.nameFa ? { fa: form.nameFa } : {}), ...(form.nameEn ? { en: form.nameEn } : { en: form.key }) },
    status,
    rendererId: form.rendererId,
    properties,
    defaults,
    inputs,
    bindings,
    layoutConstraints: {
      minWidth: 80,
      minHeight: 80,
      resizable: true,
      allowedParents: ["column", "grid", "stack", "container"],
      allowedDocumentTypes: ["page", "dashboard", "template"],
    },
    permissions: { use: ["component.use"], edit: ["component.edit"] },
  };
}

function formFromSpec(spec: ComponentSpec & Record<string, unknown>, etag: string | null, scope: "project" | "global"): FormState {
  const name = typeof spec.name === "string" ? { en: spec.name } : (spec.name ?? {});
  const bindings = Array.isArray(spec.bindings) ? spec.bindings as Array<{ input: string; allowedSources: string[] }> : [];
  const sourceMap = Object.fromEntries(bindings.map((b) => [b.input, new Set(b.allowedSources)]));
  return {
    definitionId: spec.id,
    version: spec.version,
    etag,
    key: spec.key,
    nameFa: name.fa ?? "",
    nameEn: name.en ?? "",
    category: spec.category,
    rendererId: spec.rendererId,
    properties: (spec.properties ?? []).map((p) => ({
      key: p.key,
      labelFa: typeof p.label === "string" ? p.label : (p.label?.fa ?? p.key),
      type: (p.type === "number" || p.type === "integer" || p.type === "boolean" || p.type === "enum" ? p.type : "string"),
      enumText: (p.enum ?? []).map(String).join(", "),
    })),
    defaultsText: JSON.stringify(spec.defaults ?? {}, null, 2),
    inputs: (spec.inputs ?? []).map((i) => {
      const allowed = sourceMap[i.key] ?? new Set(["data_source_signal", "static"]);
      return {
        key: i.key,
        dataType: (i.dataType === "integer" || i.dataType === "boolean" || i.dataType === "string" ? i.dataType : "number"),
        required: Boolean(i.required),
        sources: {
          object_variable: allowed.has("object_variable"),
          model_output: allowed.has("model_output"),
          data_source_signal: allowed.has("data_source_signal"),
          static: allowed.has("static"),
        },
      };
    }),
    status: spec.status,
    scope,
  };
}

function Preview({ form }: { form: FormState }) {
  const Renderer = getRenderer(form.rendererId);
  const spec = useMemo(() => {
    try {
      return buildSpec(form, form.definitionId ?? "00000000-0000-7000-8000-000000000099", "draft") as unknown as ComponentSpec;
    } catch {
      return null;
    }
  }, [form]);
  if (!Renderer || !spec) {
    return <div className={ui.muted}>پیش‌نمایش در دسترس نیست</div>;
  }
  const sampleValue = form.rendererId.includes("image")
    ? "https://placehold.co/320x160/png"
    : form.rendererId.includes("chart")
      ? [
        { category: "A", power: 42, energy: 18 },
        { category: "B", power: 55, energy: 22 },
        { category: "C", power: 61, energy: 27 },
      ]
      : form.rendererId.includes("map")
        ? [
          { id: "IR-07", value: 12 },
          { id: "IR-11", value: 8 },
          { id: "IR-10", value: 15 },
        ]
        : 72.5;

  const isIndustrial = form.rendererId.includes("industrial-panel");
  const isSvgCad = form.rendererId.includes("svg-cad");
  const is3d = form.rendererId.includes("model-3d");

  const inputs: Record<string, BindingValue | undefined> = {};
  for (const i of form.inputs) {
    if (i.key) {
      let val: BindingPrimitive | BindingJson = sampleValue;
      let unit = "";
      if (isIndustrial) {
        if (i.key === "power") { val = 48.2; unit = "kW"; }
        else if (i.key === "voltage") { val = 398.5; unit = "V"; }
        else if (i.key === "current") { val = 120.4; unit = "A"; }
        else if (i.key === "temperature") { val = 43.5; unit = "°C"; }
        else if (i.key === "efficiency") { val = 94.8; unit = "%"; }
        else if (i.key === "status") { val = "running"; unit = ""; }
      } else if (isSvgCad) {
        if (i.key === "tank_level") { val = 78.5; unit = "%"; }
        else if (i.key === "valve_pressure") { val = 4.8; unit = "Bar"; }
        else if (i.key === "pump_status") { val = 1450; unit = "RPM"; }
        else if (i.key === "temp_hex") { val = 64.2; unit = "°C"; }
      } else if (is3d) {
        if (i.key === "level") { val = 82.4; unit = "%"; }
        else if (i.key === "speed" || i.key === "rpm") { val = 1750; unit = "RPM"; }
        else if (i.key === "temperature") { val = 54.2; unit = "°C"; }
        else if (i.key === "status") { val = "running"; unit = ""; }
      }
      inputs[i.key] = {
        bindingId: `preview-${i.key}`,
        value: val,
        quality: "good",
        unit,
        sourceTimestamp: new Date().toISOString(),
        origin: "static",
        dataOrigin: "static",
        isTestData: true,
      };
    }
  }

  const node = {
    id: "preview",
    type: "component" as const,
    props: { ...(spec.defaults ?? {}) },
    component: { definitionId: spec.id, version: spec.version },
  };
  return (
    <div style={{ maxWidth: isSvgCad || is3d ? 680 : isIndustrial ? 380 : 280 }}>
      <Renderer node={node} spec={spec} inputs={inputs} testData={{}} locale="fa" />
    </div>
  );
}

export function ComponentStudio({ project }: { project: Project }) {
  const [items, setItems] = useState<ComponentSummary[] | null>(null);
  const [renderers, setRenderers] = useState<RendererInfo[]>([]);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isCadModalOpen, setIsCadModalOpen] = useState(false);

  // UX State
  const [editorTab, setEditorTab] = useState<"basic" | "properties" | "cad" | "inputs">("basic");
  const [sidebarTab, setSidebarTab] = useState<"components" | "presets">("components");
  const [searchQuery, setSearchQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<"all" | "project" | "global">("all");
  const [showRawJson, setShowRawJson] = useState(false);

  const triggerSuccess = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => {
      setSuccessToast((curr) => (curr === msg ? null : curr));
    }, 3500);
  };

  const reload = async () => {
    const [{ data: list }, { data: rs }] = await Promise.all([
      http.get<{ items: ComponentSummary[] }>(`/projects/${project.id}/components`),
      http.get<{ items: RendererInfo[] }>("/renderers"),
    ]);
    setItems(list.items);
    setRenderers(rs.items);
  };

  useEffect(() => {
    void reload().catch((err) => setError(errText(err, "بارگذاری ناموفق بود")));
  }, [project.id]);

  const openVersion = async (summary: ComponentSummary, version: string) => {
    setError(null);
    try {
      const { data, etag } = await http.get<ComponentSpec>(`/components/${summary.id}/versions/${version}`);
      setForm(formFromSpec(data as ComponentSpec & Record<string, unknown>, etag ?? null, summary.scope));
    } catch (err) {
      setError(errText(err, "خواندن نسخه ناموفق بود"));
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (!form.definitionId) {
        const body = buildSpec(form, "00000000-0000-7000-8000-000000000000", "draft", project.slug);
        const { data } = await http.post<ComponentSummary>(`/projects/${project.id}/components`, { body });
        const version = data.draftVersion ?? form.version;
        await openVersion(data, version);
        triggerSuccess(`پیش‌نویس جدید برای کامپوننت ${form.nameFa || form.key} ساخته شد.`);
      } else {
        if (form.scope === "global") throw new Error("تعاریف سراسری فقط‌خواندنی هستند");
        if (!form.etag) throw new Error("ETag موجود نیست؛ دوباره باز کنید");
        const body = buildSpec(form, form.definitionId, "draft", project.slug);
        const { data, etag } = await http.put<ComponentSpec>(
          `/components/${form.definitionId}/versions/${form.version}`,
          { body, ifMatch: form.etag },
        );
        setForm(formFromSpec(data as ComponentSpec & Record<string, unknown>, etag ?? null, "project"));
        triggerSuccess("تغییرات پیش‌نویس کامپوننت با موفقیت ذخیره شد.");
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error && !(err instanceof ApiError) ? err.message : errText(err, "ذخیره ناموفق بود"));
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!form.definitionId) return;
    setError(null);
    setBusy(true);
    try {
      await http.post(`/components/${form.definitionId}/versions/${form.version}/publish`);
      await reload();
      const summary = (await http.get<{ items: ComponentSummary[] }>(`/projects/${project.id}/components`)).data.items
        .find((x) => x.id === form.definitionId);
      if (summary?.latestPublishedVersion) await openVersion(summary, summary.latestPublishedVersion);
      triggerSuccess("کامپوننت با موفقیت منتشر شد و آماده استفاده در صفحات است.");
    } catch (err) {
      setError(errText(err, "انتشار ناموفق بود"));
    } finally {
      setBusy(false);
    }
  };

  const bump = async () => {
    if (!form.definitionId) return;
    setError(null);
    setBusy(true);
    try {
      const fromVersion = form.version;
      const { data, etag } = await http.post<ComponentSpec>(`/components/${form.definitionId}/versions`, {
        body: { fromVersion, bump: "minor" },
      });
      setForm(formFromSpec(data as ComponentSpec & Record<string, unknown>, etag ?? null, "project"));
      await reload();
      triggerSuccess(`نسخه جدید (${data.version}) ایجاد شد و آماده ویرایش است.`);
    } catch (err) {
      setError(errText(err, "نسخهٔ جدید ساخته نشد"));
    } finally {
      setBusy(false);
    }
  };

  const exportJson = () => {
    setError(null);
    try {
      const id = form.definitionId ?? "00000000-0000-7000-8000-000000000000";
      const spec = buildSpec(form, id, form.status === "published" ? "published" : "draft");
      const blob = new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${form.key || "component"}@${form.version || "0.1.0"}.json`;
      a.click();
      URL.revokeObjectURL(url);
      triggerSuccess("بسته JSON کامپوننت دانلود شد.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "خروجی JSON ناموفق بود");
    }
  };

  const importJson = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object") throw new Error("فایل باید یک آبجکت JSON معتبر باشد");
      let key = typeof parsed.key === "string" ? parsed.key.trim() : "";
      if (!key) throw new Error("کلید (key) در فایل JSON الزامی است");
      key = normalizeKey(key, project.slug);
      parsed.key = key;

      const existing = items?.find((x) => x.key === key);
      if (existing) {
        if (existing.scope === "global") {
          throw new Error(
            "کامپوننت‌های سراسری فقط‌خواندنی هستند. لطفاً مقدار key را در فایل به یک کلید پروژه‌ای تغییر دهید (مثلاً darkhoveyn.my-component)."
          );
        }
        let targetVersion = existing.draftVersion;
        if (!targetVersion && existing.latestPublishedVersion) {
          const { data: bumped } = await http.post<ComponentSpec>(`/components/${existing.id}/versions`, {
            body: { fromVersion: existing.latestPublishedVersion, bump: "minor" },
          });
          targetVersion = bumped.version;
        }
        if (!targetVersion) targetVersion = "0.1.0";
        const { etag } = await http.get<ComponentSpec>(`/components/${existing.id}/versions/${targetVersion}`);
        const body = {
          ...parsed,
          id: existing.id,
          key: existing.key,
          version: targetVersion,
          status: "draft",
        };
        const { data: updated, etag: newEtag } = await http.put<ComponentSpec>(
          `/components/${existing.id}/versions/${targetVersion}`,
          { body, ifMatch: etag ?? "" },
        );
        await reload();
        setForm(formFromSpec(updated as ComponentSpec & Record<string, unknown>, newEtag ?? null, "project"));
      } else {
        const body = {
          ...parsed,
          version: typeof parsed.version === "string" ? parsed.version : "0.1.0",
          status: "draft",
        };
        const { data } = await http.post<ComponentSummary>(`/projects/${project.id}/components`, { body });
        const version = data.draftVersion ?? "0.1.0";
        await reload();
        await openVersion(data, version);
      }
      triggerSuccess("کامپوننت با موفقیت از فایل JSON بارگذاری شد.");
    } catch (err) {
      if (err instanceof SyntaxError) setError("ساختار فایل JSON نامعتبر است (SyntaxError)");
      else setError(err instanceof Error && !(err instanceof ApiError) ? err.message : errText(err, "ورود از فایل ناموفق بود"));
    } finally {
      setBusy(false);
    }
  };

  const applyPreset = (preset: typeof EQUIPMENT_PRESETS[number]) => {
    let safeProjectSlug = (project.slug || "proj").toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!safeProjectSlug || !/^[a-z]/.test(safeProjectSlug)) {
      safeProjectSlug = `p-${safeProjectSlug || "main"}`.replace(/[^a-z0-9_-]/g, "");
    }
    const baseKey = `${safeProjectSlug}.${preset.keySuffix}`;
    let targetKey = baseKey;
    let counter = 1;
    while (items?.some((it) => it.key === targetKey)) {
      counter += 1;
      targetKey = `${baseKey}-${counter}`;
    }

    const rendererId =
      preset.id === "svg-cad"
        ? "builtin.svg-cad@1"
        : preset.id === "model-3d"
        ? "builtin.model-3d@1"
        : "builtin.industrial-panel@1";

    setForm({
      definitionId: null,
      version: "0.1.0",
      etag: null,
      key: targetKey,
      nameFa: preset.titleFa,
      nameEn: preset.titleEn,
      category: preset.category,
      rendererId,
      properties: preset.properties.map((p) => ({ ...p })),
      defaultsText: JSON.stringify(preset.defaults, null, 2),
      inputs: preset.inputs.map((i) => ({ ...i, sources: { ...i.sources } })),
      status: "draft",
      scope: "project",
    });
    setEditorTab("basic");
    triggerSuccess(`قالب تجهیز «${preset.titleFa}» بارگذاری شد.`);
  };

  const handleApplyCad = (svgContent: string, hotspots: SvgHotspot[]) => {
    let currentDefaults: Record<string, unknown> = {};
    try {
      currentDefaults = JSON.parse(form.defaultsText || "{}");
    } catch {
      // ignore
    }
    currentDefaults.svgContent = svgContent;
    currentDefaults.hotspots = hotspots;
    if (currentDefaults.imageUrl) {
      currentDefaults.imageUrl = svgContent;
    }

    const existingInputKeys = new Set(form.inputs.map((i) => i.key));
    const newInputs = [...form.inputs];
    for (const h of hotspots) {
      if (h.inputKey && !existingInputKeys.has(h.inputKey)) {
        existingInputKeys.add(h.inputKey);
        newInputs.push({
          key: h.inputKey,
          dataType: "number",
          required: false,
          sources: { object_variable: true, model_output: true, data_source_signal: true, static: true },
        });
      }
    }

    const hasSvgProp = form.properties.some((p) => p.key === "svgContent");
    const nextProperties = hasSvgProp
      ? form.properties
      : [...form.properties, { key: "svgContent", labelFa: "محتوای نقشه SVG", type: "string" as const, enumText: "" }];

    setForm({
      ...form,
      rendererId: "builtin.svg-cad@1",
      properties: nextProperties,
      defaultsText: JSON.stringify(currentDefaults, null, 2),
      inputs: newInputs,
    });
    triggerSuccess("طراحی نقشه و نقاط تله‌متری با موفقیت ذخیره شد.");
  };

  const handleImageUpload = (file: File | null) => {
    if (!file) return;
    setError(null);
    const lowerName = file.name.toLowerCase();

    // Check for binary AutoCAD DWG / PWG / DWF
    if (lowerName.endsWith(".dwg") || lowerName.endsWith(".pwg") || lowerName.endsWith(".dwf")) {
      setError(
        `فرمت فایل ${file.name.split('.').pop()?.toUpperCase()} یک فرمت باینری اختصاصی و بستهٔ اتوکد است که مستقیماً در مرورگر وب قابل رندر نیست. راهکار: لطفاً در اتوکد از منوی Save As گزینه AutoCAD DXF (*.dxf) را انتخاب کنید (که بلافاصله رندر می‌شود) یا با دستور EXPORTSVG / PLOT نقشه را به صورت SVG یا PNG خروجی بگیرید.`
      );
      return;
    }

    if (lowerName.endsWith(".dxf")) {
      const textReader = new FileReader();
      textReader.onload = () => {
        try {
          const raw = textReader.result as string;
          const svgContent = convertDxfToSvg(raw);
          let currentDefaults: Record<string, unknown> = {};
          try {
            currentDefaults = JSON.parse(form.defaultsText || "{}");
          } catch {
            // ignore
          }
          currentDefaults.svgContent = svgContent;
          currentDefaults.imageUrl = svgContent;
          currentDefaults.backgroundImage = svgContent;

          const hasImgProp = form.properties.some((p) => p.key === "imageUrl");
          const hasSvgProp = form.properties.some((p) => p.key === "svgContent");
          const nextProps = [...form.properties];
          if (!hasImgProp) nextProps.push({ key: "imageUrl", labelFa: "تصویر تجهیز", type: "string" as const, enumText: "" });
          if (!hasSvgProp) nextProps.push({ key: "svgContent", labelFa: "محتوای نقشه SVG", type: "string" as const, enumText: "" });

          setForm({
            ...form,
            rendererId: form.rendererId === "builtin.industrial-panel@1" ? "builtin.industrial-panel@1" : "builtin.svg-cad@1",
            properties: nextProps,
            defaultsText: JSON.stringify(currentDefaults, null, 2),
          });
          triggerSuccess("نقشه اتوکد DXF با موفقیت پردازش و اعمال شد.");
        } catch (err) {
          setError(err instanceof Error ? err.message : "خطا در پردازش فایل DXF اتوکد");
        }
      };
      textReader.readAsText(file);
      return;
    }

    const isSvg = file.type === "image/svg+xml" || lowerName.endsWith(".svg");

    if (isSvg) {
      const textReader = new FileReader();
      textReader.onload = () => {
        const raw = textReader.result as string;
        let currentDefaults: Record<string, unknown> = {};
        try {
          currentDefaults = JSON.parse(form.defaultsText || "{}");
        } catch {
          // ignore
        }
        currentDefaults.svgContent = raw;
        currentDefaults.imageUrl = raw;
        currentDefaults.backgroundImage = raw;

        const hasImgProp = form.properties.some((p) => p.key === "imageUrl");
        const hasSvgProp = form.properties.some((p) => p.key === "svgContent");
        const nextProps = [...form.properties];
        if (!hasImgProp) nextProps.push({ key: "imageUrl", labelFa: "تصویر تجهیز", type: "string" as const, enumText: "" });
        if (!hasSvgProp) nextProps.push({ key: "svgContent", labelFa: "محتوای نقشه SVG", type: "string" as const, enumText: "" });

        setForm({
          ...form,
          properties: nextProps,
          defaultsText: JSON.stringify(currentDefaults, null, 2),
        });
        triggerSuccess("فایل SVG با موفقیت بارگذاری شد.");
      };
      textReader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        let currentDefaults: Record<string, unknown> = {};
        try {
          currentDefaults = JSON.parse(form.defaultsText || "{}");
        } catch {
          // ignore
        }
        currentDefaults.imageUrl = dataUrl;
        currentDefaults.backgroundImage = dataUrl;
        currentDefaults.svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="100%" height="100%"><rect width="800" height="500" fill="#0f172a"/><image href="${dataUrl}" xlink:href="${dataUrl}" width="800" height="500" preserveAspectRatio="xMidYMid meet"/></svg>`;

        const hasImgProp = form.properties.some((p) => p.key === "imageUrl");
        const nextProps = hasImgProp
          ? form.properties
          : [...form.properties, { key: "imageUrl", labelFa: "تصویر تجهیز", type: "string" as const, enumText: "" }];

        setForm({
          ...form,
          properties: nextProps,
          defaultsText: JSON.stringify(currentDefaults, null, 2),
        });
        triggerSuccess("تصویر تجهیز با موفقیت بارگذاری شد.");
      };
      reader.readAsDataURL(file);
    }
  };

  const handleResetImage = () => {
    let currentDefaults: Record<string, unknown> = {};
    try {
      currentDefaults = JSON.parse(form.defaultsText || "{}");
    } catch {
      // ignore
    }
    delete currentDefaults.imageUrl;
    delete currentDefaults.backgroundImage;
    delete currentDefaults.svgContent;
    setForm({
      ...form,
      defaultsText: JSON.stringify(currentDefaults, null, 2),
    });
    triggerSuccess("تصویر و نقشه سفارشی حذف شد.");
  };

  const removeProperty = (idx: number) => {
    const next = [...form.properties];
    next.splice(idx, 1);
    setForm({ ...form, properties: next });
  };

  const removeInput = (idx: number) => {
    const next = [...form.inputs];
    next.splice(idx, 1);
    setForm({ ...form, inputs: next });
  };

  const updateDefaultField = (key: string, val: unknown) => {
    let current: Record<string, unknown> = {};
    try {
      current = JSON.parse(form.defaultsText || "{}");
    } catch {
      current = {};
    }
    current[key] = val;
    setForm({ ...form, defaultsText: JSON.stringify(current, null, 2) });
  };

  const parsedDefaults = useMemo<Record<string, unknown>>(() => {
    try {
      return JSON.parse(form.defaultsText || "{}");
    } catch {
      return {};
    }
  }, [form.defaultsText]);

  const filteredItems = useMemo(() => {
    if (!items) return [];
    return items.filter((c) => {
      if (scopeFilter === "project" && c.scope !== "project") return false;
      if (scopeFilter === "global" && c.scope !== "global") return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const nameFa = localize(c.name, "fa").toLowerCase();
        const key = c.key.toLowerCase();
        const cat = (c.category || "").toLowerCase();
        return nameFa.includes(q) || key.includes(q) || cat.includes(q);
      }
      return true;
    });
  }, [items, scopeFilter, searchQuery]);

  const readOnly = form.scope === "global" || form.status === "published" || form.status === "deprecated";
  const activeRendererMeta = RENDERER_METADATA[form.rendererId];

  return (
    <div className={styles.container}>
      {/* Top Bar Header */}
      <div className={styles.topBar}>
        <div className={styles.titleArea}>
          <h2>
            <span>🧩</span>
            <span>استودیوی کامپوننت‌های صنعتی</span>
          </h2>
          <p>
            طراحی، ساخت و انتشار ویجت‌های استاندارد تله‌متری با رندرینگ ایمن Declarative بر بستر پلتفرم دارخوین
          </p>
        </div>
        <div className={styles.topActions}>
          <button
            type="button"
            className={`${ui.button} ${ui.primary}`}
            onClick={() => {
              setForm(emptyForm(renderers[0]?.rendererId ?? "builtin.kpi-card@1"));
              setEditorTab("basic");
            }}
          >
            <span>+ کامپوننت جدید</span>
          </button>
          <button
            type="button"
            className={ui.button}
            disabled={busy || !form.key}
            onClick={exportJson}
            title="دانلود بسته استاندارد JSON کامپوننت"
          >
            <span>📤 خروجی JSON</span>
          </button>
          <label
            className={ui.button}
            style={{ cursor: busy ? "not-allowed" : "pointer" }}
            title="بارگذاری فایل JSON برای ایجاد یا به‌روزرسانی"
          >
            <span>📥 ورود JSON</span>
            <input
              type="file"
              accept="application/json,.json"
              hidden
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                void importJson(f);
              }}
            />
          </label>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className={styles.studioGrid}>
        {/* Left / Sidebar Column: Components List & Equipment Presets */}
        <div className={styles.sidebar}>
          {/* Sidebar Tab Switcher */}
          <div className={styles.sidebarTabs}>
            <button
              type="button"
              className={`${styles.sidebarTabBtn} ${sidebarTab === "components" ? styles.sidebarTabBtnActive : ""}`}
              onClick={() => setSidebarTab("components")}
            >
              <span>📦 کامپوننت‌ها</span>
              <span style={{ opacity: 0.8, fontSize: "0.75rem" }}>({items ? items.length : "..."})</span>
            </button>
            <button
              type="button"
              className={`${styles.sidebarTabBtn} ${sidebarTab === "presets" ? styles.sidebarTabBtnActive : ""}`}
              onClick={() => setSidebarTab("presets")}
            >
              <span>⚡ تجهیزات آماده</span>
              <span style={{ opacity: 0.8, fontSize: "0.75rem" }}>({EQUIPMENT_PRESETS.length})</span>
            </button>
          </div>

          {sidebarTab === "components" ? (
            <>
              {/* Search and Scope Filter */}
              <div className={styles.searchBox}>
                <input
                  type="text"
                  className={ui.input}
                  placeholder="🔍 جستجو در نام یا کلید..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ fontSize: "0.85rem" }}
                />
              </div>

              <div style={{ display: "flex", gap: 6, fontSize: "0.75rem" }}>
                <button
                  type="button"
                  className={ui.button}
                  style={{
                    padding: "3px 8px",
                    background: scopeFilter === "all" ? "var(--color-brand, #0ea5e9)" : "transparent",
                    color: scopeFilter === "all" ? "#fff" : "inherit",
                  }}
                  onClick={() => setScopeFilter("all")}
                >
                  همه ({items?.length ?? 0})
                </button>
                <button
                  type="button"
                  className={ui.button}
                  style={{
                    padding: "3px 8px",
                    background: scopeFilter === "project" ? "var(--color-brand, #0ea5e9)" : "transparent",
                    color: scopeFilter === "project" ? "#fff" : "inherit",
                  }}
                  onClick={() => setScopeFilter("project")}
                >
                  پروژه ({items?.filter((x) => x.scope === "project").length ?? 0})
                </button>
                <button
                  type="button"
                  className={ui.button}
                  style={{
                    padding: "3px 8px",
                    background: scopeFilter === "global" ? "var(--color-brand, #0ea5e9)" : "transparent",
                    color: scopeFilter === "global" ? "#fff" : "inherit",
                  }}
                  onClick={() => setScopeFilter("global")}
                >
                  سراسری ({items?.filter((x) => x.scope === "global").length ?? 0})
                </button>
              </div>

              {/* Components List */}
              <div className={styles.componentsList}>
                {items === null ? (
                  <div className={ui.muted} style={{ padding: 16, textAlign: "center" }}>
                    در حال بارگذاری کامپوننت‌ها...
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className={ui.muted} style={{ padding: 16, textAlign: "center", fontSize: "0.85rem" }}>
                    موردی یافت نشد.
                  </div>
                ) : (
                  filteredItems.map((c) => {
                    const isSelected = form.definitionId === c.id;
                    const catMeta = CATEGORY_METADATA[c.category] || { labelFa: c.category, icon: "📦" };
                    return (
                      <div
                        key={c.id}
                        className={`${styles.componentCard} ${isSelected ? styles.componentCardActive : ""}`}
                        onClick={() => {
                          const targetVer = c.draftVersion ?? c.latestPublishedVersion ?? "0.1.0";
                          void openVersion(c, targetVer);
                        }}
                      >
                        <div className={styles.cardHeader}>
                          <span className={styles.cardTitle}>
                            <span>{catMeta.icon}</span>
                            <span>{localize(c.name, "fa") || c.key}</span>
                          </span>
                          <span className={`${styles.badge} ${c.scope === "global" ? styles.badgeGlobal : styles.badgeProject}`}>
                            {c.scope === "global" ? "سراسری" : "پروژه"}
                          </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <code dir="ltr" style={{ fontSize: "0.75rem", color: "var(--color-text-muted, #8b98a5)" }}>
                            {c.key}
                          </code>
                          <div style={{ display: "flex", gap: 4 }}>
                            {c.draftVersion && (
                              <button
                                type="button"
                                className={`${styles.badge} ${styles.badgeDraft}`}
                                style={{ border: "none", cursor: "pointer" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void openVersion(c, c.draftVersion!);
                                }}
                                title="ویرایش پیش‌نویس"
                              >
                                پیش‌نویس {c.draftVersion}
                              </button>
                            )}
                            {c.latestPublishedVersion && (
                              <button
                                type="button"
                                className={`${styles.badge} ${styles.badgePublished}`}
                                style={{ border: "none", cursor: "pointer" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void openVersion(c, c.latestPublishedVersion!);
                                }}
                                title="مشاهده نسخه منتشرشده"
                              >
                                منتشر v{c.latestPublishedVersion}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            /* Presets List */
            <div className={styles.componentsList}>
              <p style={{ margin: "4px 0 8px", fontSize: "0.8rem", color: "var(--color-text-muted, #8b98a5)" }}>
                قالب‌های تجهیز با ساختار آماده ویژگی‌ها، رندرر صنعتی و نقاط داده:
              </p>
              {EQUIPMENT_PRESETS.map((preset) => (
                <div
                  key={preset.id}
                  className={styles.presetCard}
                  onClick={() => applyPreset(preset)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: "1.3rem" }}>{preset.icon}</span>
                    <strong style={{ fontSize: "0.9rem" }}>{preset.titleFa}</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--color-text-muted, #8b98a5)", lineHeight: 1.4 }}>
                    {preset.desc}
                  </p>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                    <code style={{ fontSize: "0.72rem", opacity: 0.75 }}>{preset.keySuffix}</code>
                    <span style={{ fontSize: "0.78rem", color: "var(--color-brand, #38bdf8)", fontWeight: 600 }}>
                      بارگذاری قالب ←
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right / Main Column: Component Editor & Live Preview */}
        <form className={styles.editorCard} onSubmit={(e) => void save(e)}>
          {/* Header of Editor */}
          <div className={styles.editorHeader}>
            <div className={styles.componentMeta}>
              <strong style={{ fontSize: "1.1rem" }}>
                {form.definitionId
                  ? (form.nameFa || form.key)
                  : "✨ ایجاد کامپوننت جدید"}
              </strong>
              {form.definitionId && (
                <>
                  <span className={`${styles.badge} ${form.status === "published" ? styles.badgePublished : styles.badgeDraft}`}>
                    {form.status === "published" ? `منتشرشده v${form.version}` : `پیش‌نویس v${form.version}`}
                  </span>
                  <span className={`${styles.badge} ${form.scope === "global" ? styles.badgeGlobal : styles.badgeProject}`}>
                    {form.scope === "global" ? "تعریف سراسری پلتفرم" : "تعریف اختصاصی پروژه"}
                  </span>
                </>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className={ui.button}
                onClick={() => setForm(emptyForm(renderers[0]?.rendererId ?? "builtin.kpi-card@1"))}
              >
                پاک کردن فرم
              </button>
              {!readOnly && (
                <button className={`${ui.button} ${ui.primary}`} disabled={busy} type="submit">
                  {busy ? "در حال ذخیره..." : form.definitionId ? "💾 ذخیره تغییرات" : "✨ ایجاد پیش‌نویس"}
                </button>
              )}
              {form.definitionId && form.status === "draft" && form.scope === "project" && (
                <button
                  type="button"
                  className={`${ui.button} ${ui.primary}`}
                  style={{ background: "#10b981", borderColor: "#059669" }}
                  disabled={busy}
                  onClick={() => void publish()}
                  title="انتشار کامپوننت برای استفاده در صفحات پروژه"
                >
                  🚀 انتشار
                </button>
              )}
              {form.definitionId && form.status === "published" && form.scope === "project" && (
                <button
                  type="button"
                  className={ui.button}
                  disabled={busy}
                  onClick={() => void bump()}
                  title="ایجاد نسخه ارتقایافته (minor) برای ویرایش مجدد"
                >
                  ✨ نسخه جدید
                </button>
              )}
            </div>
          </div>

          {/* Toast / Feedback */}
          {error && <div className={ui.alert} role="alert">{error}</div>}
          {successToast && (
            <div
              style={{
                padding: "10px 14px",
                background: "rgba(16, 185, 129, 0.15)",
                border: "1px solid rgba(16, 185, 129, 0.4)",
                borderRadius: 8,
                color: "#34d399",
                fontSize: "0.88rem",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>✓</span>
              <span>{successToast}</span>
            </div>
          )}

          {/* Sticky / Top Live Preview */}
          <div className={styles.previewSection}>
            <div className={styles.previewHeader}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>👁️ پیش‌نمایش زنده ویجت</span>
                <span style={{ opacity: 0.6 }}>· رندرر:</span>
                <code dir="ltr" style={{ color: "var(--color-brand, #38bdf8)" }}>{form.rendererId}</code>
              </span>
              <span>{activeRendererMeta ? `${activeRendererMeta.icon} ${activeRendererMeta.labelFa}` : ""}</span>
            </div>
            <div style={{ width: "100%", display: "flex", justifyContent: "center", minHeight: 120 }}>
              <Preview form={form} />
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className={styles.navTabs}>
            <button
              type="button"
              className={`${styles.navTabBtn} ${editorTab === "basic" ? styles.navTabBtnActive : ""}`}
              onClick={() => setEditorTab("basic")}
            >
              <span>📋 مشخصات اصلی</span>
            </button>
            <button
              type="button"
              className={`${styles.navTabBtn} ${editorTab === "properties" ? styles.navTabBtnActive : ""}`}
              onClick={() => setEditorTab("properties")}
            >
              <span>⚙️ ویژگی‌ها و مقادیر</span>
              <span style={{ opacity: 0.7, fontSize: "0.75rem" }}>({form.properties.length})</span>
            </button>
            <button
              type="button"
              className={`${styles.navTabBtn} ${editorTab === "cad" ? styles.navTabBtnActive : ""}`}
              onClick={() => setEditorTab("cad")}
            >
              <span>📐 نقشه، تصویر و CAD</span>
            </button>
            <button
              type="button"
              className={`${styles.navTabBtn} ${editorTab === "inputs" ? styles.navTabBtnActive : ""}`}
              onClick={() => setEditorTab("inputs")}
            >
              <span>📡 ورودی‌های داده</span>
              <span style={{ opacity: 0.7, fontSize: "0.75rem" }}>({form.inputs.length})</span>
            </button>
          </div>

          {/* TAB 1: BASIC INFORMATION */}
          {editorTab === "basic" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className={styles.formGrid}>
                <div>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: 6 }}>
                    نام فارسی کامپوننت:
                  </label>
                  <input
                    className={ui.input}
                    placeholder="مانند: گیج فشار بخار توربین"
                    value={form.nameFa}
                    disabled={readOnly}
                    onChange={(e) => setForm({ ...form, nameFa: e.target.value })}
                    required={!form.nameEn}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: 6 }}>
                    نام انگلیسی (اختیاری):
                  </label>
                  <input
                    className={ui.input}
                    placeholder="e.g. Steam Pressure Gauge"
                    dir="ltr"
                    value={form.nameEn}
                    disabled={readOnly}
                    onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                  />
                </div>
              </div>

              <div className={styles.formGrid}>
                <div>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: 6 }}>
                    شناسه یکتا (Key):
                  </label>
                  <input
                    className={ui.input}
                    placeholder={`مانند ${project.slug}.steam-gauge`}
                    dir="ltr"
                    value={form.key}
                    disabled={readOnly || Boolean(form.definitionId)}
                    onChange={(e) => {
                      const cleaned = e.target.value.toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
                      setForm({ ...form, key: cleaned });
                    }}
                    onBlur={() => {
                      if (form.key && !form.key.includes(".")) {
                        setForm({ ...form, key: normalizeKey(form.key, project.slug) });
                      }
                    }}
                    required
                  />
                  <small style={{ fontSize: "0.75rem", color: "var(--color-text-muted, #8b98a5)", display: "block", marginTop: 4 }}>
                    💡 شناسه با پیشوند پروژه اختصاص می‌یابد (مثال: <code dir="ltr" style={{ color: "#38bdf8" }}>{project.slug}.custom-widget</code>)
                  </small>
                </div>

                <div>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: 6 }}>
                    دسته‌بندی (Category):
                  </label>
                  <select
                    className={ui.select}
                    value={form.category}
                    disabled={readOnly}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    {CATEGORIES.map((c) => {
                      const cat = CATEGORY_METADATA[c];
                      return (
                        <option key={c} value={c}>
                          {cat ? `${cat.icon} ${cat.labelFa}` : c}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: 6 }}>
                  رندرر اجرایی (Platform Renderer Engine):
                </label>
                <select
                  className={ui.select}
                  value={form.rendererId}
                  disabled={readOnly}
                  onChange={(e) => setForm({ ...form, rendererId: e.target.value })}
                >
                  {(renderers.length ? renderers : [{ rendererId: form.rendererId, category: "", supportedInputs: [] }]).map((r) => {
                    const meta = RENDERER_METADATA[r.rendererId];
                    return (
                      <option key={r.rendererId} value={r.rendererId}>
                        {meta ? `${meta.icon} ${meta.labelFa} (${r.rendererId})` : r.rendererId}
                      </option>
                    );
                  })}
                </select>
                {activeRendererMeta && (
                  <div style={{ marginTop: 6, fontSize: "0.8rem", color: "var(--color-text-muted, #8b98a5)" }}>
                    💡 {activeRendererMeta.desc}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: PROPERTIES & DEFAULTS */}
          {editorTab === "properties" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Properties Section */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <strong style={{ fontSize: "0.95rem" }}>فهرست خصوصیات قابل تنظیم (Properties Schema)</strong>
                  {!readOnly && (
                    <button
                      type="button"
                      className={ui.button}
                      onClick={() => setForm({ ...form, properties: [...form.properties, emptyProp()] })}
                    >
                      + افزودن ویژگی جدید
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {form.properties.map((p, idx) => (
                    <div key={idx} className={styles.propertyRow}>
                      <input
                        className={ui.input}
                        placeholder="کلید فنی (key)"
                        dir="ltr"
                        value={p.key}
                        disabled={readOnly}
                        style={{ flex: 1 }}
                        onChange={(e) => {
                          const properties = [...form.properties];
                          properties[idx] = { ...p, key: e.target.value };
                          setForm({ ...form, properties });
                        }}
                      />
                      <input
                        className={ui.input}
                        placeholder="برچسب فارسی"
                        value={p.labelFa}
                        disabled={readOnly}
                        style={{ flex: 1.2 }}
                        onChange={(e) => {
                          const properties = [...form.properties];
                          properties[idx] = { ...p, labelFa: e.target.value };
                          setForm({ ...form, properties });
                        }}
                      />
                      <select
                        className={ui.select}
                        value={p.type}
                        disabled={readOnly}
                        style={{ flex: 0.9 }}
                        onChange={(e) => {
                          const properties = [...form.properties];
                          properties[idx] = { ...p, type: e.target.value as PropDraft["type"] };
                          setForm({ ...form, properties });
                        }}
                      >
                        <option value="string">متن (string)</option>
                        <option value="number">عدد اعشاری (number)</option>
                        <option value="integer">عدد صحیح (integer)</option>
                        <option value="boolean">منطقی (boolean)</option>
                        <option value="enum">گزینه‌ای (enum)</option>
                      </select>
                      {p.type === "enum" && (
                        <input
                          className={ui.input}
                          placeholder="گزینه‌ها با ویرگول (a,b,c)"
                          dir="ltr"
                          value={p.enumText}
                          disabled={readOnly}
                          style={{ flex: 1.2 }}
                          onChange={(e) => {
                            const properties = [...form.properties];
                            properties[idx] = { ...p, enumText: e.target.value };
                            setForm({ ...form, properties });
                          }}
                        />
                      )}
                      {!readOnly && (
                        <button
                          type="button"
                          className={styles.deleteBtn}
                          onClick={() => removeProperty(idx)}
                          title="حذف این ویژگی"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  ))}
                  {form.properties.length === 0 && (
                    <div className={ui.muted} style={{ textAlign: "center", padding: 12 }}>
                      هیچ ویژگی‌ای تعریف نشده است.
                    </div>
                  )}
                </div>
              </div>

              {/* Visual Defaults Editor */}
              <div style={{ borderTop: "1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.08))", paddingTop: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <strong style={{ fontSize: "0.95rem" }}>مقادیر پیش‌فرض (Visual Defaults Editor)</strong>
                    <p className={ui.muted} style={{ fontSize: "0.8rem", margin: "2px 0 0" }}>
                      مقادیر اولیه ویژگی‌ها را بدون نیاز به تایپ کد JSON اینجا تنظیم کنید:
                    </p>
                  </div>
                  <label style={{ fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: "var(--color-brand, #38bdf8)" }}>
                    <input
                      type="checkbox"
                      checked={showRawJson}
                      onChange={(e) => setShowRawJson(e.target.checked)}
                    />
                    <span>ویرایش مستقیم کد JSON</span>
                  </label>
                </div>

                {!showRawJson ? (
                  <div className={styles.defaultsVisualGrid}>
                    {form.properties
                      .filter((p) => Boolean(p.key.trim()))
                      .map((p) => {
                        const val = parsedDefaults[p.key];
                        if (p.type === "boolean") {
                          return (
                            <div key={p.key} className={styles.defaultFieldCard}>
                              <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>{p.labelFa || p.key}</span>
                              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, cursor: readOnly ? "not-allowed" : "pointer" }}>
                                <input
                                  type="checkbox"
                                  checked={Boolean(val)}
                                  disabled={readOnly}
                                  onChange={(e) => updateDefaultField(p.key, e.target.checked)}
                                />
                                <span style={{ fontSize: "0.82rem" }}>{val ? "فعال (True)" : "غیرفعال (False)"}</span>
                              </label>
                            </div>
                          );
                        }
                        if (p.type === "enum") {
                          const opts = p.enumText.split(",").map((s) => s.trim()).filter(Boolean);
                          return (
                            <div key={p.key} className={styles.defaultFieldCard}>
                              <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>{p.labelFa || p.key}</span>
                              <select
                                className={ui.select}
                                value={String(val ?? opts[0] ?? "")}
                                disabled={readOnly}
                                onChange={(e) => updateDefaultField(p.key, e.target.value)}
                              >
                                {opts.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </div>
                          );
                        }
                        if (p.type === "number" || p.type === "integer") {
                          return (
                            <div key={p.key} className={styles.defaultFieldCard}>
                              <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>{p.labelFa || p.key}</span>
                              <input
                                type="number"
                                className={ui.input}
                                dir="ltr"
                                value={val !== undefined && val !== null ? Number(val) : ""}
                                disabled={readOnly}
                                onChange={(e) => updateDefaultField(p.key, e.target.value === "" ? "" : Number(e.target.value))}
                              />
                            </div>
                          );
                        }
                        return (
                          <div key={p.key} className={styles.defaultFieldCard}>
                            <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>{p.labelFa || p.key}</span>
                            <input
                              type="text"
                              className={ui.input}
                              value={String(val ?? "")}
                              disabled={readOnly}
                              onChange={(e) => updateDefaultField(p.key, e.target.value)}
                            />
                          </div>
                        );
                      })}
                    {form.properties.filter((p) => Boolean(p.key.trim())).length === 0 && (
                      <div className={ui.muted} style={{ gridColumn: "1 / -1", textAlign: "center", padding: 12 }}>
                        ابتدا در بخش بالا ویژگی‌ها را تعریف کنید تا فرم مقادیر ایجاد شود.
                      </div>
                    )}
                  </div>
                ) : (
                  <textarea
                    className={ui.input}
                    dir="ltr"
                    rows={6}
                    value={form.defaultsText}
                    disabled={readOnly}
                    onChange={(e) => setForm({ ...form, defaultsText: e.target.value })}
                    style={{ fontFamily: "monospace", fontSize: "0.85rem" }}
                  />
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CAD & GRAPHICS */}
          {editorTab === "cad" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Visual CAD Designer Card */}
              <div
                style={{
                  padding: "16px 20px",
                  background: "linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(37, 99, 235, 0.12) 100%)",
                  border: "1px solid rgba(56, 189, 248, 0.35)",
                  borderRadius: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div>
                  <strong style={{ fontSize: "1rem", color: "#38bdf8", display: "flex", alignItems: "center", gap: 6 }}>
                    <span>📐</span>
                    <span>طراح بصری نقشه‌های اتوکد و Canvas (Visual CAD / SVG Designer)</span>
                  </strong>
                  <p className={ui.muted} style={{ margin: "4px 0 0", fontSize: "0.84rem" }}>
                    نقشه‌های P&ID پایپینگ، نقشه‌های تک‌خطی یا خروجی AutoCAD/Canva را باز کرده و پین‌های تلمتری را روی نقشه جانمایی کنید:
                  </p>
                </div>
                <button
                  type="button"
                  className={`${ui.button} ${ui.primary}`}
                  style={{ fontWeight: "bold", display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px" }}
                  onClick={() => setIsCadModalOpen(true)}
                >
                  <span>📐 باز کردن بوم طراح بصری نقشه...</span>
                </button>
              </div>

              {/* Custom Image / DXF File Card */}
              <div
                style={{
                  padding: "16px 20px",
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px dashed var(--color-border-subtle, rgba(255, 255, 255, 0.15))",
                  borderRadius: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <strong style={{ fontSize: "0.95rem" }}>🖼️ بارگذاری مستقیم نقشه یا تصویر تجهیز (AutoCAD DXF / SVG / PNG)</strong>
                    {(() => {
                      const hasCustom = Boolean(parsedDefaults.imageUrl || parsedDefaults.svgContent || parsedDefaults.backgroundImage);
                      if (!hasCustom) return null;
                      return (
                        <span style={{ fontSize: "0.72rem", background: "rgba(16, 185, 129, 0.2)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.4)", borderRadius: 12, padding: "2px 8px" }}>
                          ✓ فایل فعال است
                        </span>
                      );
                    })()}
                  </div>
                  <p className={ui.muted} style={{ margin: "4px 0 0", fontSize: "0.82rem" }}>
                    فایل‌های DXF خروجی اتوکد، نقشه‌های وکتور SVG یا تصاویر PNG/JPG تجهیز را بارگذاری کنید.
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {(() => {
                    const hasCustom = Boolean(parsedDefaults.imageUrl || parsedDefaults.svgContent || parsedDefaults.backgroundImage);
                    if (!hasCustom) return null;
                    return (
                      <button
                        type="button"
                        className={styles.deleteBtn}
                        style={{ padding: "8px 12px" }}
                        onClick={handleResetImage}
                        disabled={readOnly}
                        title="حذف تصویر بارگذاری‌شده"
                      >
                        🗑️ حذف تصویر
                      </button>
                    );
                  })()}
                  <label
                    className={ui.button}
                    style={{
                      cursor: readOnly ? "not-allowed" : "pointer",
                      background: "var(--color-brand, #0ea5e9)",
                      color: "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span>📁 انتخاب فایل DXF / SVG / عکس...</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp,.dxf,.dwg,.pwg,.dwf"
                      hidden
                      disabled={readOnly}
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        e.target.value = "";
                        handleImageUpload(f);
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: INPUTS & TELEMETRY BINDINGS */}
          {editorTab === "inputs" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong style={{ fontSize: "0.95rem" }}>پورت‌ها و ورودی‌های تله‌متری (Data Inputs & Signals)</strong>
                  <p className={ui.muted} style={{ fontSize: "0.8rem", margin: "2px 0 0" }}>
                    سیگنال‌های صنعتی که این کامپوننت از سنسورها، تگ‌های PLC و متغیرهای پلنت دریافت می‌کند:
                  </p>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    className={ui.button}
                    onClick={() => setForm({ ...form, inputs: [...form.inputs, emptyInput()] })}
                  >
                    + افزودن ورودی داده
                  </button>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {form.inputs.map((inp, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: "rgba(255, 255, 255, 0.02)",
                      border: "1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.08))",
                      borderRadius: 8,
                      padding: "12px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        className={ui.input}
                        placeholder="شناسه ورودی (input key)"
                        dir="ltr"
                        value={inp.key}
                        disabled={readOnly}
                        style={{ flex: 1.5 }}
                        onChange={(e) => {
                          const inputs = [...form.inputs];
                          inputs[idx] = { ...inp, key: e.target.value };
                          setForm({ ...form, inputs });
                        }}
                      />
                      <select
                        className={ui.select}
                        value={inp.dataType}
                        disabled={readOnly}
                        style={{ flex: 1 }}
                        onChange={(e) => {
                          const inputs = [...form.inputs];
                          inputs[idx] = { ...inp, dataType: e.target.value as InputDraft["dataType"] };
                          setForm({ ...form, inputs });
                        }}
                      >
                        <option value="number">عدد (number)</option>
                        <option value="integer">عدد صحیح (integer)</option>
                        <option value="string">رشته متنی (string)</option>
                        <option value="boolean">وضعیت بولی (boolean)</option>
                      </select>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={inp.required}
                          disabled={readOnly}
                          onChange={(e) => {
                            const inputs = [...form.inputs];
                            inputs[idx] = { ...inp, required: e.target.checked };
                            setForm({ ...form, inputs });
                          }}
                        />
                        <span>الزامی</span>
                      </label>
                      {!readOnly && (
                        <button
                          type="button"
                          className={styles.deleteBtn}
                          onClick={() => removeInput(idx)}
                          title="حذف این ورودی داده"
                        >
                          🗑️
                        </button>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: "0.82rem", color: "var(--color-text-muted, #8b98a5)" }}>
                      <span>منابع اتصال مجاز:</span>
                      {(
                        [
                          ["data_source_signal", "سیگنال زنده PLC"],
                          ["object_variable", "متغیر تجهیز"],
                          ["model_output", "خروجی مدل"],
                          ["static", "مقدار ثابت"],
                        ] as const
                      ).map(([src, faLabel]) => (
                        <label key={src} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={inp.sources[src]}
                            disabled={readOnly}
                            onChange={(e) => {
                              const inputs = [...form.inputs];
                              inputs[idx] = { ...inp, sources: { ...inp.sources, [src]: e.target.checked } };
                              setForm({ ...form, inputs });
                            }}
                          />
                          <span>{faLabel}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                {form.inputs.length === 0 && (
                  <div className={ui.muted} style={{ textAlign: "center", padding: 12 }}>
                    هیچ ورودی داده‌ای تعریف نشده است.
                  </div>
                )}
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Visual CAD Designer Modal */}
      {isCadModalOpen && (
        <VisualCadDesignerModal
          open={isCadModalOpen}
          onClose={() => setIsCadModalOpen(false)}
          initialSvg={(() => {
            return (
              (parsedDefaults.svgContent as string) ||
              (parsedDefaults.imageUrl as string) ||
              (parsedDefaults.backgroundImage as string) ||
              ""
            );
          })()}
          initialHotspots={(() => {
            const h = parsedDefaults.hotspots;
            return Array.isArray(h) ? (h as SvgHotspot[]) : [];
          })()}
          onApply={handleApplyCad}
        />
      )}
    </div>
  );
}
