// ADR-0006: the runtime app must not depend on studio code (src/modules/**). Follows the static import graph.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(import.meta.dirname);

function imports(file: string): string[] {
  const code = readFileSync(file, "utf8");
  return [...code.matchAll(/(?:import|export)\s[^"']*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)]
    .map((m) => m[1] ?? m[2] ?? "")
    .filter((s) => s.startsWith("."));
}

function resolveImport(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts"), resolve(base, "index.tsx")]) {
    if (existsSync(candidate) && /\.(ts|tsx)$/.test(candidate)) return candidate;
  }
  return null;
}

function graph(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of imports(file)) {
      const target = resolveImport(file, spec);
      if (target) queue.push(target);
    }
  }
  return seen;
}

describe("module boundaries", () => {
  it("runtime entry reaches no studio module", () => {
    const files = [...graph(resolve(SRC, "apps/runtime/main.tsx"))].map((f) => f.slice(SRC.length + 1).replace(/\\/g, "/"));
    expect(files).toContain("shared/renderers/KpiCard.tsx");
    expect(files.filter((f) => f.startsWith("modules/") || f.startsWith("apps/studio/"))).toEqual([]);
  });

  it("shared code never imports apps or modules", () => {
    const shared = [...graph(resolve(SRC, "shared/rendering/DocumentRenderer.tsx")), ...graph(resolve(SRC, "shared/live-data/index.ts"))]
      .map((f) => f.slice(SRC.length + 1).replace(/\\/g, "/"));
    expect(shared.every((f) => f.startsWith("shared/"))).toBe(true);
  });
});
