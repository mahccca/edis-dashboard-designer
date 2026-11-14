import { describe, it, expect } from "vitest";
import { convertDxfToSvg } from "./dxfToSvg";

describe("dxfToSvg", () => {
  it("converts a basic DXF with line, circle, and text to SVG", () => {
    const sampleDxf = `0
SECTION
2
ENTITIES
0
LINE
10
10.0
20
20.0
11
110.0
21
120.0
62
1
0
CIRCLE
10
50.0
20
50.0
40
25.0
62
3
0
TEXT
10
15.0
20
30.0
40
14.0
1
PUMP-101
0
ENDSEC
0
EOF`;

    const svg = convertDxfToSvg(sampleDxf);
    expect(svg).toContain("<svg");
    expect(svg).toContain("<line");
    expect(svg).toContain('stroke="#ef4444"');
    expect(svg).toContain("<circle");
    expect(svg).toContain('stroke="#22c55e"');
    expect(svg).toContain("PUMP-101");
  });
});

