import type { CSSProperties } from "react";
import type { BindingValue, RenderBundle } from "../../shared/api/types";
import { themeTokensFor } from "../../shared/appearance/tokens";
import type { Locale } from "../../shared/i18n";
import { DocumentRenderer, ThemeScope } from "../../shared/rendering/DocumentRenderer";
import { projectThemeToCssVars, projectThemeToTokens, type ProjectDataMode, type ProjectThemeConfig } from "../../shared/site-layout";
import type { AppearanceMode } from "../../shared/style-engine/parts";
import { TestDataBanner } from "../../shared/ui/TestDataBadge";

export function testDataBindings(bundle: RenderBundle): Record<string, boolean> {
  return Object.fromEntries(Object.entries(bundle.bindingOrigins ?? {}).map(([id, o]) => [id, o.isTestData]));
}

export function showsTestData(
  bundle: RenderBundle,
  values: Record<string, BindingValue>,
  dataEnvironment: ProjectDataMode = "auto"
): boolean {
  if (dataEnvironment === "test") return true;
  if (dataEnvironment === "live") return false;
  return bundle.containsTestData || Object.values(values).some((v) => v.isTestData);
}

export function RuntimePage({
  bundle,
  values,
  locale,
  appearanceMode = "night",
  onNavigate,
  omitHeaderSection = false,
  projectTheme,
  dataEnvironment = "auto",
}: {
  bundle: RenderBundle;
  values: Record<string, BindingValue>;
  locale: Locale;
  appearanceMode?: AppearanceMode;
  onNavigate?: (path: string) => void;
  omitHeaderSection?: boolean;
  projectTheme?: ProjectThemeConfig;
  dataEnvironment?: ProjectDataMode;
}) {
  if (!bundle || !bundle.document) {
    return null;
  }
  const authorTokens = bundle.theme?.tokens ?? {};
  const schemeTokens = themeTokensFor(appearanceMode);
  const projectTokens = projectTheme ? projectThemeToTokens(projectTheme, appearanceMode) : {};
  // Priority: scheme defaults < authorTokens (page bundle) < projectTheme (master project theme)
  const tokens = {
    ...schemeTokens,
    ...authorTokens,
    ...projectTokens,
    color: {
      ...((schemeTokens.color as Record<string, unknown>) ?? {}),
      ...((authorTokens.color as Record<string, unknown>) ?? {}),
      ...((projectTokens.color as Record<string, unknown>) ?? {}),
    },
    radius: {
      ...((authorTokens.radius as Record<string, unknown>) ?? {}),
      ...((projectTokens.radius as Record<string, unknown>) ?? {}),
    },
  };
  const projectVars = projectTheme ? projectThemeToCssVars(projectTheme, appearanceMode) : {};

  const documentToRender = omitHeaderSection && bundle.document.root?.children
    ? {
        ...bundle.document,
        root: {
          ...bundle.document.root,
          children: bundle.document.root.children.filter(
            (c) => !(c.type === "section" && (Boolean(c.props?.isSiteHeader) || Boolean(c.props?.fixedHeader) || Boolean(c.props?.sharedHeader)))
          ),
        },
      }
    : bundle.document;

  return (
    <ThemeScope tokens={tokens}>
      <div style={projectVars as CSSProperties}>
        {showsTestData(bundle, values, dataEnvironment) && <TestDataBanner />}
        <DocumentRenderer
          document={documentToRender}
          ctx={{
            components: bundle.components ?? [], values, testDataBindings: testDataBindings(bundle), locale, appearanceMode, onNavigate,
          }}
        />
      </div>
    </ThemeScope>
  );
}
