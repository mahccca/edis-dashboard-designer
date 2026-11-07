import { describe, expect, it } from "vitest";
import { bboxOfCollection, projectFeatures, viewportForBbox } from "./project";
import type { GeoJsonFeatureCollection } from "./types";

const sample: GeoJsonFeatureCollection = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    id: "IR-07",
    properties: { id: "IR-07", nameFa: "تهران", nameEn: "Tehran" },
    geometry: {
      type: "Polygon",
      coordinates: [[[50.5, 35.2], [52.2, 35.2], [52.2, 36.0], [50.5, 36.0], [50.5, 35.2]]],
    },
  }],
};

describe("geo project", () => {
  it("computes a tight bbox for the loaded region only", () => {
    expect(bboxOfCollection(sample)).toEqual([50.5, 35.2, 52.2, 36.0]);
  });

  it("projects paths into the SVG viewport", () => {
    const paths = projectFeatures(sample, 400, 240);
    expect(paths).toHaveLength(1);
    expect(paths[0]?.id).toBe("IR-07");
    expect(paths[0]?.d.startsWith("M")).toBe(true);
    expect(paths[0]?.nameFa).toBe("تهران");
  });

  it("sizes the viewport to the region aspect ratio", () => {
    const box = bboxOfCollection(sample);
    const vp = viewportForBbox(box, 1000);
    expect(vp.aspect).toBeCloseTo((52.2 - 50.5) / (36.0 - 35.2), 5);
    expect(vp.width / vp.height).toBeCloseTo(vp.aspect, 2);
  });
});
