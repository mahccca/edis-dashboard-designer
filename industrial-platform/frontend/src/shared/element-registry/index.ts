import type { ComponentType } from "react";
import type { BindingValue, ComponentSpec, DocNode, StyleBlock, StyleValue } from "../api/types";
import type { Locale } from "../i18n";
import { Chart } from "../renderers/Chart";
import { Gauge } from "../renderers/Gauge";
import { ImageWidget } from "../renderers/ImageWidget";
import { KpiCard } from "../renderers/KpiCard";
import { MapWidget } from "../renderers/MapWidget";
import { IndustrialPanelWidget } from "../renderers/IndustrialPanelWidget";
import { SvgCadWidget } from "../renderers/SvgCadWidget";
import { Model3dWidget } from "../renderers/Model3dWidget";
import type { AppearanceMode, StylePartDef } from "../style-engine/parts";

/** Studio-only: pencil tool picks a named part of a component for the floating style editor. */
export interface StyleEditHooks {
  active: boolean;
  focus: { nodeId: string; part: string } | null;
  appearanceMode: AppearanceMode;
  onPickPart: (nodeId: string, part: string, parts: StylePartDef[], anchor: DOMRect) => void;
  /** Live patch while dragging a resize handle (does not close the popover). */
  onPatchPart: (nodeId: string, part: string, key: string, value: StyleValue | undefined) => void;
  /** Push an undo checkpoint once at the start of a resize drag. */
  onResizeStart: () => void;
}

export interface RendererProps {
  node: DocNode;
  spec: ComponentSpec;
  /** input key -> resolved value (absent while loading). */
  inputs: Record<string, BindingValue | undefined>;
  /** input key -> the binding is fed by test data (known from the bundle even before values arrive). */
  testData: Record<string, boolean>;
  locale: Locale;
  /** Active day/night appearance for resolving partStyles / partStylesDay. */
  appearanceMode?: AppearanceMode;
  /** Page-wide style defaults from document.settings (scope «همه آیتم‌ها»). */
  pagePartBag?: Record<string, StyleBlock>;
  styleEdit?: StyleEditHooks;
}

// Only renderers compiled into the app can run (ADR-0007); component definitions reference them by id.
const REGISTRY = new Map<string, ComponentType<RendererProps>>([
  ["builtin.kpi-card@1", KpiCard],
  ["builtin.gauge@1", Gauge],
  ["builtin.image@1", ImageWidget],
  ["builtin.chart@1", Chart],
  ["builtin.map@1", MapWidget],
  ["builtin.industrial-panel@1", IndustrialPanelWidget],
  ["builtin.svg-cad@1", SvgCadWidget],
  ["builtin.model-3d@1", Model3dWidget],
]);

export function getRenderer(rendererId: string): ComponentType<RendererProps> | undefined {
  return REGISTRY.get(rendererId);
}

export function registeredRenderers(): string[] {
  return [...REGISTRY.keys()];
}
