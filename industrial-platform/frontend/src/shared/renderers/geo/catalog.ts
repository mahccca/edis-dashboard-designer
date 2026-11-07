import type { GeoCatalog, GeoJsonFeatureCollection, GeoRegionNode, MapLevel } from "./types";

const GEO_BASE = "/geo";
let catalogPromise: Promise<GeoCatalog> | null = null;
const regionCache = new Map<string, Promise<GeoJsonFeatureCollection>>();

export function loadGeoCatalog(): Promise<GeoCatalog> {
  if (!catalogPromise) {
    catalogPromise = fetch(`${GEO_BASE}/catalog.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`geo catalog ${r.status}`);
        return r.json() as Promise<GeoCatalog>;
      })
      .catch((err) => {
        catalogPromise = null;
        throw err;
      });
  }
  return catalogPromise;
}

export function resolveRegion(catalog: GeoCatalog, level: MapLevel, regionId: string): GeoRegionNode | null {
  if (level === "world") return catalog.world;
  const id = regionId.trim();
  if (!id) return null;
  const node = catalog.byId[id];
  if (!node) return null;
  if (node.level !== level && !(level === "country" && node.level === "country")) {
    // Allow matching by id even if level prop is slightly off (Studio typos).
    if (node.level !== level) return node;
  }
  return node;
}

/** Fetch only the GeoJSON for this node (and optional province pack for Iran). */
export function loadRegionGeo(node: GeoRegionNode, preferPack = true): Promise<GeoJsonFeatureCollection> {
  const path = preferPack && node.packPath ? node.packPath : node.path;
  const key = path;
  let pending = regionCache.get(key);
  if (!pending) {
    pending = fetch(`${GEO_BASE}/${path}`)
      .then((r) => {
        if (!r.ok) throw new Error(`geo region ${path} ${r.status}`);
        return r.json() as Promise<GeoJsonFeatureCollection>;
      })
      .catch((err) => {
        regionCache.delete(key);
        throw err;
      });
    regionCache.set(key, pending);
  }
  return pending;
}

export function regionsForLevel(catalog: GeoCatalog, level: MapLevel, parentId?: string): GeoRegionNode[] {
  if (level === "world") return [catalog.world];
  if (level === "continent") return catalog.continents;
  if (level === "country") {
    if (parentId) return catalog.countries.filter((c) => c.continent === parentId);
    return catalog.countries;
  }
  if (level === "province") {
    if (parentId) return catalog.provinces.filter((p) => p.country === parentId);
    return catalog.provinces;
  }
  if (parentId) return catalog.cities.filter((c) => c.province === parentId);
  return catalog.cities;
}
