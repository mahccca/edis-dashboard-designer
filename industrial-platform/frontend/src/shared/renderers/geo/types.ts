export type MapLevel = "world" | "continent" | "country" | "province" | "city";

export interface LocalizedName {
  fa: string;
  en: string;
}

export interface GeoRegionNode {
  id: string;
  level: MapLevel;
  name: LocalizedName;
  path: string;
  bbox: [number, number, number, number];
  children?: string[];
  packPath?: string;
  continent?: string;
  country?: string;
  province?: string;
}

export interface GeoCatalog {
  schemaVersion: number;
  defaultRegion: string;
  levels: MapLevel[];
  world: GeoRegionNode;
  continents: GeoRegionNode[];
  countries: GeoRegionNode[];
  provinces: GeoRegionNode[];
  cities: GeoRegionNode[];
  byId: Record<string, GeoRegionNode>;
}

export interface GeoJsonGeometry {
  type: string;
  coordinates?: unknown;
  geometries?: GeoJsonGeometry[];
}

export interface GeoJsonFeature {
  type: "Feature";
  id?: string | number;
  properties?: Record<string, unknown>;
  geometry: GeoJsonGeometry;
}

export interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}
