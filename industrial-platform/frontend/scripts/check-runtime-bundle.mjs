// AT-11: the runtime entry must not ship studio/editor code or secrets.
// Follows every JS chunk reachable from dist/runtime.html (static imports) and greps for forbidden markers.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");
// "password" alone is not usable: react-dom lists it as an input type.
const FORBIDDEN = ["data-studio-only", "dnd-kit", "baseUrl", "10.8.0.8", "postgresql", "IP_DATABASE_URL", "mongodb://", "IP_MONGODB", "IP_NEW_USER_PASSWORD", "IP_NEW_APP_USER_PASSWORD", "/auth/login"];

const html = readFileSync(join(dist, "runtime.html"), "utf8");
const queue = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
const seen = new Set();
const problems = [];

while (queue.length) {
  const file = queue.shift();
  if (seen.has(file)) continue;
  seen.add(file);
  const path = join(dist, file);
  if (!existsSync(path)) continue;
  const code = readFileSync(path, "utf8");
  for (const needle of FORBIDDEN) if (code.includes(needle)) problems.push(`${file} contains "${needle}"`);
  for (const m of code.matchAll(/from\s*"\.\/([^"]+\.js)"|import\(\s*"\.\/([^"]+\.js)"\s*\)/g)) queue.push(`assets/${m[1] ?? m[2]}`);
}

const studioHtml = readFileSync(join(dist, "index.html"), "utf8");
const studioEntry = [...studioHtml.matchAll(/src="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
const studioHasMarker = studioEntry.some((f) => readFileSync(join(dist, f), "utf8").includes("data-studio-only"));

if (!seen.size) problems.push("no runtime chunks found");
if (!studioHasMarker) problems.push("marker missing from studio bundle (check is not effective)");
if (problems.length) {
  console.error("runtime bundle check FAILED:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log(`runtime bundle check OK: ${seen.size} chunk(s) reachable from runtime.html, no studio code or secrets`);
