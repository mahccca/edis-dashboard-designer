import type { LocalizedText } from "./api/types";

export type Locale = "fa" | "en";

export function localize(text: LocalizedText | undefined | null, locale: Locale): string {
  if (text == null) return "";
  if (typeof text === "string") return text;
  return text[locale] ?? text.en ?? text.fa ?? Object.values(text)[0] ?? "";
}

export const TEST_DATA_LABEL = { fa: "داده آزمایشی", en: "Test data" } as const;
