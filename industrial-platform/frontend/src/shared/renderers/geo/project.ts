import type { GeoJsonFeature, GeoJsonFeatureCollection, GeoJsonGeometry } from "./types";

export type BBox = [number, number, number, number];

function walkCoords(geom: GeoJsonGeometry, fn: (lon: number, lat: number) => void): void {
  if (geom.type === "GeometryCollection") {
    for (const g of geom.geometries || []) walkCoords(g, fn);
    return;
  }
  const walk = (c: unknown): void => {
    if (!Array.isArray(c) || c.length === 0) return;
    if (typeof c[0] === "number" && typeof c[1] === "number") {
      fn(c[0] as number, c[1] as number);
      return;
    }
    for (const x of c) walk(x);
  };
  walk(geom.coordinates);
}

export function bboxOfCollection(fc: GeoJsonFeatureCollection): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of fc.features) {
    walkCoords(f.geometry, (lon, lat) => {
      minX = Math.min(minX, lon); maxX = Math.max(maxX, lon);
      minY = Math.min(minY, lat); maxY = Math.max(maxY, lat);
    });
  }
  if (!Number.isFinite(minX)) return [-180, -90, 180, 90];
  return [minX, minY, maxX, maxY];
}

export interface ProjectedPath {
  id: string;
  d: string;
  nameFa: string;
  nameEn: string;
  centroid: [number, number];
}

function projectPoint(lon: number, lat: number, bbox: BBox, width: number, height: number, pad: number): [number, number] {
  const [minX, minY, maxX, maxY] = bbox;
  const spanX = Math.max(maxX - minX, 0.0001);
  const spanY = Math.max(maxY - minY, 0.0001);
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const scale = Math.min(innerW / spanX, innerH / spanY);
  const usedW = spanX * scale;
  const usedH = spanY * scale;
  const ox = pad + (innerW - usedW) / 2;
  const oy = pad + (innerH - usedH) / 2;
  const x = ox + (lon - minX) * scale;
  const y = oy + (maxY - lat) * scale;
  return [x, y];
}

function ringToPath(ring: number[][], bbox: BBox, width: number, height: number, pad: number): string {
  if (!ring.length) return "";
  const parts: string[] = [];
  for (let i = 0; i < ring.length; i++) {
    const [lon, lat] = ring[i]!;
    const [x, y] = projectPoint(lon!, lat!, bbox, width, height, pad);
    parts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

function geometryToPath(geom: GeoJsonGeometry, bbox: BBox, width: number, height: number, pad: number): string {
  if (geom.type === "Polygon") {
    const rings = geom.coordinates as number[][][];
    return rings.map((r) => ringToPath(r, bbox, width, height, pad)).join(" ");
  }
  if (geom.type === "MultiPolygon") {
    const polys = geom.coordinates as number[][][][];
    return polys.flatMap((poly) => poly.map((r) => ringToPath(r, bbox, width, height, pad))).join(" ");
  }
  if (geom.type === "GeometryCollection") {
    return (geom.geometries || []).map((g) => geometryToPath(g, bbox, width, height, pad)).join(" ");
  }
  return "";
}

function featureCentroid(f: GeoJsonFeature, bbox: BBox, width: number, height: number, pad: number): [number, number] {
  let sx = 0, sy = 0, n = 0;
  walkCoords(f.geometry, (lon, lat) => {
    const [x, y] = projectPoint(lon!, lat!, bbox, width, height, pad);
    sx += x; sy += y; n += 1;
  });
  if (!n) return [width / 2, height / 2];
  return [sx / n, sy / n];
}

/** Size the SVG viewport to the region's geographic aspect ratio (no letterbox inside). */
export function viewportForBbox(bbox: BBox, maxSide = 1000): { width: number; height: number; aspect: number } {
  const [a, b, c, d] = bbox;
  const spanX = Math.max(c - a, 0.0001);
  const spanY = Math.max(d - b, 0.0001);
  const aspect = spanX / spanY;
  if (aspect >= 1) {
    return { width: maxSide, height: Math.max(1, Math.round(maxSide / aspect)), aspect };
  }
  return { width: Math.max(1, Math.round(maxSide * aspect)), height: maxSide, aspect };
}

export function projectFeatures(
  fc: GeoJsonFeatureCollection,
  width: number,
  height: number,
  pad = 12,
  focusBbox?: BBox | null,
): ProjectedPath[] {
  const bbox = focusBbox ?? bboxOfCollection(fc);
  // Tiny geographic pad so coasts aren't clipped by stroke width.
  const [a, b, c, d] = bbox;
  const dx = Math.max((c - a) * 0.004, 0.005);
  const dy = Math.max((d - b) * 0.004, 0.005);
  const padded: BBox = [a - dx, b - dy, c + dx, d + dy];

  return fc.features.map((f, i) => {
    const props = f.properties ?? {};
    const id = String(props.id ?? f.id ?? i);
    return {
      id,
      d: geometryToPath(f.geometry, padded, width, height, pad),
      nameFa: String(props.nameFa ?? props.nameEn ?? props.name ?? id),
      nameEn: String(props.nameEn ?? props.name ?? id),
      centroid: featureCentroid(f, padded, width, height, pad),
    };
  }).filter((p) => p.d);
}
