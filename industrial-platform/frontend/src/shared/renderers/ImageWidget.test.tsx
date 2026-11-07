import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ComponentSpec, DocNode } from "../api/types";
import { value } from "../../test/fixtures";
import { ImageWidget } from "./ImageWidget";

const SPEC: ComponentSpec = {
  id: "01929f3a-1000-7000-8000-000000000003",
  key: "industrial.image",
  version: "1.0.0",
  name: { fa: "تصویر", en: "Image" },
  category: "symbol",
  status: "published",
  rendererId: "builtin.image@1",
  properties: [],
  defaults: { src: "https://example.com/a.png", alt: "demo", objectFit: "contain", height: 120 },
  inputs: [{ key: "src", dataType: "string" }],
};

const node: DocNode = {
  id: "img1",
  type: "component",
  props: {},
  component: { definitionId: SPEC.id, version: SPEC.version },
};

afterEach(cleanup);

describe("Image widget renderer", () => {
  it("uses the prop URL when no binding is present", () => {
    const { container } = render(
      <ImageWidget node={node} spec={SPEC} inputs={{}} testData={{}} locale="en" />,
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://example.com/a.png");
    expect(img?.getAttribute("alt")).toBe("demo");
  });

  it("prefers a bound URL over the prop", () => {
    const { container } = render(
      <ImageWidget
        node={node}
        spec={SPEC}
        inputs={{ src: value({ value: "https://cdn.example/bound.png", unit: null }) }}
        testData={{}}
        locale="en"
      />,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://cdn.example/bound.png");
  });

  it("shows a placeholder when neither prop nor binding has a URL", () => {
    render(
      <ImageWidget
        node={{ ...node, props: { src: "" } }}
        spec={{ ...SPEC, defaults: { ...SPEC.defaults, src: "" } }}
        inputs={{}}
        testData={{}}
        locale="fa"
      />,
    );
    expect(screen.getByText("آدرس تصویر تنظیم نشده")).toBeTruthy();
  });
});
