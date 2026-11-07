/**
 * Build real Iran country + province GeoJSON (simplified) into public/geo.
 * Source: geoBoundaries ADM1 simplified (~1MB) → Douglas-Peucker → ~100KB pack.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { feature } = require("topojson-client");
const topo = require("world-atlas/countries-110m.json");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const geoRoot = join(root, "public", "geo");
const src = join(root, "scripts", "p-geoBoundaries-IRN-ADM1_simplified.geojson");

const FA = {
  "East Azerbaijan": "آذربایجان شرقی",
  "West Azerbaijan": "آذربایجان غربی",
  Ardabil: "اردبیل",
  Isfahan: "اصفهان",
  Alborz: "البرز",
  Ilam: "ایلام",
  Bushehr: "بوشهر",
  Tehran: "تهران",
  "Chaharmahal and Bakhtiari": "چهارمحال و بختیاری",
  "South Khorasan": "خراسان جنوبی",
  "Razavi Khorasan": "خراسان رضوی",
  "North Khorasan": "خراسان شمالی",
  Khuzestan: "خوزستان",
  Zanjan: "زنجان",
  Semnan: "سمنان",
  "Sistan and Baluchestan": "سیستان و بلوچستان",
  Fars: "فارس",
  Qazvin: "قزوین",
  Qom: "قم",
  Kurdistan: "کردستان",
  Kerman: "کرمان",
  Kermanshah: "کرمانشاه",
  "Kohgiluyeh and Boyer-Ahmad": "کهگیلویه و بویراحمد",
  Golestan: "گلستان",
  Gilan: "گیلان",
  Lorestan: "لرستان",
  Mazandaran: "مازندران",
  Markazi: "مرکزی",
  Hormozgan: "هرمزگان",
  Hamadan: "همدان",
  Yazd: "یزد",
};

const CITY_SEED = [
  { id: "IR-THR", fa: "تهران", en: "Tehran", lon: 51.39, lat: 35.69, parent: "IR-07" },
  { id: "IR-IFN", fa: "اصفهان", en: "Isfahan", lon: 51.67, lat: 32.65, parent: "IR-04" },
  { id: "IR-SHZ", fa: "شیراز", en: "Shiraz", lon: 52.53, lat: 29.61, parent: "IR-14" },
  { id: "IR-AHW", fa: "اهواز", en: "Ahvaz", lon: 48.67, lat: 31.32, parent: "IR-10" },
  { id: "IR-MSH", fa: "مشهد", en: "Mashhad", lon: 59.62, lat: 36.26, parent: "IR-30" },
  { id: "IR-TBZ", fa: "تبریز", en: "Tabriz", lon: 46.29, lat: 38.08, parent: "IR-01" },
];

function ensure(dir) {
  mkdirSync(dir, { recursive: true });
}

function dist(a, b, c) {
  // perpendicular distance from point b to segment a-c
  const [x, y] = b;
  const [x1, y1] = a;
  const [x2, y2] = c;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
  const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
  const u = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (x1 + u * dx), y - (y1 + u * dy));
}

function douglasPeucker(points, eps) {
  if (points.length < 3) return points.slice();
  let maxD = 0;
  let idx = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = dist(points[0], points[i], points[end]);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > eps) {
    const left = douglasPeucker(points.slice(0, idx + 1), eps);
    const right = douglasPeucker(points.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[end]];
}

function simplifyRing(ring, eps) {
  if (!ring || ring.length < 4) return ring;
  const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  const body = closed ? ring.slice(0, -1) : ring.slice();
  let simplified = douglasPeucker(body, eps);
  if (simplified.length < 3) simplified = body.filter((_, i) => i % 8 === 0);
  if (closed) simplified = simplified.concat([simplified[0]]);
  return simplified;
}

function simplifyGeom(geom, eps) {
  if (geom.type === "Polygon") {
    return { type: "Polygon", coordinates: geom.coordinates.map((r) => simplifyRing(r, eps)) };
  }
  if (geom.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geom.coordinates.map((poly) => poly.map((r) => simplifyRing(r, eps))),
    };
  }
  return geom;
}

function bboxOf(geom) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (c) => {
    if (typeof c[0] === "number") {
      minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]);
      minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]);
      return;
    }
    for (const x of c) walk(x);
  };
  walk(geom.coordinates);
  return [minX, minY, maxX, maxY];
}

function circleRing(lon, lat, r = 0.12, n = 20) {
  const ring = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    ring.push([lon + (r * Math.cos(a)) / Math.cos((lat * Math.PI) / 180), lat + r * Math.sin(a)]);
  }
  return ring;
}

const adm = JSON.parse(readFileSync(src, "utf8"));
const seen = new Set();
const provinces = [];
for (const f of adm.features) {
  const en = f.properties.shapeName;
  let id = f.properties.shapeISO;
  if (!id && en === "Tehran") id = "IR-07";
  if (!id || seen.has(id)) continue;
  seen.add(id);
  const geom = simplifyGeom(f.geometry, 0.035);
  const feature = {
    type: "Feature",
    id,
    properties: {
      id,
      nameEn: en,
      nameFa: FA[en] || en,
      level: "province",
      country: "364",
    },
    geometry: geom,
  };
  provinces.push(feature);
  ensure(join(geoRoot, "province"));
  writeFileSync(join(geoRoot, "province", `${id}.json`), JSON.stringify({ type: "FeatureCollection", features: [feature] }));
}

const pack = { type: "FeatureCollection", features: provinces };
ensure(join(geoRoot, "packs"));
writeFileSync(join(geoRoot, "packs", "IR-provinces.json"), JSON.stringify(pack));

// Real Iran outline from Natural Earth 110m (looks like Iran, tiny file).
const countries = feature(topo, topo.objects.countries);
const iran = countries.features.find((f) => String(f.id) === "364");
if (!iran) throw new Error("Iran (364) missing from world-atlas");
const iranFeature = {
  type: "Feature",
  id: "364",
  properties: {
    id: "364",
    isoNumeric: "364",
    nameEn: "Iran",
    nameFa: "ایران",
    level: "country",
    continent: "AS",
  },
  geometry: iran.geometry,
};
ensure(join(geoRoot, "country"));
writeFileSync(
  join(geoRoot, "country", "364.json"),
  JSON.stringify({ type: "FeatureCollection", features: [iranFeature] }),
);

const cities = [];
for (const c of CITY_SEED) {
  const feature = {
    type: "Feature",
    id: c.id,
    properties: {
      id: c.id,
      nameFa: c.fa,
      nameEn: c.en,
      level: "city",
      province: c.parent,
      country: "364",
    },
    geometry: { type: "Polygon", coordinates: [circleRing(c.lon, c.lat)] },
  };
  cities.push(feature);
  ensure(join(geoRoot, "city"));
  writeFileSync(join(geoRoot, "city", `${c.id}.json`), JSON.stringify({ type: "FeatureCollection", features: [feature] }));
}

// Patch catalog.json region entries for Iran provinces/cities.
const catalogPath = join(geoRoot, "catalog.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
catalog.provinces = provinces.map((f) => ({
  id: f.properties.id,
  level: "province",
  country: "364",
  name: { fa: f.properties.nameFa, en: f.properties.nameEn },
  path: `province/${f.properties.id}.json`,
  bbox: bboxOf(f.geometry),
  children: CITY_SEED.filter((c) => c.parent === f.properties.id).map((c) => c.id),
}));
catalog.cities = cities.map((f) => ({
  id: f.properties.id,
  level: "city",
  province: f.properties.province,
  country: "364",
  name: { fa: f.properties.nameFa, en: f.properties.nameEn },
  path: `city/${f.properties.id}.json`,
  bbox: bboxOf(f.geometry),
  children: [],
}));

for (const n of [...catalog.provinces, ...catalog.cities]) catalog.byId[n.id] = n;

if (catalog.byId["364"]) {
  catalog.byId["364"].name = { fa: "ایران", en: "Iran" };
  catalog.byId["364"].children = catalog.provinces.map((p) => p.id);
  catalog.byId["364"].packPath = "packs/IR-provinces.json";
  catalog.byId["364"].bbox = bboxOf(iranFeature.geometry);
}
const ir = catalog.countries.find((c) => c.id === "364");
if (ir) {
  ir.name = { fa: "ایران", en: "Iran" };
  ir.children = catalog.byId["364"].children;
  ir.packPath = "packs/IR-provinces.json";
  ir.bbox = catalog.byId["364"].bbox;
}

writeFileSync(catalogPath, JSON.stringify(catalog));

const packBytes = Buffer.byteLength(JSON.stringify(pack));
const countryBytes = Buffer.byteLength(JSON.stringify({ type: "FeatureCollection", features: [iranFeature] }));
console.log(`Iran outline ${countryBytes}B, provinces ${provinces.length} pack ${Math.round(packBytes / 1024)}KB`);
