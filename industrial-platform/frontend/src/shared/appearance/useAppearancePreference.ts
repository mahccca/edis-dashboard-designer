import { useCallback, useEffect, useState } from "react";
import type { AppearanceMode } from "../style-engine/parts";
import { applyDocumentTheme } from "./tokens";

const GLOBAL_KEY = "ip.appearanceMode";

function storageKey(scope?: string): string {
  return scope ? `${GLOBAL_KEY}.${scope}` : GLOBAL_KEY;
}

function readStored(scope?: string): AppearanceMode | null {
  try {
    const raw = localStorage.getItem(storageKey(scope)) ?? (scope ? localStorage.getItem(GLOBAL_KEY) : null);
    return raw === "day" || raw === "night" ? raw : null;
  } catch {
    return null;
  }
}

function writeStored(mode: AppearanceMode, scope?: string): void {
  try {
    localStorage.setItem(storageKey(scope), mode);
    if (!scope) localStorage.setItem(GLOBAL_KEY, mode);
  } catch {
    /* private mode / quota — preference is still kept in memory */
  }
}

/**
 * Resolves day/night for the visitor: explicit user choice (localStorage) wins,
 * then the document/author default, then night.
 */
export function useAppearancePreference(documentDefault?: AppearanceMode | string | null, scope?: string) {
  const fallback: AppearanceMode = documentDefault === "day" ? "day" : "night";
  const [mode, setModeState] = useState<AppearanceMode>(() => readStored(scope) ?? fallback);

  useEffect(() => {
    const stored = readStored(scope);
    setModeState(stored ?? fallback);
  }, [fallback, scope]);

  useEffect(() => {
    applyDocumentTheme(mode);
  }, [mode]);

  const setMode = useCallback((next: AppearanceMode) => {
    writeStored(next, scope);
    setModeState(next);
  }, [scope]);

  const toggle = useCallback(() => {
    setMode(mode === "day" ? "night" : "day");
  }, [mode, setMode]);

  return { mode, setMode, toggle } as const;
}
