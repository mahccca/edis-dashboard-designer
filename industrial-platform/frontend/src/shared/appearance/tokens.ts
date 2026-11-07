import type { AppearanceMode } from "../style-engine/parts";

export const NIGHT_THEME_TOKENS = {
  color: {
    surface: { base: "#0f1419", raised: "#18202a" },
    text: { primary: "#e6edf3", muted: "#8b98a5" },
    border: { subtle: "#2a3440" },
  },
};

export const DAY_THEME_TOKENS = {
  color: {
    surface: { base: "#f0f3f7", raised: "#ffffff" },
    text: { primary: "#1f2328", muted: "#656d76" },
    border: { subtle: "#d0d7de" },
  },
};

export function themeTokensFor(mode: AppearanceMode): Record<string, unknown> {
  return mode === "day" ? DAY_THEME_TOKENS : NIGHT_THEME_TOKENS;
}

export function applyDocumentTheme(mode: AppearanceMode): void {
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode === "day" ? "light" : "dark";
}
