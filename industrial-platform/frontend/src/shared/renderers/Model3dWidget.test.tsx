// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { ComponentSpec, DocNode } from "../api/types";
import { Model3dWidget } from "./Model3dWidget";

// Mock WebGLRenderer since JSDOM does not implement full WebGL
vi.mock("three", async () => {
  const actual = await vi.importActual<typeof import("three")>("three");
  return {
    ...actual,
    WebGLRenderer: vi.fn().mockImplementation(() => ({
      setSize: vi.fn(),
      setPixelRatio: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
      shadowMap: { enabled: true, type: 0 },
      domElement: document.createElement("canvas"),
    })),
  };
});

describe("Model3dWidget", () => {
  const mockSpec: ComponentSpec = {
    id: "00000000-0000-7000-8000-000000000099",
    key: "darkhoveyn.tank-3d",
    version: "1.0.0",
    category: "symbol",
    name: { fa: "مخزن فرآیندی ۳بعدی", en: "3D Process Tank" },
    status: "published",
    rendererId: "builtin.model-3d@1",
    properties: [
      { key: "equipmentType", label: { fa: "نوع تجهیز" }, type: "string" },
      { key: "autoSpin", label: { fa: "چرخش خودکار" }, type: "boolean" },
    ],
    defaults: {
      equipmentType: "tank",
      autoSpin: true,
      level: 75.0,
      temperature: 52.4,
    },
    inputs: [
      { key: "level", dataType: "number" },
      { key: "temperature", dataType: "number" },
    ],
  };

  const mockNode: DocNode = {
    id: "node_3d_test",
    type: "component",
    component: { definitionId: mockSpec.id, version: mockSpec.version },
    props: { equipmentType: "tank", title: "مخزن فرآیندی ۳بعدی" },
  };

  it("renders 3D interactive container with controls and title", () => {
    const { container } = render(
      <Model3dWidget
        node={mockNode}
        spec={mockSpec}
        inputs={{
          level: {
            bindingId: "b1",
            value: 85.5,
            quality: "good",
            origin: "static",
            dataOrigin: "static",
            unit: null,
            sourceTimestamp: null,
            isTestData: false,
          },
        }}
        testData={{}}
        locale="fa"
      />
    );

    const widget = container.querySelector('[data-renderer="builtin.model-3d@1"]');
    expect(widget).toBeDefined();
    expect(screen.getByText("مخزن فرآیندی ۳بعدی")).toBeDefined();
    expect(screen.getByText("مخزن فرآیندی 3D")).toBeDefined();
    expect(screen.getByText("چرخش: فعال")).toBeDefined();
    expect(screen.getByText("85.5")).toBeDefined();
  });

  it("renders 3D industrial motor/pump with RPM telemetry", () => {
    const motorNode: DocNode = {
      ...mockNode,
      props: { equipmentType: "motor", title: "الکتروپمپ سانتریفیوژ 3D" },
    };

    render(
      <Model3dWidget
        node={motorNode}
        spec={mockSpec}
        inputs={{
          speed: {
            bindingId: "b2",
            value: 2950,
            quality: "good",
            origin: "static",
            dataOrigin: "static",
            unit: null,
            sourceTimestamp: null,
            isTestData: false,
          },
        }}
        testData={{}}
        locale="fa"
      />
    );

    expect(screen.getByText("الکتروپمپ 3D")).toBeDefined();
    expect(screen.getByText("2950")).toBeDefined();
    expect(screen.getByText("RPM")).toBeDefined();
  });
});
