import type { DocNode, LocalizedText } from "../api/types";

export interface MenuItemConfig {
  id: string;
  label: LocalizedText;
  icon?: string;
  link: string;
  target?: "_self" | "_blank";
  isButton?: boolean;
  buttonVariant?: "primary" | "secondary" | "outline" | "danger";
}

export type MenuPosition = "right" | "left" | "bottom";

export type ItemOrientation = "row" | "row-reverse" | "column" | "column-reverse";
export type ItemAlignment = "start" | "center" | "end";
export type ItemSpacing = "sm" | "md" | "lg";
export type HeaderDensity = "compact" | "normal" | "spacious";
export type KpiChipLayout = "inline" | "stacked" | "card";
export type FooterLinksLayout = "column" | "row" | "grid";
export type FooterColumnsLayout = "3-col" | "2-col" | "stacked";
export type ProjectDataMode = "auto" | "test" | "live";

export interface HeaderLogoConfig {
  enabled: boolean;
  icon?: string;
  imageUrl?: string;
  title: LocalizedText;
  subtitle?: LocalizedText;
  size: "sm" | "md" | "lg";
  link: string;
  layout?: ItemOrientation; // "row" (default), "row-reverse", "column" (icon top, text below), "column-reverse"
  align?: ItemAlignment;    // "start", "center", "end"
  gap?: ItemSpacing;        // "sm" (6px), "md" (12px), "lg" (18px)
  showSubtitle?: boolean;   // default true
}

export interface HeaderMenuConfig {
  enabled: boolean;
  position: MenuPosition;
  hamburger: boolean;
  hamburgerSide: "right" | "left";
  items: MenuItemConfig[];
  itemLayout?: "row" | "row-reverse" | "column"; // "row" (beside), "column" (icon on top of label)
  gap?: ItemSpacing;                             // spacing between menu items
  showIcons?: boolean;                           // show/hide icons in menu
}

export interface HeaderExtraText {
  enabled: boolean;
  text: LocalizedText;
  badgeStyle: "none" | "info" | "success" | "warning";
  layout?: "row" | "row-reverse"; // dot on start vs end
}

export type HeaderSourceMode = "auto" | "standard" | "page-builder";

export interface HeaderKpiWidget {
  id: string;
  label: LocalizedText;
  value: string;
  unit?: string;
  status?: "good" | "warn" | "crit";
  icon?: string;
  // Dynamic API / Data Binding:
  dataSourceType?: "static" | "api" | "binding";
  apiUrl?: string;            // Direct API endpoint, e.g. /api/telemetry/power
  apiMethod?: "GET" | "POST";
  apiJsonPath?: string;       // JSONPath or dot-notation, e.g. $.value, power.active
  apiRefreshSeconds?: number; // Refresh interval in seconds (default 5)
  bindingId?: string;         // Binding ID from runtime live values / data-sources
}

export type ThemeTogglePlacement =
  | "header-left"
  | "header-right"
  | "header-menu"
  | "footer"
  | "floating-bottom-left"
  | "floating-bottom-right"
  | "hidden";

export type HeaderSectionId = "logo" | "menu" | "kpis" | "extra" | "themeToggle";

export interface HeaderConfig {
  enabled: boolean;
  source?: HeaderSourceMode;
  shareMainPageHeader?: boolean;
  sharedHeaderNode?: DocNode;
  sticky: boolean;
  blur: boolean;
  logo: HeaderLogoConfig;
  menu: HeaderMenuConfig;
  extraText: HeaderExtraText;
  kpiWidgets?: HeaderKpiWidget[];
  themeTogglePlacement?: ThemeTogglePlacement;
  headerOrder?: HeaderSectionId[];
  density?: HeaderDensity;    // "compact" (46px), "normal" (58px), "spacious" (72px)
  kpiLayout?: KpiChipLayout;  // "inline", "stacked", "card"
  showDataModeBadge?: boolean; // whether to show test/live data badge in header
}

export interface FooterConfig {
  enabled: boolean;
  sticky: boolean;
  copyright: LocalizedText;
  aboutText: LocalizedText;
  linksTitle: LocalizedText;
  links: MenuItemConfig[];
  showStatusIndicator: boolean;
  statusText: LocalizedText;
  themeTogglePlacement?: ThemeTogglePlacement;
  linksLayout?: FooterLinksLayout;       // "column", "row", "grid"
  columnsLayout?: FooterColumnsLayout;   // "3-col", "2-col", "stacked"
  align?: ItemAlignment;
}

export interface ColorSchemeTokens {
  surfaceBase: string;
  surfaceRaised: string;
  textPrimary: string;
  textMuted: string;
  borderSubtle: string;
}

export interface ProjectThemeConfig {
  brandColor: string;
  accentColor: string;
  borderRadius: "sm" | "md" | "lg" | "full";
  defaultAppearance?: "day" | "night" | "system";
  night: ColorSchemeTokens;
  day: ColorSchemeTokens;
}

export interface SiteLayoutConfig {
  projectId: string;
  header: HeaderConfig;
  footer: FooterConfig;
  theme: ProjectThemeConfig;
  themeTogglePlacement?: ThemeTogglePlacement;
  dataEnvironment?: ProjectDataMode; // "auto" (default) | "test" | "live"
  showDataModeBadge?: boolean;       // whether to show test/live environment indicator
  updatedAt?: string;
}

export type SiteLayoutDragKind =
  | "headerBlock"
  | "menuItem"
  | "kpi"
  | "themeToggle"
  | "footerLink";

export interface SiteLayoutDropTarget {
  targetId: string;
  placement: "before" | "after";
}

export interface SiteHeaderCanvasDrag {
  enabled?: boolean;
  activeId: string | null;
  dropTarget: SiteLayoutDropTarget | null;
  selectedId: string | null;
  onSelect?: (id: string, kind: SiteLayoutDragKind) => void;
  onDragStart?: (id: string, kind: SiteLayoutDragKind) => void;
  onDragOver?: (id: string, kind: SiteLayoutDragKind, placement: "before" | "after") => void;
  onDragLeave?: (id: string) => void;
  onDrop?: (targetId: string, placement: "before" | "after") => void;
  onDragEnd?: () => void;
}

export interface SiteFooterCanvasDrag {
  enabled?: boolean;
  activeId: string | null;
  dropTarget: SiteLayoutDropTarget | null;
  selectedId: string | null;
  onSelect?: (id: string, kind: "footer" | "footerLink" | "themeToggle") => void;
  onDragStart?: (id: string, kind: "footerLink" | "themeToggle") => void;
  onDragOver?: (id: string, kind: "footerLink" | "themeToggle", placement: "before" | "after") => void;
  onDragLeave?: (id: string) => void;
  onDrop?: (targetId: string, placement: "before" | "after") => void;
  onDragEnd?: () => void;
}

