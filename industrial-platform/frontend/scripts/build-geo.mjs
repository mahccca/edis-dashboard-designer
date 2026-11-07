/**
 * Split world-atlas into per-region GeoJSON files so the map widget
 * only fetches the selected scope (never the full country set for a city view).
 *
 * Run: node scripts/build-geo.mjs
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { feature } = require("topojson-client");
const topo = require("world-atlas/countries-110m.json");

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "geo");
const countries = feature(topo, topo.objects.countries);
const landFc = feature(topo, topo.objects.land);
const landFeature = landFc.type === "FeatureCollection" ? landFc.features[0] : landFc;

/** ISO 3166-1 numeric → continent (curated; unknown → OT). */
const CONTINENT = {
  4: "AS", 8: "EU", 12: "AF", 20: "EU", 24: "AF", 28: "NA", 31: "AS", 32: "SA", 36: "OC", 40: "EU",
  44: "NA", 48: "AS", 50: "AS", 51: "AS", 56: "EU", 64: "AS", 68: "SA", 70: "EU", 72: "AF", 76: "SA",
  84: "NA", 90: "OC", 96: "AS", 100: "EU", 104: "AS", 108: "AF", 112: "EU", 116: "AS", 120: "AF",
  124: "NA", 140: "AF", 144: "AS", 148: "AF", 152: "SA", 156: "AS", 158: "AS", 170: "SA", 178: "AF",
  180: "AF", 188: "NA", 191: "EU", 192: "NA", 196: "EU", 203: "EU", 204: "AF", 208: "EU", 214: "NA",
  218: "SA", 222: "NA", 226: "AF", 231: "AF", 232: "AF", 233: "EU", 238: "SA", 242: "OC", 246: "EU",
  250: "EU", 258: "OC", 262: "AF", 266: "AF", 268: "AS", 270: "AF", 275: "AS", 276: "EU", 288: "AF",
  300: "EU", 304: "NA", 320: "NA", 324: "AF", 328: "SA", 332: "NA", 340: "NA", 348: "EU", 352: "EU",
  356: "AS", 360: "AS", 364: "AS", 368: "AS", 372: "EU", 376: "AS", 380: "EU", 384: "AF", 388: "NA",
  392: "AS", 398: "AS", 400: "AS", 404: "AF", 408: "AS", 410: "AS", 414: "AS", 417: "AS", 418: "AS",
  422: "AS", 426: "AF", 428: "EU", 430: "AF", 434: "AF", 440: "EU", 442: "EU", 450: "AF", 454: "AF",
  458: "AS", 462: "AS", 466: "AF", 478: "AF", 480: "AF", 484: "NA", 496: "AS", 498: "EU", 499: "EU",
  504: "AF", 508: "AF", 512: "AS", 516: "AF", 524: "AS", 528: "EU", 540: "OC", 548: "OC", 554: "OC",
  558: "NA", 562: "AF", 566: "AF", 578: "EU", 586: "AS", 591: "NA", 598: "OC", 600: "SA", 604: "SA",
  608: "AS", 616: "EU", 620: "EU", 624: "AF", 626: "AS", 634: "AS", 642: "EU", 643: "EU", 646: "AF",
  682: "AS", 686: "AF", 688: "EU", 694: "AF", 702: "AS", 703: "EU", 704: "AS", 705: "EU", 706: "AF",
  710: "AF", 716: "AF", 724: "EU", 728: "AF", 729: "AF", 732: "AF", 740: "SA", 748: "AF", 752: "EU",
  756: "EU", 760: "AS", 762: "AS", 764: "AS", 768: "AF", 780: "NA", 784: "AS", 788: "AF", 792: "AS",
  795: "AS", 800: "AF", 804: "EU", 807: "EU", 818: "AF", 826: "EU", 834: "AF", 840: "NA", 854: "AF",
  858: "SA", 860: "AS", 862: "SA", 887: "AS", 894: "AF",
};

const CONTINENT_META = {
  AF: { fa: "آفریقا", en: "Africa" },
  AS: { fa: "آسیا", en: "Asia" },
  EU: { fa: "اروپا", en: "Europe" },
  NA: { fa: "آمریکای شمالی", en: "North America" },
  SA: { fa: "آمریکای جنوبی", en: "South America" },
  OC: { fa: "اقیانوسیه", en: "Oceania" },
  AN: { fa: "جنوبگان", en: "Antarctica" },
};

/** Hand-simplified Iran provinces (enough detail for crop/fit; tiny payloads). */
const IRAN_PROVINCES = [
  { id: "IR-07", fa: "تهران", en: "Tehran", ring: [[50.5, 35.2], [52.2, 35.2], [52.2, 36.0], [50.5, 36.0], [50.5, 35.2]] },
  { id: "IR-11", fa: "اصفهان", en: "Isfahan", ring: [[50.5, 31.5], [53.5, 31.5], [53.5, 34.0], [50.5, 34.0], [50.5, 31.5]] },
  { id: "IR-10", fa: "فارس", en: "Fars", ring: [[51.0, 27.5], [55.0, 27.5], [55.0, 31.2], [51.0, 31.2], [51.0, 27.5]] },
  { id: "IR-01", fa: "خوزستان", en: "Khuzestan", ring: [[47.6, 29.9], [50.2, 29.9], [50.2, 32.6], [47.6, 32.6], [47.6, 29.9]] },
  { id: "IR-13", fa: "خراسان رضوی", en: "Razavi Khorasan", ring: [[56.5, 34.0], [61.2, 34.0], [61.2, 37.8], [56.5, 37.8], [56.5, 34.0]] },
  { id: "IR-04", fa: "آذربایجان شرقی", en: "East Azerbaijan", ring: [[45.3, 37.2], [48.0, 37.2], [48.0, 39.5], [45.3, 39.5], [45.3, 37.2]] },
  { id: "IR-16", fa: "کرمان", en: "Kerman", ring: [[54.5, 27.0], [59.5, 27.0], [59.5, 32.0], [54.5, 32.0], [54.5, 27.0]] },
  { id: "IR-23", fa: "گیلان", en: "Gilan", ring: [[48.5, 36.6], [50.6, 36.6], [50.6, 38.5], [48.5, 38.5], [48.5, 36.6]] },
  { id: "IR-27", fa: "مازندران", en: "Mazandaran", ring: [[50.3, 35.8], [54.0, 35.8], [54.0, 36.9], [50.3, 36.9], [50.3, 35.8]] },
  { id: "IR-28", fa: "سیستان و بلوچستان", en: "Sistan and Baluchestan", ring: [[58.8, 25.0], [63.3, 25.0], [63.3, 31.5], [58.8, 31.5], [58.8, 25.0]] },
];

const IRAN_CITIES = [
  { id: "IR-THR", fa: "تهران", en: "Tehran City", lon: 51.39, lat: 35.69, parent: "IR-07" },
  { id: "IR-IFN", fa: "اصفهان", en: "Isfahan City", lon: 51.67, lat: 32.65, parent: "IR-11" },
  { id: "IR-SHZ", fa: "شیراز", en: "Shiraz", lon: 52.53, lat: 29.61, parent: "IR-10" },
  { id: "IR-AHW", fa: "اهواز", en: "Ahvaz", lon: 48.67, lat: 31.32, parent: "IR-01" },
  { id: "IR-MSH", fa: "مشهد", en: "Mashhad", lon: 59.62, lat: 36.26, parent: "IR-13" },
  { id: "IR-TBZ", fa: "تبریز", en: "Tabriz", lon: 46.29, lat: 38.08, parent: "IR-04" },
];

function ensure(dir) {
  mkdirSync(dir, { recursive: true });
}

function writeJson(path, data) {
  ensure(dirname(path));
  writeFileSync(path, JSON.stringify(data));
}

function bboxOf(geom) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walkCoords = (c) => {
    if (typeof c[0] === "number") {
      minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]);
      minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]);
      return;
    }
    for (const x of c) walkCoords(x);
  };
  if (!geom) return [0, 0, 0, 0];
  if (geom.type === "GeometryCollection") {
    for (const g of geom.geometries || []) walkCoords(g.coordinates);
  } else {
    walkCoords(geom.coordinates);
  }
  if (!Number.isFinite(minX)) return [0, 0, 0, 0];
  return [minX, minY, maxX, maxY];
}

function featureBbox(f) {
  return bboxOf(f.geometry);
}

function collectionBbox(fc) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of fc.features) {
    const b = featureBbox(f);
    minX = Math.min(minX, b[0]); minY = Math.min(minY, b[1]);
    maxX = Math.max(maxX, b[2]); maxY = Math.max(maxY, b[3]);
  }
  return [minX, minY, maxX, maxY];
}

function circleRing(lon, lat, r = 0.18, n = 24) {
  const ring = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    ring.push([lon + r * Math.cos(a) / Math.cos((lat * Math.PI) / 180), lat + r * Math.sin(a)]);
  }
  return ring;
}

// --- world land (coarse, single file for world overview) ---
const worldFc = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    id: "WORLD",
    properties: { id: "WORLD", nameFa: "جهان", nameEn: "World", level: "world" },
    geometry: landFeature.geometry,
  }],
};
writeJson(join(root, "world", "WORLD.json"), worldFc);

const byContinent = Object.fromEntries(Object.keys(CONTINENT_META).map((k) => [k, []]));
const countryIndex = [];

for (const f of countries.features) {
  const id = String(f.id);
  const num = Number(id);
  const cont = CONTINENT[num] || "OT";
  const nameEn = f.properties?.name || id;
  const enriched = {
    type: "Feature",
    id,
    properties: {
      id,
      isoNumeric: id,
      nameEn,
      nameFa: nameEn,
      level: "country",
      continent: cont,
    },
    geometry: f.geometry,
  };
  if (byContinent[cont]) byContinent[cont].push(enriched);
  countryIndex.push({
    id,
    level: "country",
    continent: cont,
    name: { fa: nameEn, en: nameEn },
    path: `country/${id}.json`,
    bbox: featureBbox(enriched),
  });
  writeJson(join(root, "country", `${id}.json`), { type: "FeatureCollection", features: [enriched] });
}

const continentNodes = [];
for (const [code, meta] of Object.entries(CONTINENT_META)) {
  const feats = byContinent[code] || [];
  if (!feats.length) continue;
  const fc = { type: "FeatureCollection", features: feats };
  writeJson(join(root, "continent", `${code}.json`), fc);
  continentNodes.push({
    id: code,
    level: "continent",
    name: meta,
    path: `continent/${code}.json`,
    bbox: collectionBbox(fc),
    children: feats.map((f) => f.properties.id),
  });
}

// Iran provinces + cities (local pack; not the world file)
const provinceNodes = [];
for (const p of IRAN_PROVINCES) {
  const f = {
    type: "Feature",
    id: p.id,
    properties: { id: p.id, nameFa: p.fa, nameEn: p.en, level: "province", country: "364" },
    geometry: { type: "Polygon", coordinates: [p.ring] },
  };
  const fc = { type: "FeatureCollection", features: [f] };
  writeJson(join(root, "province", `${p.id}.json`), fc);
  const cities = IRAN_CITIES.filter((c) => c.parent === p.id).map((c) => c.id);
  provinceNodes.push({
    id: p.id,
    level: "province",
    country: "364",
    name: { fa: p.fa, en: p.en },
    path: `province/${p.id}.json`,
    bbox: featureBbox(f),
    children: cities,
  });
}

const cityNodes = [];
for (const c of IRAN_CITIES) {
  const f = {
    type: "Feature",
    id: c.id,
    properties: { id: c.id, nameFa: c.fa, nameEn: c.en, level: "city", province: c.parent, country: "364" },
    geometry: { type: "Polygon", coordinates: [circleRing(c.lon, c.lat)] },
  };
  const fc = { type: "FeatureCollection", features: [f] };
  writeJson(join(root, "city", `${c.id}.json`), fc);
  cityNodes.push({
    id: c.id,
    level: "city",
    province: c.parent,
    country: "364",
    name: { fa: c.fa, en: c.en },
    path: `city/${c.id}.json`,
    bbox: featureBbox(f),
    children: [],
  });
}

// Country Iran also gets a combined provinces pack for drill-down preview (still not world)
writeJson(join(root, "packs", "IR-provinces.json"), {
  type: "FeatureCollection",
  features: IRAN_PROVINCES.map((p) => ({
    type: "Feature",
    id: p.id,
    properties: { id: p.id, nameFa: p.fa, nameEn: p.en, level: "province", country: "364" },
    geometry: { type: "Polygon", coordinates: [p.ring] },
  })),
});

const catalog = {
  schemaVersion: 1,
  defaultRegion: "364",
  levels: ["world", "continent", "country", "province", "city"],
  world: {
    id: "WORLD",
    level: "world",
    name: { fa: "جهان", en: "World" },
    path: "world/WORLD.json",
    bbox: collectionBbox(worldFc),
    children: continentNodes.map((c) => c.id),
  },
  continents: continentNodes,
  countries: countryIndex.filter((c) =>
    c.continent === "AS"
    || ["276", "826", "840", "250", "380", "724", "643", "36", "124", "76", "710"].includes(c.id)
  ),
  provinces: provinceNodes,
  cities: cityNodes,
  /** Resolve table for the widget */
  byId: {},
};

for (const n of [catalog.world, ...continentNodes, ...catalog.countries, ...provinceNodes, ...cityNodes]) {
  catalog.byId[n.id] = n;
}

// Iran: drill into local province pack (still one small file — not the world atlas).
if (catalog.byId["364"]) {
  catalog.byId["364"].children = provinceNodes.map((p) => p.id);
  catalog.byId["364"].packPath = "packs/IR-provinces.json";
  const ir = catalog.countries.find((c) => c.id === "364");
  if (ir) {
    ir.children = catalog.byId["364"].children;
    ir.packPath = catalog.byId["364"].packPath;
  }
}

writeJson(join(root, "catalog.json"), catalog);

const sizes = [];
function walk(dir, prefix = "") {
  for (const name of require("node:fs").readdirSync(dir)) {
    const p = join(dir, name);
    const st = require("node:fs").statSync(p);
    if (st.isDirectory()) walk(p, `${prefix}${name}/`);
    else sizes.push([`${prefix}${name}`, st.size]);
  }
}
walk(root);
sizes.sort((a, b) => b[1] - a[1]);
console.log("geo build OK");
console.log("largest:", sizes.slice(0, 8).map(([n, s]) => `${n}=${Math.round(s / 1024)}KB`).join(", "));
console.log("files:", sizes.length, "totalKB=", Math.round(sizes.reduce((a, [, s]) => a + s, 0) / 1024));
