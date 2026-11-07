import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentSpec, DocNode } from "../api/types";
import { MapWidget } from "./MapWidget";

const catalog = {
  schemaVersion: 1,
  defaultRegion: "364",
  levels: ["world", "continent", "country", "province", "city"],
  world: { id: "WORLD", level: "world", name: { fa: "جهان", en: "World" }, path: "world/WORLD.json", bbox: [-180, -90, 180, 90], children: ["AS"] },
  continents: [],
  countries: [],
  provinces: [],
  cities: [],
  byId: {
    "364": {
      id: "364",
      level: "country",
      name: { fa: "ایران", en: "Iran" },
      path: "country/364.json",
      packPath: "packs/IR-provinces.json",
      bbox: [44, 25, 63, 40],
      children: ["IR-07"],
    },
  },
};

const iranPack = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    id: "IR-07",
    properties: { id: "IR-07", nameFa: "تهران", nameEn: "Tehran", level: "province" },
    geometry: {
      type: "Polygon",
      coordinates: [[[50.5, 35.2], [52.2, 35.2], [52.2, 36.0], [50.5, 36.0], [50.5, 35.2]]],
    },
  }],
};

vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.endsWith("/geo/catalog.json")) {
    return new Response(JSON.stringify(catalog), { status: 200 });
  }
  if (url.includes("packs/IR-provinces.json") || url.includes("country/364.json")) {
    return new Response(JSON.stringify(iranPack), { status: 200 });
  }
  return new Response("missing", { status: 404 });
}));

const SPEC: ComponentSpec = {
  id: "01929f3a-1000-7000-8000-000000000005",
  key: "industrial.map",
  version: "1.0.0",
  name: { fa: "نقشه", en: "Map" },
  category: "symbol",
  status: "published",
  rendererId: "builtin.map@1",
  properties: [],
  defaults: {
    title: "نقشه ایران",
    level: "country",
    region: "364",
    showLabels: true,
    landColor: "#ffffff",
    height: 220,
  },
  inputs: [{ key: "metrics", dataType: "table" }],
};

const node: DocNode = {
  id: "m1",
  type: "component",
  props: {},
  component: { definitionId: SPEC.id, version: SPEC.version },
};

afterEach(cleanup);

describe("MapWidget", () => {
  it("loads only the selected country pack with white land on transparent frame", async () => {
    const { container } = render(
      <MapWidget node={node} spec={SPEC} inputs={{}} testData={{}} locale="fa" />,
    );
    await waitFor(() => {
      expect(container.querySelector("[data-map-region='364']")).toBeTruthy();
      expect(container.querySelector("path")).toBeTruthy();
    });
    const path = container.querySelector("path");
    expect(path?.getAttribute("style") ?? "").toMatch(/fill:\s*(#ffffff|rgb\(255,\s*255,\s*255\))/i);
    expect(container.querySelector('[aria-label="بزرگ‌نمایی"]')).toBeTruthy();
    fireEvent.click(container.querySelector('[aria-label="بزرگ‌نمایی"]')!);
    await waitFor(() => expect(container.textContent).toMatch(/120%/));
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes("/geo/catalog.json"))).toBe(true);
    expect(calls.some((u) => u.includes("packs/IR-provinces.json"))).toBe(true);
    expect(calls.some((u) => u.includes("world/WORLD.json"))).toBe(false);
  });
});
