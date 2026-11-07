import type { BindingValue, RenderBundle } from "../../shared/api/types";
import { themeTokensFor } from "../../shared/appearance/tokens";
import type { Locale } from "../../shared/i18n";
import { DocumentRenderer, ThemeScope } from "../../shared/rendering/DocumentRenderer";
import type { AppearanceMode } from "../../shared/style-engine/parts";
import { TestDataBanner } from "../../shared/ui/TestDataBadge";

export function testDataBindings(bundle: RenderBundle): Record<string, boolean> {
  return Object.fromEntries(Object.entries(bundle.bindingOrigins ?? {}).map(([id, o]) => [id, o.isTestData]));
}

export function showsTestData(bundle: RenderBundle, values: Record<string, BindingValue>): boolean {
  return bundle.containsTestData || Object.values(values).some((v) => v.isTestData);
}

export function RuntimePage({
  bundle, values, locale, appearanceMode = "night",
}: {
  bundle: RenderBundle;
  values: Record<string, BindingValue>;
  locale: Locale;
  appearanceMode?: AppearanceMode;
}) {
  const authorTokens = bundle.theme.tokens ?? {};
  const schemeTokens = themeTokensFor(appearanceMode);
  // Author theme tokens win when present; scheme fills surface/text defaults for day/night.
  const tokens = { ...schemeTokens, ...authorTokens };
  return (
    <ThemeScope tokens={tokens}>
      {showsTestData(bundle, values) && <TestDataBanner />}
      <DocumentRenderer
        document={bundle.document}
        ctx={{
          components: bundle.components, values, testDataBindings: testDataBindings(bundle), locale, appearanceMode,
        }}
      />
    </ThemeScope>
  );
}
