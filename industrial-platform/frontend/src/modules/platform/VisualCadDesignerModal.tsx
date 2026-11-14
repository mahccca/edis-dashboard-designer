import { useState, useRef, useMemo, useEffect, type MouseEvent } from "react";
import { convertDxfToSvg } from "../../shared/cad/dxfToSvg";
import type { SvgHotspot } from "../../shared/renderers/SvgCadWidget";
import ui from "../../shared/ui/controls.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  initialSvg: string;
  initialHotspots: SvgHotspot[];
  onApply: (svgContent: string, hotspots: SvgHotspot[]) => void;
}

const DEFAULT_SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="100%" height="100%">
  <rect width="800" height="450" fill="#0f172a" />
  <!-- Piping Line 1 -->
  <path d="M 80 180 L 260 180 L 260 220 L 460 220 L 460 180 L 700 180" fill="none" stroke="#38bdf8" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>
  <path d="M 80 180 L 260 180 L 260 220 L 460 220 L 460 180 L 700 180" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="8 12" opacity="0.6"/>
  <!-- Primary Vessel / Tank -->
  <rect x="220" y="80" width="120" height="180" rx="20" fill="#1e293b" stroke="#38bdf8" stroke-width="3"/>
  <ellipse cx="280" cy="80" rx="60" ry="15" fill="#475569" stroke="#38bdf8" stroke-width="2"/>
  <text x="280" y="140" fill="#94a3b8" font-size="14" font-weight="bold" text-anchor="middle">REACTION TANK</text>
  <text x="280" y="160" fill="#38bdf8" font-size="12" text-anchor="middle">TK-201</text>
  <!-- Pump / Motor -->
  <circle cx="500" cy="220" r="32" fill="#1e293b" stroke="#10b981" stroke-width="3"/>
  <path d="M 500 195 L 525 240 L 475 240 Z" fill="#10b981" opacity="0.75"/>
  <text x="500" y="270" fill="#10b981" font-size="12" font-weight="bold" text-anchor="middle">PUMP P-101</text>
  <!-- Valve 1 -->
  <polygon points="140,165 180,195 180,165 140,195" fill="#f59e0b" stroke="#ffffff" stroke-width="1.5"/>
  <line x1="160" y1="180" x2="160" y2="160" stroke="#ffffff" stroke-width="2"/>
  <circle cx="160" cy="158" r="5" fill="#f59e0b"/>
  <text x="160" y="215" fill="#cbd5e1" font-size="11" text-anchor="middle">FCV-101</text>
  <!-- Heat Exchanger -->
  <rect x="600" y="130" width="80" height="100" rx="8" fill="#1e293b" stroke="#ec4899" stroke-width="2.5"/>
  <path d="M 615 150 Q 640 165 665 150 T 665 190" fill="none" stroke="#ec4899" stroke-width="2"/>
  <text x="640" y="215" fill="#ec4899" font-size="11" text-anchor="middle">HEX-301</text>
</svg>`;

function wrapImageInSvg(url: string, width = 800, height = 500): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
  <rect width="${width}" height="${height}" fill="#0f172a" />
  <image href="${url}" xlink:href="${url}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" />
</svg>`;
}

export function VisualCadDesignerModal({ open, onClose, initialSvg, initialHotspots, onApply }: Props) {
  const [svgText, setSvgText] = useState(() => {
    if (initialSvg && initialSvg.trim()) {
      const trimmed = initialSvg.trim();
      return trimmed.includes("<svg") ? trimmed : wrapImageInSvg(trimmed);
    }
    return DEFAULT_SAMPLE_SVG;
  });

  const [hotspots, setHotspots] = useState<SvgHotspot[]>(() =>
    initialHotspots && initialHotspots.length
      ? initialHotspots
      : [
          { id: "h1", x: 35, y: 35, inputKey: "tank_level", label: "سطح مخزن TK-201", unit: "%", displayType: "badge" },
          { id: "h2", x: 20, y: 40, inputKey: "valve_pressure", label: "فشار خط", unit: "Bar", displayType: "badge" },
        ]
  );
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [tab, setTab] = useState<"visual" | "code">("visual");
  const [fileName, setFileName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Sync state whenever the modal opens or initial props change
  useEffect(() => {
    if (open) {
      setErrorMsg(null);
      if (initialSvg && initialSvg.trim()) {
        const trimmed = initialSvg.trim();
        setSvgText(trimmed.includes("<svg") ? trimmed : wrapImageInSvg(trimmed));
      } else {
        setSvgText(DEFAULT_SAMPLE_SVG);
      }
      if (initialHotspots && initialHotspots.length > 0) {
        setHotspots(initialHotspots);
      } else {
        setHotspots([
          { id: "h1", x: 35, y: 35, inputKey: "tank_level", label: "سطح مخزن TK-201", unit: "%", displayType: "badge" },
          { id: "h2", x: 20, y: 40, inputKey: "valve_pressure", label: "فشار خط", unit: "Bar", displayType: "badge" },
        ]);
      }
      setSelectedPinId(null);
    }
  }, [open, initialSvg, initialHotspots]);

  const selectedPin = useMemo(() => hotspots.find((h) => h.id === selectedPinId) ?? null, [hotspots, selectedPinId]);

  if (!open) return null;

  const handleFileUpload = (file: File | null) => {
    if (!file) return;
    setErrorMsg(null);
    const lowerName = file.name.toLowerCase();

    // Check for binary AutoCAD DWG / PWG / DWF
    if (lowerName.endsWith(".dwg") || lowerName.endsWith(".pwg") || lowerName.endsWith(".dwf")) {
      setErrorMsg(
        `فرمت فایل ${file.name.split('.').pop()?.toUpperCase()} یک فرمت باینری اختصاصی و بستهٔ اتوکد است که مستقیماً در مرورگر وب قابل رندر نیست. راهکار: لطفاً در اتوکد از منوی Save As گزینه AutoCAD DXF (*.dxf) را انتخاب کنید (که بلافاصله در سیستم رندر می‌شود) یا با دستور EXPORTSVG / PLOT نقشه را به صورت SVG یا PNG خروجی بگیرید.`
      );
      return;
    }

    setFileName(file.name);

    // Support AutoCAD DXF format directly
    if (lowerName.endsWith(".dxf")) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const content = reader.result as string;
          const svg = convertDxfToSvg(content);
          setSvgText(svg);
        } catch (err) {
          setErrorMsg(err instanceof Error ? err.message : "خطا در تبدیل فایل DXF اتوکد به SVG");
        }
      };
      reader.readAsText(file);
      return;
    }

    const isSvg = file.type === "image/svg+xml" || lowerName.endsWith(".svg");

    if (isSvg) {
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        if (content.toLowerCase().includes("<svg")) {
          const idx = content.search(/<svg/i);
          setSvgText(idx >= 0 ? content.slice(idx) : content);
        } else {
          setSvgText(wrapImageInSvg(content));
        }
      };
      reader.readAsText(file);
      return;
    }

    // Raster image (PNG, JPG, WebP)
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || 800;
        const h = img.naturalHeight || 500;
        setSvgText(wrapImageInSvg(dataUrl, w, h));
      };
      img.onerror = () => {
        setSvgText(wrapImageInSvg(dataUrl));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleCanvasClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return;
    // Calculate click position as percentage of canvas container
    const rect = canvasRef.current.getBoundingClientRect();
    const xPct = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10;
    const yPct = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10;

    const newId = `pin_${Date.now().toString(36)}`;
    const newPin: SvgHotspot = {
      id: newId,
      x: Math.max(2, Math.min(98, xPct)),
      y: Math.max(2, Math.min(98, yPct)),
      inputKey: `signal_${hotspots.length + 1}`,
      label: `نقطه تلمتری ${hotspots.length + 1}`,
      unit: "Bar",
      displayType: "badge",
    };
    setHotspots((prev) => [...prev, newPin]);
    setSelectedPinId(newId);
  };

  const updatePin = (id: string, patch: Partial<SvgHotspot>) => {
    setHotspots((prev) => prev.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  };

  const deletePin = (id: string) => {
    setHotspots((prev) => prev.filter((h) => h.id !== id));
    if (selectedPinId === id) setSelectedPinId(null);
  };

  const handleSaveAndApply = () => {
    onApply(svgText, hotspots);
    onClose();
  };

  const isCustomContent = svgText.trim() !== DEFAULT_SAMPLE_SVG.trim();

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.8)",
        backdropFilter: "blur(6px)",
        zIndex: 2000000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        className={ui.card}
        style={{
          width: "95vw",
          maxWidth: 1240,
          height: "92vh",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          background: "var(--color-surface-raised, #161b22)",
          borderRadius: 12,
          border: "1px solid var(--color-border-subtle, rgba(255,255,255,0.15))",
          overflow: "hidden",
        }}
        dir="rtl"
      >
        {/* Modal Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 10 }}>
          <div>
            <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <span>📐</span>
              <span>طراح بصری نقشه‌های اتوکد و دیاگرام (Visual CAD / SVG Designer)</span>
              {isCustomContent ? (
                <span style={{ fontSize: "0.72rem", background: "rgba(16, 185, 129, 0.2)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.4)", borderRadius: 12, padding: "2px 8px" }}>
                  ✓ فایل سفارشی بارگذاری‌شده فعال است {fileName ? `(${fileName})` : ""}
                </span>
              ) : (
                <span style={{ fontSize: "0.72rem", background: "rgba(148, 163, 184, 0.2)", color: "#94a3b8", border: "1px solid rgba(148, 163, 184, 0.3)", borderRadius: 12, padding: "2px 8px" }}>
                  نقشه پیش‌فرض نمونه
                </span>
              )}
            </h3>
            <p className={ui.muted} style={{ margin: "4px 0 0", fontSize: "0.82rem" }}>
              فایل نقشه‌های خروجی AutoCAD، پلتفرم Canva یا هر تصویر/SVG را بارگذاری کنید و با کلیک روی هر نقطه، پین‌های تلمتری و داده‌های زنده را روی نقشه قرار دهید.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {isCustomContent && (
              <button
                type="button"
                className={ui.button}
                style={{ fontSize: "0.8rem", color: "#f87171" }}
                onClick={() => {
                  setSvgText(DEFAULT_SAMPLE_SVG);
                  setFileName(null);
                }}
                title="بازگشت به نقشه پیش‌فرض نمونه"
              >
                بازنشانی به پیش‌فرض
              </button>
            )}
            <label className={ui.button} style={{ cursor: "pointer", background: "var(--color-primary, #3b82f6)", color: "#fff", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span>📁 بارگذاری نقشه اتوکد (DXF, SVG, PNG)...</span>
              <input
                type="file"
                accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp,.dxf,.dwg,.pwg,.dwf"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  e.target.value = "";
                  handleFileUpload(f);
                }}
              />
            </label>
            <button type="button" className={`${ui.button} ${ui.primary}`} onClick={handleSaveAndApply}>
              ✓ اعمال و درج در کامپوننت
            </button>
            <button type="button" className={ui.button} onClick={onClose}>
              بستن ✕
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className={ui.alert} role="alert" style={{ margin: 0, fontSize: "0.85rem", lineHeight: 1.5, background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.4)", color: "#fca5a5" }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className={ui.button}
            style={{ fontWeight: tab === "visual" ? "bold" : "normal", borderColor: tab === "visual" ? "#38bdf8" : undefined }}
            onClick={() => setTab("visual")}
          >
            🎨 بوم بصری و پین‌گذاری داده (Visual Canvas)
          </button>
          <button
            type="button"
            className={ui.button}
            style={{ fontWeight: tab === "code" ? "bold" : "normal", borderColor: tab === "code" ? "#38bdf8" : undefined }}
            onClick={() => setTab("code")}
          >
            &lt;/&gt; کد خام SVG نقشه
          </button>
        </div>

        {/* Main Work Area */}
        {tab === "code" ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: "0.85rem", color: "#8b98a5" }}>می‌توانید کدهای SVG خروجی اتوکد یا Canva را مستقیماً در این کادر Paste کنید:</span>
            <textarea
              className={ui.input}
              dir="ltr"
              style={{ flex: 1, fontFamily: "monospace", fontSize: "0.8rem", resize: "none" }}
              value={svgText}
              onChange={(e) => setSvgText(e.target.value)}
            />
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", gap: 16, overflow: "hidden" }}>
            {/* Visual Canvas Area */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                background: "#090d14",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.08)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "6px 12px", background: "rgba(255,255,255,0.04)", fontSize: "0.8rem", color: "#94a3b8", display: "flex", justifyContent: "space-between" }}>
                <span>🎯 برای اضافه کردن پین تلمتری، روی هر جای نقشه کلیک کنید.</span>
                <span>تعداد پین‌ها: {hotspots.length}</span>
              </div>

              <div
                ref={canvasRef}
                onClick={handleCanvasClick}
                style={{
                  position: "relative",
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  cursor: "crosshair",
                  padding: 12,
                }}
              >
                {/* SVG or Image Underneath */}
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  dangerouslySetInnerHTML={{
                    __html: svgText.includes("<svg")
                      ? svgText
                      : wrapImageInSvg(svgText),
                  }}
                />

                {/* Hotspots Overlay */}
                {hotspots.map((h) => {
                  const isSelected = h.id === selectedPinId;
                  return (
                    <div
                      key={h.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPinId(h.id);
                      }}
                      style={{
                        position: "absolute",
                        left: `${h.x}%`,
                        top: `${h.y}%`,
                        transform: "translate(-50%, -50%)",
                        cursor: "pointer",
                        zIndex: isSelected ? 30 : 15,
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div
                        style={{
                          padding: "4px 8px",
                          background: isSelected ? "rgba(14, 165, 233, 0.95)" : "rgba(15, 23, 42, 0.88)",
                          color: "#fff",
                          border: isSelected ? "2px solid #fff" : "1px solid #38bdf8",
                          borderRadius: 6,
                          boxShadow: isSelected ? "0 0 16px rgba(56, 189, 248, 0.8)" : "0 4px 12px rgba(0,0,0,0.6)",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span style={{ fontSize: "0.68rem", opacity: 0.85 }}>{h.label || h.inputKey}</span>
                        <span>
                          {h.displayType === "lamp" ? "🟢 آنلاین" : `42.5 ${h.unit || ""}`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Side Configuration Panel */}
            <div
              style={{
                width: 320,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                background: "rgba(255,255,255,0.02)",
                padding: 14,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.08)",
                overflowY: "auto",
              }}
            >
              <strong>تنظیمات پین انتخاب‌شده</strong>
              {selectedPin ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <label>
                    <span style={{ fontSize: "0.8rem", color: "#8b98a5" }}>کلید سیگنال تلمتری (inputKey)</span>
                    <input
                      className={ui.input}
                      dir="ltr"
                      value={selectedPin.inputKey}
                      onChange={(e) => updatePin(selectedPin.id, { inputKey: e.target.value })}
                    />
                  </label>
                  <label>
                    <span style={{ fontSize: "0.8rem", color: "#8b98a5" }}>عنوان نمایشی</span>
                    <input
                      className={ui.input}
                      value={selectedPin.label || ""}
                      placeholder="مانند: فشار خط ورودی"
                      onChange={(e) => updatePin(selectedPin.id, { label: e.target.value })}
                    />
                  </label>
                  <div className={ui.row}>
                    <label style={{ flex: 1 }}>
                      <span style={{ fontSize: "0.8rem", color: "#8b98a5" }}>واحد</span>
                      <input
                        className={ui.input}
                        dir="ltr"
                        value={selectedPin.unit || ""}
                        placeholder="Bar, °C, RPM, %"
                        onChange={(e) => updatePin(selectedPin.id, { unit: e.target.value })}
                      />
                    </label>
                    <label style={{ flex: 1 }}>
                      <span style={{ fontSize: "0.8rem", color: "#8b98a5" }}>نوع نمایش</span>
                      <select
                        className={ui.select}
                        value={selectedPin.displayType || "badge"}
                        onChange={(e) =>
                          updatePin(selectedPin.id, {
                            displayType: e.target.value as SvgHotspot["displayType"],
                          })
                        }
                      >
                        <option value="badge">نشانگر عددی (Badge)</option>
                        <option value="lamp">چراغ سیگنال (Lamp)</option>
                        <option value="level">ستون سطح سیال (Level)</option>
                      </select>
                    </label>
                  </div>
                  <div className={ui.row}>
                    <label style={{ flex: 1 }}>
                      <span style={{ fontSize: "0.8rem", color: "#8b98a5" }}>موقعیت افقی X (%)</span>
                      <input
                        className={ui.input}
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={selectedPin.x}
                        onChange={(e) => updatePin(selectedPin.id, { x: Number(e.target.value) })}
                      />
                    </label>
                    <label style={{ flex: 1 }}>
                      <span style={{ fontSize: "0.8rem", color: "#8b98a5" }}>موقعیت عمودی Y (%)</span>
                      <input
                        className={ui.input}
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={selectedPin.y}
                        onChange={(e) => updatePin(selectedPin.id, { y: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                  <div className={ui.row} style={{ marginTop: 6 }}>
                    <button
                      type="button"
                      className={ui.button}
                      style={{ color: "#ef4444", borderColor: "rgba(239, 68, 68, 0.4)", width: "100%" }}
                      onClick={() => deletePin(selectedPin.id)}
                    >
                      🗑️ حذف این پین
                    </button>
                  </div>
                </div>
              ) : (
                <p className={ui.muted} style={{ fontSize: "0.82rem" }}>
                  روی یکی از پین‌ها کلیک کنید یا روی نقطه دلخواهی از نقشه کلیک کنید تا پین جدید ایجاد شود.
                </p>
              )}

              <hr style={{ border: 0, borderTop: "1px solid rgba(255,255,255,0.08)", margin: "8px 0" }} />

              <strong>فهرست نقاط داده ({hotspots.length})</strong>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
                {hotspots.map((h, i) => (
                  <div
                    key={h.id}
                    onClick={() => setSelectedPinId(h.id)}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      background: h.id === selectedPinId ? "rgba(56, 189, 248, 0.15)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${h.id === selectedPinId ? "#38bdf8" : "rgba(255,255,255,0.06)"}`,
                      cursor: "pointer",
                      fontSize: "0.78rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>
                      #{i + 1} {h.label || h.inputKey}
                    </span>
                    <code style={{ fontSize: "0.7rem", opacity: 0.7 }}>
                      {h.x}% / {h.y}%
                    </code>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
