/**
 * Lightweight AutoCAD DXF to SVG converter (ASCII 2D DXF).
 * Parses common industrial P&ID AutoCAD entities: LINE, CIRCLE, ARC, LWPOLYLINE, POLYLINE, TEXT.
 * Calculates bounding box and outputs standard responsive SVG.
 */

interface Point {
  x: number;
  y: number;
}

export function convertDxfToSvg(dxfText: string): string {
  const lines = dxfText.split(/\r?\n/);
  let i = 0;

  function nextGroup(): { code: number; value: string } | null {
    while (i < lines.length - 1) {
      const line1 = lines[i++];
      const line2 = lines[i++];
      if (line1 === undefined || line2 === undefined) continue;
      const codeStr = line1.trim();
      const valStr = line2.trim();
      if (!codeStr && !valStr) continue;
      const code = parseInt(codeStr, 10);
      if (!isNaN(code)) {
        return { code, value: valStr };
      }
    }
    return null;
  }

  // Seek to ENTITIES section
  let inEntities = false;
  let g = nextGroup();
  while (g) {
    if (g.code === 2 && g.value.toUpperCase() === "ENTITIES") {
      inEntities = true;
      break;
    }
    g = nextGroup();
  }

  if (!inEntities) {
    throw new Error("بخش ENTITIES در فایل DXF یافت نشد. لطفاً مطمئن شوید فایل DXF متنی (ASCII) است.");
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function updateBounds(x: number, y: number) {
    if (isNaN(x) || isNaN(y)) return;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  const svgElements: string[] = [];

  // Parse entities until ENDSEC
  g = nextGroup();
  while (g) {
    if (g.code === 0 && g.value.toUpperCase() === "ENDSEC") {
      break;
    }

    if (g.code === 0) {
      const entityType = g.value.toUpperCase();

      if (entityType === "LINE") {
        let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
        let color = "#38bdf8";
        while ((g = nextGroup()) && g.code !== 0) {
          if (g.code === 10) x1 = parseFloat(g.value);
          else if (g.code === 20) y1 = parseFloat(g.value);
          else if (g.code === 11) x2 = parseFloat(g.value);
          else if (g.code === 21) y2 = parseFloat(g.value);
          else if (g.code === 62) color = aciToHex(parseInt(g.value, 10));
        }
        updateBounds(x1, y1);
        updateBounds(x2, y2);
        svgElements.push(
          `<line x1="${x1}" y1="${-y1}" x2="${x2}" y2="${-y2}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`
        );
        continue;
      }

      if (entityType === "CIRCLE") {
        let cx = 0, cy = 0, r = 0;
        let color = "#10b981";
        while ((g = nextGroup()) && g.code !== 0) {
          if (g.code === 10) cx = parseFloat(g.value);
          else if (g.code === 20) cy = parseFloat(g.value);
          else if (g.code === 40) r = parseFloat(g.value);
          else if (g.code === 62) color = aciToHex(parseInt(g.value, 10));
        }
        updateBounds(cx - r, cy - r);
        updateBounds(cx + r, cy + r);
        svgElements.push(
          `<circle cx="${cx}" cy="${-cy}" r="${r}" fill="none" stroke="${color}" stroke-width="2"/>`
        );
        continue;
      }

      if (entityType === "ARC") {
        let cx = 0, cy = 0, r = 0, startAngle = 0, endAngle = 360;
        let color = "#38bdf8";
        while ((g = nextGroup()) && g.code !== 0) {
          if (g.code === 10) cx = parseFloat(g.value);
          else if (g.code === 20) cy = parseFloat(g.value);
          else if (g.code === 40) r = parseFloat(g.value);
          else if (g.code === 50) startAngle = parseFloat(g.value);
          else if (g.code === 51) endAngle = parseFloat(g.value);
          else if (g.code === 62) color = aciToHex(parseInt(g.value, 10));
        }
        updateBounds(cx - r, cy - r);
        updateBounds(cx + r, cy + r);

        // DXF angles are CCW in degrees, Y is inverted in SVG
        const sa = (startAngle * Math.PI) / 180;
        const ea = (endAngle * Math.PI) / 180;
        const x1 = cx + r * Math.cos(sa);
        const y1 = -(cy + r * Math.sin(sa));
        const x2 = cx + r * Math.cos(ea);
        const y2 = -(cy + r * Math.sin(ea));

        let diff = endAngle - startAngle;
        if (diff < 0) diff += 360;
        const largeArc = diff > 180 ? 1 : 0;
        // In SVG with inverted Y, sweep is 0 for CCW
        const path = `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${largeArc} 0 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
        svgElements.push(`<path d="${path}" fill="none" stroke="${color}" stroke-width="2"/>`);
        continue;
      }

      if (entityType === "LWPOLYLINE") {
        const pts: Point[] = [];
        let closed = false;
        let color = "#38bdf8";
        let curX: number | null = null;

        while ((g = nextGroup()) && g.code !== 0) {
          if (g.code === 70) closed = (parseInt(g.value, 10) & 1) === 1;
          else if (g.code === 10) curX = parseFloat(g.value);
          else if (g.code === 20 && curX !== null) {
            const curY = parseFloat(g.value);
            pts.push({ x: curX, y: curY });
            updateBounds(curX, curY);
            curX = null;
          } else if (g.code === 62) color = aciToHex(parseInt(g.value, 10));
        }

        if (pts.length > 1) {
          const d = pts.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${(-p.y).toFixed(2)}`).join(" ") + (closed ? " Z" : "");
          svgElements.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`);
        }
        continue;
      }

      if (entityType === "TEXT" || entityType === "MTEXT") {
        let tx = 0, ty = 0, h = 12, textContent = "";
        let color = "#cbd5e1";
        while ((g = nextGroup()) && g.code !== 0) {
          if (g.code === 10) tx = parseFloat(g.value);
          else if (g.code === 20) ty = parseFloat(g.value);
          else if (g.code === 40) h = Math.max(8, parseFloat(g.value));
          else if (g.code === 1) textContent = g.value.replace(/\\P/g, " ").replace(/\\~[^\;]*\;/g, "");
          else if (g.code === 62) color = aciToHex(parseInt(g.value, 10));
        }
        if (textContent.trim()) {
          updateBounds(tx, ty);
          svgElements.push(
            `<text x="${tx}" y="${-ty}" font-size="${h.toFixed(1)}" fill="${color}" font-family="sans-serif">${escapeXml(textContent)}</text>`
          );
        }
        continue;
      }
    }

    g = nextGroup();
  }

  if (svgElements.length === 0 || minX === Infinity) {
    throw new Error("هیچ المان گرافیکی معتبری (خط، کمان، دایره، پلی‌لاین) در فایل DXF یافت نشد.");
  }

  // Calculate viewBox
  const padding = Math.max(20, Math.min(100, (maxX - minX) * 0.05));
  const vbX = minX - padding;
  const vbY = -maxY - padding;
  const vbW = Math.max(10, maxX - minX + padding * 2);
  const vbH = Math.max(10, maxY - minY + padding * 2);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX.toFixed(2)} ${vbY.toFixed(2)} ${vbW.toFixed(2)} ${vbH.toFixed(2)}" width="100%" height="100%">
  <rect x="${vbX.toFixed(2)}" y="${vbY.toFixed(2)}" width="${vbW.toFixed(2)}" height="${vbH.toFixed(2)}" fill="#0b1120"/>
  <!-- AutoCAD Converted Layer -->
  <g id="autocad_entities">
    ${svgElements.join("\n    ")}
  </g>
</svg>`;
}

function aciToHex(aci: number): string {
  // Standard AutoCAD Color Index 1-7
  switch (aci) {
    case 1: return "#ef4444"; // Red
    case 2: return "#eab308"; // Yellow
    case 3: return "#22c55e"; // Green
    case 4: return "#06b6d4"; // Cyan
    case 5: return "#3b82f6"; // Blue
    case 6: return "#ec4899"; // Magenta
    case 7: return "#f8fafc"; // White/Light Gray
    case 8: return "#64748b"; // Dark Gray
    case 9: return "#94a3b8"; // Light Gray
    default: return "#38bdf8"; // Industrial Cyan Default
  }
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
