import type { DocNode } from "../api/types";
import type { AppearanceMode } from "../style-engine/parts";
import { createDefaultSiteLayout } from "./defaults";
import type { ProjectDataMode, ProjectThemeConfig, SiteLayoutConfig } from "./types";

const STORAGE_PREFIX = "ip.siteLayout.";

export function getSiteLayoutStorageKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId}`;
}

export function loadSiteLayout(projectId: string, projectName = "پروژه صنعتی", projectSlug = ""): SiteLayoutConfig {
  const fallback = createDefaultSiteLayout(projectId, projectName, projectSlug);
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const raw = localStorage.getItem(getSiteLayoutStorageKey(projectId))
      ?? (projectSlug ? localStorage.getItem(getSiteLayoutStorageKey(projectSlug)) : null);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SiteLayoutConfig>;
      const pHeader: Partial<SiteLayoutConfig["header"]> = parsed.header ?? {};
      const pFooter: Partial<SiteLayoutConfig["footer"]> = parsed.footer ?? {};
      const pTheme: Partial<SiteLayoutConfig["theme"]> = parsed.theme ?? {};

      return {
        ...fallback,
        ...parsed,
        projectId,
        dataEnvironment: parsed.dataEnvironment ?? fallback.dataEnvironment ?? "auto",
        showDataModeBadge: parsed.showDataModeBadge ?? fallback.showDataModeBadge ?? true,
        header: {
          ...fallback.header,
          ...pHeader,
          showDataModeBadge: pHeader.showDataModeBadge ?? fallback.header.showDataModeBadge ?? true,
          logo: {
            ...fallback.header.logo,
            ...(pHeader.logo ?? {}),
            size: (pHeader.logo?.size && ["sm", "md", "lg"].includes(pHeader.logo.size))
              ? pHeader.logo.size
              : fallback.header.logo.size,
          },
          menu: {
            ...fallback.header.menu,
            ...(pHeader.menu ?? {}),
            items: Array.isArray(pHeader.menu?.items) ? pHeader.menu.items : fallback.header.menu.items,
          },
          extraText: {
            ...fallback.header.extraText,
            ...(pHeader.extraText ?? {}),
          },
          shareMainPageHeader: pHeader.shareMainPageHeader ?? fallback.header.shareMainPageHeader ?? true,
          sharedHeaderNode: pHeader.sharedHeaderNode ?? fallback.header.sharedHeaderNode,
          kpiWidgets: Array.isArray(pHeader.kpiWidgets)
            ? pHeader.kpiWidgets
            : fallback.header.kpiWidgets ?? [],
        },
        footer: {
          ...fallback.footer,
          ...pFooter,
          links: Array.isArray(pFooter.links) ? pFooter.links : fallback.footer.links,
        },
        theme: {
          ...fallback.theme,
          ...pTheme,
          night: { ...fallback.theme.night, ...(pTheme.night ?? {}) },
          day: { ...fallback.theme.day, ...(pTheme.day ?? {}) },
        },
      };
    }
  } catch {
    /* fallback to defaults */
  }
  return fallback;
}

export function saveSiteLayout(config: SiteLayoutConfig, projectSlug?: string): void {
  if (typeof window === "undefined") return;
  try {
    const data = JSON.stringify({ ...config, updatedAt: new Date().toISOString() });
    localStorage.setItem(getSiteLayoutStorageKey(config.projectId), data);
    if (projectSlug) {
      localStorage.setItem(getSiteLayoutStorageKey(projectSlug), data);
    }
    window.dispatchEvent(new CustomEvent("ip-site-layout-change", { detail: { projectId: config.projectId } }));
  } catch {
    /* quota / private mode */
  }
}

export function projectThemeToCssVars(theme: ProjectThemeConfig, mode: AppearanceMode): Record<string, string> {
  const scheme = mode === "day" ? theme.day : theme.night;
  const radiusMap: Record<string, string> = {
    sm: "4px",
    md: "8px",
    lg: "12px",
    full: "20px",
  };

  return {
    "--color-brand": theme.brandColor,
    "--color-accent": theme.accentColor,
    "--color-accent-primary": theme.accentColor,
    "--color-surface-base": scheme.surfaceBase,
    "--color-surface-raised": scheme.surfaceRaised,
    "--color-text-primary": scheme.textPrimary,
    "--color-text-muted": scheme.textMuted,
    "--color-border-subtle": scheme.borderSubtle,
    "--radius-md": radiusMap[theme.borderRadius] ?? "8px",
  };
}

export function projectThemeToTokens(theme: ProjectThemeConfig, mode: AppearanceMode): Record<string, unknown> {
  const scheme = mode === "day" ? theme.day : theme.night;
  const radiusMap: Record<string, string> = {
    sm: "4px",
    md: "8px",
    lg: "12px",
    full: "20px",
  };

  return {
    color: {
      brand: theme.brandColor,
      accent: theme.accentColor,
      surface: {
        base: scheme.surfaceBase,
        raised: scheme.surfaceRaised,
      },
      text: {
        primary: scheme.textPrimary,
        muted: scheme.textMuted,
      },
      border: {
        subtle: scheme.borderSubtle,
      },
    },
    radius: {
      md: radiusMap[theme.borderRadius] ?? "8px",
    },
  };
}

export function saveSharedHeaderNode(projectId: string, node: DocNode | null, projectSlug?: string): void {
  const layout = loadSiteLayout(projectId, "پروژه صنعتی", projectSlug);
  layout.header.sharedHeaderNode = node ?? undefined;
  saveSiteLayout(layout, projectSlug);
}

export function getSharedHeaderNode(projectId: string, projectSlug?: string): DocNode | null {
  const layout = loadSiteLayout(projectId, "پروژه صنعتی", projectSlug);
  return layout.header.sharedHeaderNode ?? null;
}

export function getProjectDataMode(projectId: string, projectSlug?: string): ProjectDataMode {
  const layout = loadSiteLayout(projectId, "پروژه صنعتی", projectSlug);
  return layout.dataEnvironment ?? "auto";
}

export function setProjectDataMode(projectId: string, mode: ProjectDataMode, projectSlug?: string): void {
  const layout = loadSiteLayout(projectId, "پروژه صنعتی", projectSlug);
  layout.dataEnvironment = mode;
  saveSiteLayout(layout, projectSlug);
}

