import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { BindingValue } from "../api/types";
import { localize } from "../i18n";
import { resolveLinkHref } from "../rendering/DocumentRenderer";
import type { AppearanceMode } from "../style-engine/parts";
import { ThemeToggle } from "../ui/ThemeToggle";
import { formatKpiValue, useHeaderKpiPoller } from "./kpi-api";
import { projectThemeToCssVars } from "./storage";
import type { HeaderConfig, HeaderSectionId, MenuItemConfig, ProjectDataMode, ProjectThemeConfig, SiteHeaderCanvasDrag } from "./types";
import styles from "./SiteHeader.module.css";

interface Props {
  config: HeaderConfig;
  theme: ProjectThemeConfig;
  appearanceMode?: AppearanceMode;
  onAppearanceModeChange?: (mode: AppearanceMode) => void;
  siteSlug?: string;
  currentPath?: string;
  onNavigate?: (path: string) => void;
  liveValues?: Record<string, BindingValue>;
  canvasDrag?: SiteHeaderCanvasDrag;
  dataMode?: ProjectDataMode;
  showDataModeBadge?: boolean;
}

export function SiteHeader({
  config,
  theme,
  appearanceMode = "night",
  onAppearanceModeChange,
  siteSlug = "",
  currentPath = "/",
  onNavigate,
  liveValues,
  canvasDrag,
  dataMode = "auto",
  showDataModeBadge = true,
}: Props) {
  void siteSlug;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const apiKpiMap = useHeaderKpiPoller(config?.kpiWidgets);

  // Close drawer on Escape key and freeze background scrolling when open
  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    const origOverflow = typeof document !== "undefined" ? document.body.style.overflow : "";
    if (typeof document !== "undefined") {
      document.body.style.overflow = "hidden";
    }

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (typeof document !== "undefined") {
        document.body.style.overflow = origOverflow;
      }
    };
  }, [drawerOpen]);

  if (!config || !config.enabled) return null;

  const themeVars = projectThemeToCssVars(theme, appearanceMode);
  const isBottom = config.menu?.position === "bottom";
  const logoSize = (config.logo?.size || "md").toUpperCase();
  const logoSizeClass = styles[`logo${logoSize}`] || styles.logoMd;

  const handleLinkClick = (item: MenuItemConfig, e: React.MouseEvent) => {
    if (item.target === "_blank") return; // Let default browser tab open
    if (onNavigate) {
      e.preventDefault();
      onNavigate(item.link);
      setDrawerOpen(false);
    }
  };

  const renderMenuItem = (item: MenuItemConfig, inDrawer = false) => {
    const active = currentPath === item.link;
    const resolved = resolveLinkHref(item.link);
    const itemSlotId = `menu:${item.id}`;
    const isItemSelected = canvasDrag?.selectedId === itemSlotId;
    const isItemDragging = canvasDrag?.activeId === itemSlotId;
    const isItemTarget = canvasDrag?.dropTarget?.targetId === itemSlotId;
    const itemDropPlacement = isItemTarget ? canvasDrag?.dropTarget?.placement : null;
    const isItemDraggable = !inDrawer && Boolean(canvasDrag?.enabled);

    const commonDragProps = isItemDraggable
      ? {
          draggable: true,
          onClick: (e: React.MouseEvent) => {
            if (canvasDrag?.onSelect) {
              e.preventDefault();
              e.stopPropagation();
              canvasDrag.onSelect(itemSlotId, "menuItem");
            }
          },
          onDragStart: (e: React.DragEvent) => {
            e.stopPropagation();
            e.dataTransfer.setData("text/plain", itemSlotId);
            e.dataTransfer.effectAllowed = "move";
            canvasDrag?.onDragStart?.(itemSlotId, "menuItem");
          },
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            const rect = e.currentTarget.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const ratioX = rect.width > 0 ? mouseX / rect.width : 0.5;
            const isRtl = typeof document !== "undefined" && (document.dir === "rtl" || document.documentElement.dir === "rtl");
            const normX = isRtl ? 1 - ratioX : ratioX;
            const placement: "before" | "after" = normX < 0.5 ? "before" : "after";
            canvasDrag?.onDragOver?.(itemSlotId, "menuItem", placement);
          },
          onDragLeave: (e: React.DragEvent) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              canvasDrag?.onDragLeave?.(itemSlotId);
            }
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const targetPlacement = canvasDrag?.dropTarget?.placement ?? "after";
            canvasDrag?.onDrop?.(itemSlotId, targetPlacement);
          },
          onDragEnd: (e: React.DragEvent) => {
            e.stopPropagation();
            canvasDrag?.onDragEnd?.();
          },
        }
      : {};

    const itemLayout = config.menu?.itemLayout || "row";
    const showIcons = config.menu?.showIcons !== false;
    const itemLayoutClass =
      itemLayout === "column"
        ? styles.menuItemLayoutColumn
        : itemLayout === "row-reverse"
        ? styles.menuItemLayoutRowReverse
        : styles.menuItemLayoutRow;

    const dragClassNames = isItemDraggable
      ? `${styles.editableMenuItem} ${isItemSelected ? styles.slotSelected : ""} ${
          isItemDragging ? styles.menuItemDragging : ""
        } ${itemDropPlacement === "before" ? styles.menuItemDropBefore : ""} ${
          itemDropPlacement === "after" ? styles.menuItemDropAfter : ""
        }`
      : "";

    if (item.isButton) {
      return (
        <a
          key={item.id}
          href={resolved}
          target={item.target ?? "_self"}
          rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
          className={`${styles.menuButton} ${
            item.buttonVariant === "secondary" ? styles.btnSecondary : styles.btnPrimary
          } ${itemLayoutClass} ${dragClassNames}`}
          onClick={(e) => {
            if (isItemDraggable && canvasDrag?.onSelect) {
              e.preventDefault();
              e.stopPropagation();
              canvasDrag.onSelect(itemSlotId, "menuItem");
              return;
            }
            handleLinkClick(item, e);
          }}
          {...commonDragProps}
        >
          {showIcons && item.icon && <span>{item.icon}</span>}
          <span>{localize(item.label, "fa")}</span>
        </a>
      );
    }

    return (
      <a
        key={item.id}
        href={resolved}
        target={item.target ?? "_self"}
        rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
        className={`${inDrawer ? styles.drawerItem : styles.menuItem} ${
          active ? styles.menuItemActive : ""
        } ${itemLayoutClass} ${dragClassNames}`}
        onClick={(e) => {
          if (isItemDraggable && canvasDrag?.onSelect) {
            e.preventDefault();
            e.stopPropagation();
            canvasDrag.onSelect(itemSlotId, "menuItem");
            return;
          }
          handleLinkClick(item, e);
        }}
        {...commonDragProps}
      >
        {showIcons && item.icon && <span>{item.icon}</span>}
        <span>{localize(item.label, "fa")}</span>
      </a>
    );
  };

  const renderKpiChips = () => {
    if (!config.kpiWidgets || config.kpiWidgets.length === 0) return null;
    const kpiLayout = config.kpiLayout || "inline";
    const kpiLayoutClass =
      kpiLayout === "card"
        ? styles.kpiLayoutCard
        : kpiLayout === "stacked"
        ? styles.kpiLayoutStacked
        : styles.kpiLayoutInline;

    return (
      <div className={styles.kpiContainer} data-testid="header-kpi-container">
        {config.kpiWidgets.map((kpi) => {
          const kpiSlotId = `kpi:${kpi.id}`;
          const isKpiSelected = canvasDrag?.selectedId === kpiSlotId;
          const isKpiDragging = canvasDrag?.activeId === kpiSlotId;
          const isKpiTarget = canvasDrag?.dropTarget?.targetId === kpiSlotId;
          const kpiDropPlacement = isKpiTarget ? canvasDrag?.dropTarget?.placement : null;
          const isKpiDraggable = Boolean(canvasDrag?.enabled);

          let displayVal = kpi.value;
          let displayUnit = kpi.unit;
          let displayStatus: "good" | "warn" | "crit" = kpi.status || "good";
          let isLive = false;

          // 1. Live Data Binding (WebSocket or Project bindings)
          if (kpi.dataSourceType === "binding" && kpi.bindingId && liveValues) {
            const bv = liveValues[kpi.bindingId];
            if (bv !== undefined) {
              isLive = true;
              if (bv.value !== undefined && bv.value !== null) {
                displayVal = formatKpiValue(bv.value);
              }
              if (bv.quality === "good") displayStatus = "good";
              else if (bv.quality === "uncertain" || bv.quality === "stale") displayStatus = "warn";
              else if (bv.quality === "bad" || bv.quality === "no_data") displayStatus = "crit";
            }
          } else if (kpi.dataSourceType === "api" || (kpi.apiUrl && kpi.dataSourceType !== "static")) {
            // 2. Direct API Poller
            const polled = apiKpiMap[kpi.id];
            if (polled) {
              isLive = true;
              displayVal = polled.value;
              if (polled.unit) displayUnit = polled.unit;
              if (polled.status) displayStatus = polled.status;
            }
          }

          return (
            <div
              key={kpi.id}
              className={`${styles.kpiChip} ${kpiLayoutClass} ${
                displayStatus === "warn"
                  ? styles.kpiWarn
                  : displayStatus === "crit"
                  ? styles.kpiCrit
                  : styles.kpiGood
              } ${isKpiDraggable ? styles.editableKpiChip : ""} ${
                isKpiSelected ? styles.slotSelected : ""
              } ${isKpiDragging ? styles.kpiChipDragging : ""} ${
                kpiDropPlacement === "before" ? styles.kpiChipDropBefore : ""
              } ${kpiDropPlacement === "after" ? styles.kpiChipDropAfter : ""}`}
              draggable={isKpiDraggable}
              title={`${localize(kpi.label, "fa")}: ${displayVal} ${displayUnit ?? ""}${
                isLive ? " (بروزرسانی زنده)" : ""
              }`}
              onClick={(e) => {
                if (isKpiDraggable && canvasDrag?.onSelect) {
                  e.stopPropagation();
                  canvasDrag.onSelect(kpiSlotId, "kpi");
                }
              }}
              onDragStart={(e) => {
                if (!isKpiDraggable) return;
                e.stopPropagation();
                e.dataTransfer.setData("text/plain", kpiSlotId);
                e.dataTransfer.effectAllowed = "move";
                canvasDrag?.onDragStart?.(kpiSlotId, "kpi");
              }}
              onDragOver={(e) => {
                if (!isKpiDraggable) return;
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "move";
                const rect = e.currentTarget.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const ratioX = rect.width > 0 ? mouseX / rect.width : 0.5;
                const isRtl = typeof document !== "undefined" && (document.dir === "rtl" || document.documentElement.dir === "rtl");
                const normX = isRtl ? 1 - ratioX : ratioX;
                const placement: "before" | "after" = normX < 0.5 ? "before" : "after";
                canvasDrag?.onDragOver?.(kpiSlotId, "kpi", placement);
              }}
              onDragLeave={(e) => {
                if (!isKpiDraggable) return;
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  canvasDrag?.onDragLeave?.(kpiSlotId);
                }
              }}
              onDrop={(e) => {
                if (!isKpiDraggable) return;
                e.preventDefault();
                e.stopPropagation();
                const targetPlacement = canvasDrag?.dropTarget?.placement ?? "after";
                canvasDrag?.onDrop?.(kpiSlotId, targetPlacement);
              }}
              onDragEnd={(e) => {
                if (!isKpiDraggable) return;
                e.stopPropagation();
                canvasDrag?.onDragEnd?.();
              }}
            >
              {isLive && <span className={styles.kpiLiveDot} aria-hidden="true" />}
              {kpi.icon && <span className={styles.kpiIcon}>{kpi.icon}</span>}
              <span className={styles.kpiLabel}>{localize(kpi.label, "fa")}</span>
              <span className={styles.kpiValue}>
                {displayVal}
                {displayUnit && <span className={styles.kpiUnit}>{displayUnit}</span>}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const isThemeToggleInHeader =
    config.themeTogglePlacement === undefined ||
    config.themeTogglePlacement === "header-left" ||
    config.themeTogglePlacement === "header-right";

  const renderLogo = () => {
    if (!config.logo?.enabled) return null;
    const logoLayout = config.logo?.layout || "row";
    const logoAlign = config.logo?.align || "center";
    const logoGap = config.logo?.gap || "md";
    const showSubtitle = config.logo?.showSubtitle !== false;

    const layoutClass =
      logoLayout === "column"
        ? styles.logoLayoutColumn
        : logoLayout === "column-reverse"
        ? styles.logoLayoutColumnReverse
        : logoLayout === "row-reverse"
        ? styles.logoLayoutRowReverse
        : styles.logoLayoutRow;

    const alignClass =
      logoAlign === "start"
        ? styles.logoAlignStart
        : logoAlign === "end"
        ? styles.logoAlignEnd
        : styles.logoAlignCenter;

    const gapClass =
      logoGap === "sm"
        ? styles.logoGapSm
        : logoGap === "lg"
        ? styles.logoGapLg
        : styles.logoGapMd;

    return (
      <a
        href={resolveLinkHref(config.logo.link || "/")}
        className={`${styles.logoWrapper} ${layoutClass} ${alignClass} ${gapClass}`}
        onClick={(e) => {
          if (onNavigate) {
            e.preventDefault();
            onNavigate(config.logo.link || "/");
          }
        }}
      >
        {config.logo.imageUrl ? (
          <img
            src={config.logo.imageUrl}
            alt={localize(config.logo.title ?? "", "fa")}
            className={`${styles.logoImage} ${logoSizeClass}`}
          />
        ) : (
          <div className={`${styles.logoIcon} ${logoSizeClass}`}>
            {config.logo.icon || "⚡"}
          </div>
        )}
        <div
          className={styles.logoText}
          style={{
            alignItems: logoAlign === "center" ? "center" : logoAlign === "end" ? "flex-end" : "flex-start",
            textAlign: logoAlign === "center" ? "center" : logoAlign === "end" ? "end" : "start",
          }}
        >
          <span className={styles.logoTitle}>{localize(config.logo.title ?? "", "fa")}</span>
          {showSubtitle && config.logo.subtitle && (
            <span className={styles.logoSubtitle}>{localize(config.logo.subtitle, "fa")}</span>
          )}
        </div>
      </a>
    );
  };

  const renderNavMenu = () => {
    if (!config.menu?.enabled || config.menu.hamburger || isBottom) return null;
    const menuGap = config.menu?.gap || "md";
    const gapClass =
      menuGap === "sm"
        ? styles.menuGapSm
        : menuGap === "lg"
        ? styles.menuGapLg
        : styles.menuGapMd;

    return (
      <nav className={`${styles.menuNav} ${gapClass}`} aria-label="منوی اصلی">
        {(config.menu.items ?? []).map((item) => renderMenuItem(item))}
        {config.themeTogglePlacement === "header-menu" && onAppearanceModeChange && (
          <ThemeToggle mode={appearanceMode} onChange={onAppearanceModeChange} className={styles.menuThemeToggle} />
        )}
      </nav>
    );
  };

  const isTestData =
    dataMode === "test" ||
    (dataMode === "auto" &&
      Boolean(liveValues && Object.values(liveValues).some((v) => v.isTestData)));

  const renderDataModeBadge = () => {
    const show = showDataModeBadge && (config.showDataModeBadge ?? true);
    if (!show) return null;
    if (isTestData) {
      return (
        <div
          className={`${styles.badge} ${styles.badgeWarning}`}
          title="داده‌های این پروژه تستی / شبیه‌سازی هستند و به سنسورهای واقعی نیروگاه متصل نیستند"
          style={{ cursor: "help" }}
          data-testid="header-test-data-badge"
        >
          <span className={styles.dot} />
          <span>🧪 داده‌های تستی</span>
        </div>
      );
    }
    return (
      <div
        className={`${styles.badge} ${styles.badgeSuccess}`}
        title="داده‌های این پروژه به صورت زنده از تجهیزات و سنسورهای واقعی (SCADA) دریافت می‌شوند"
        style={{ cursor: "help" }}
        data-testid="header-live-data-badge"
      >
        <span className={styles.dot} />
        <span>🟢 داده‌های زنده</span>
      </div>
    );
  };

  const renderExtraBadge = () => {
    const showBadge = showDataModeBadge && (config.showDataModeBadge ?? true);
    if (!config.extraText?.enabled && !showBadge) return null;
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {renderDataModeBadge()}
        {config.extraText?.enabled && (
          <div
            className={`${styles.badge} ${
              config.extraText.badgeStyle === "success"
                ? styles.badgeSuccess
                : config.extraText.badgeStyle === "warning"
                ? styles.badgeWarning
                : styles.badgeInfo
            }`}
          >
            <span className={styles.dot} />
            <span>{localize(config.extraText.text, "fa")}</span>
          </div>
        )}
      </div>
    );
  };

  const renderThemeToggle = () => {
    if (!isThemeToggleInHeader || !onAppearanceModeChange) return null;
    return (
      <div className={styles.themeToggleWrapper} data-testid="header-theme-toggle">
        <ThemeToggle mode={appearanceMode} onChange={onAppearanceModeChange} />
      </div>
    );
  };

  const defaultOrder: HeaderSectionId[] =
    config.menu?.position === "left"
      ? ["logo", "kpis", "menu", "extra", "themeToggle"]
      : ["logo", "menu", "kpis", "extra", "themeToggle"];

  const activeOrder =
    config.headerOrder && config.headerOrder.length > 0
      ? config.headerOrder
      : defaultOrder;

  const hasKpis = Boolean(config.kpiWidgets && config.kpiWidgets.length > 0);

  const renderSection = (id: HeaderSectionId) => {
    switch (id) {
      case "logo":
        return renderLogo();
      case "menu":
        return renderNavMenu();
      case "kpis":
        return renderKpiChips();
      case "extra":
        return renderExtraBadge();
      case "themeToggle":
        return renderThemeToggle();
      default:
        return null;
    }
  };

  const renderedSlots = activeOrder
    .map((id, index) => ({ id, node: renderSection(id), index }))
    .filter((slot) => slot.node !== null);

  const splitSlotIndex =
    !hasKpis && renderedSlots.length > 1
      ? renderedSlots[Math.max(1, Math.floor(renderedSlots.length / 2))]?.index
      : -1;

  return (
    <>
      <header
        className={`${styles.header} ${config.sticky ? styles.sticky : ""} ${config.blur ? styles.blur : ""}`}
        style={themeVars as CSSProperties}
        data-site-header="true"
      >
        <div
          className={`${styles.mainBar} ${
            config.density === "compact"
              ? styles.densityCompact
              : config.density === "spacious"
              ? styles.densitySpacious
              : styles.densityNormal
          }`}
        >
          <div className={styles.orderedFlow}>
            {renderedSlots.map(({ id, node, index }) => {
              const slotId = `slot:${id}`;
              const isSelected = canvasDrag?.selectedId === slotId;
              const isDragging = canvasDrag?.activeId === slotId;
              const isTarget = canvasDrag?.dropTarget?.targetId === slotId;
              const dropPlacement = isTarget ? canvasDrag?.dropTarget?.placement : null;
              const isDraggable = Boolean(canvasDrag?.enabled);
              const labelFa =
                id === "logo"
                  ? "لوگو"
                  : id === "menu"
                  ? "منو"
                  : id === "kpis"
                  ? "شاخص‌های زنده"
                  : id === "extra"
                  ? "نشانگر وضعیت"
                  : "دکمه تم";

              return (
                <div
                  key={id}
                  className={`${styles.slotItem} ${id === "kpis" ? styles.slotKpis : ""} ${
                    index === splitSlotIndex ? styles.slotAutoMargin : ""
                  } ${isDraggable ? styles.editableSlot : ""} ${
                    isSelected ? styles.slotSelected : ""
                  } ${isDragging ? styles.slotDragging : ""} ${
                    dropPlacement === "before" ? styles.slotDropBefore : ""
                  } ${dropPlacement === "after" ? styles.slotDropAfter : ""}`}
                  data-slot={id}
                  draggable={isDraggable}
                  onClick={(e) => {
                    if (isDraggable && canvasDrag?.onSelect) {
                      e.stopPropagation();
                      canvasDrag.onSelect(slotId, id === "themeToggle" ? "themeToggle" : "headerBlock");
                    }
                  }}
                  onDragStart={(e) => {
                    if (!isDraggable) return;
                    e.stopPropagation();
                    e.dataTransfer.setData("text/plain", slotId);
                    e.dataTransfer.effectAllowed = "move";
                    canvasDrag?.onDragStart?.(slotId, id === "themeToggle" ? "themeToggle" : "headerBlock");
                  }}
                  onDragOver={(e) => {
                    if (!isDraggable) return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = "move";
                    const rect = e.currentTarget.getBoundingClientRect();
                    const mouseX = e.clientX - rect.left;
                    const ratioX = rect.width > 0 ? mouseX / rect.width : 0.5;
                    const isRtl =
                      typeof document !== "undefined" &&
                      (document.dir === "rtl" || document.documentElement.dir === "rtl");
                    const normX = isRtl ? 1 - ratioX : ratioX;
                    const placement: "before" | "after" = normX < 0.5 ? "before" : "after";
                    canvasDrag?.onDragOver?.(slotId, id === "themeToggle" ? "themeToggle" : "headerBlock", placement);
                  }}
                  onDragLeave={(e) => {
                    if (!isDraggable) return;
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      canvasDrag?.onDragLeave?.(slotId);
                    }
                  }}
                  onDrop={(e) => {
                    if (!isDraggable) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const targetPlacement = canvasDrag?.dropTarget?.placement ?? "after";
                    canvasDrag?.onDrop?.(slotId, targetPlacement);
                  }}
                  onDragEnd={(e) => {
                    if (!isDraggable) return;
                    e.stopPropagation();
                    canvasDrag?.onDragEnd?.();
                  }}
                >
                  {isDraggable && isSelected && (
                    <div
                      className={styles.canvasBadge}
                      title="برای جابجایی با ماوس بکشید"
                      onMouseDown={(ev) => ev.stopPropagation()}
                    >
                      <span>⠿</span> {labelFa}
                    </div>
                  )}
                  {node}
                </div>
              );
            })}
          </div>

          {/* Hamburger toggle button if hamburger mode is enabled */}
          {config.menu?.enabled && config.menu.hamburger && (
            <button
              type="button"
              className={styles.hamburgerButton}
              onClick={() => setDrawerOpen((prev) => !prev)}
              aria-label="باز و بستن منو"
              aria-expanded={drawerOpen}
              title="منو"
            >
              <span className={styles.bar} />
              <span className={styles.bar} />
              <span className={styles.bar} />
            </button>
          )}
        </div>

        {/* If menu position is BOTTOM, render as sub-bar */}
        {config.menu?.enabled && isBottom && !config.menu.hamburger && (
          <div className={styles.bottomBar}>
            <nav className={styles.menuNav} aria-label="منوی ناوبری">
              {(config.menu.items ?? []).map((item) => renderMenuItem(item))}
            </nav>
          </div>
        )}
      </header>

      {/* Hamburger Slide Drawer rendered in Portal to prevent clipping from header backdrop-filter/bounds */}
      {config.menu?.enabled &&
        config.menu.hamburger &&
        drawerOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className={styles.portalRoot} style={themeVars as CSSProperties} data-testid="hamburger-portal">
            <div
              className={styles.drawerOverlay}
              data-testid="hamburger-overlay"
              onClick={() => setDrawerOpen(false)}
            />
            <aside
              className={`${styles.drawer} ${config.menu.hamburgerSide === "left" ? styles.drawerLeft : styles.drawerRight}`}
              role="dialog"
              aria-modal="true"
              aria-label="منوی همبرگری"
              dir="rtl"
            >
              <div className={styles.drawerHeader}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: "1.2rem" }}>{config.logo?.icon || "⚡"}</span>
                  <strong style={{ fontSize: "1rem", color: "var(--color-text-primary, #e6edf3)" }}>
                    {localize(config.logo?.title ?? "", "fa")}
                  </strong>
                </div>
                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={() => setDrawerOpen(false)}
                  aria-label="بستن منو"
                >
                  ✕
                </button>
              </div>

              <div className={styles.drawerBody}>
                {/* Mobile / Hamburger KPI Telemetry block */}
                {config.kpiWidgets && config.kpiWidgets.length > 0 && (
                  <div className={styles.drawerKpiSection}>
                    <span className={styles.drawerSectionTitle}>📊 شاخص‌های مانیتورینگ زنده</span>
                    <div className={styles.drawerKpiGrid}>
                      {config.kpiWidgets.map((kpi) => (
                        <div
                          key={kpi.id}
                          className={`${styles.kpiChip} ${
                            kpi.status === "warn"
                              ? styles.kpiWarn
                              : kpi.status === "crit"
                              ? styles.kpiCrit
                              : styles.kpiGood
                          }`}
                        >
                          {kpi.icon && <span className={styles.kpiIcon}>{kpi.icon}</span>}
                          <span className={styles.kpiLabel}>{localize(kpi.label, "fa")}</span>
                          <span className={styles.kpiValue}>
                            {kpi.value}
                            {kpi.unit && <span className={styles.kpiUnit}>{kpi.unit}</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Drawer navigation menu items */}
                {(config.menu.items ?? []).map((item) => renderMenuItem(item, true))}

                {config.themeTogglePlacement === "header-menu" && onAppearanceModeChange && (
                  <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "0.85rem", opacity: 0.8 }}>حالت نمایش:</span>
                    <ThemeToggle mode={appearanceMode} onChange={onAppearanceModeChange} />
                  </div>
                )}
              </div>
            </aside>
          </div>,
          document.body
        )}
    </>
  );
}
