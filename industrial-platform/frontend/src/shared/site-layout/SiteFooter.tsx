import type { CSSProperties } from "react";
import { localize } from "../i18n";
import { resolveLinkHref } from "../rendering/DocumentRenderer";
import type { AppearanceMode } from "../style-engine/parts";
import { ThemeToggle } from "../ui/ThemeToggle";
import { projectThemeToCssVars } from "./storage";
import type { FooterConfig, ProjectThemeConfig, SiteFooterCanvasDrag, ThemeTogglePlacement } from "./types";
import styles from "./SiteFooter.module.css";

interface Props {
  config: FooterConfig;
  theme: ProjectThemeConfig;
  appearanceMode?: AppearanceMode;
  onAppearanceModeChange?: (mode: AppearanceMode) => void;
  themeTogglePlacement?: ThemeTogglePlacement;
  siteSlug?: string;
  onNavigate?: (path: string) => void;
  canvasDrag?: SiteFooterCanvasDrag;
}

export function SiteFooter({
  config,
  theme,
  appearanceMode = "night",
  onAppearanceModeChange,
  themeTogglePlacement,
  siteSlug = "",
  onNavigate,
  canvasDrag,
}: Props) {
  void siteSlug;
  if (!config.enabled) return null;

  const isFooterThemeToggle =
    config.themeTogglePlacement === "footer" || themeTogglePlacement === "footer";

  const themeVars = projectThemeToCssVars(theme, appearanceMode);

  const columnsLayoutClass =
    config.columnsLayout === "2-col"
      ? styles.columns2Col
      : config.columnsLayout === "stacked"
      ? styles.columnsStacked
      : styles.columns3Col;

  const linksLayoutClass =
    config.linksLayout === "row"
      ? styles.linkListRow
      : config.linksLayout === "grid"
      ? styles.linkListGrid
      : styles.linkListCol;

  return (
    <footer
      className={`${styles.footer} ${config.sticky ? styles.sticky : ""}`}
      style={themeVars as CSSProperties}
      data-site-footer="true"
      onClick={() => {
        if (canvasDrag?.onSelect) {
          canvasDrag.onSelect("footer", "footer");
        }
      }}
    >
      <div className={styles.container}>
        <div className={`${styles.columns} ${columnsLayoutClass}`}>
          {/* Column 1: About / Description */}
          <div className={styles.col}>
            <span className={styles.colTitle}>پلتفرم بصری صنعتی</span>
            <p className={styles.colText}>{localize(config.aboutText ?? "", "fa")}</p>
          </div>

          {/* Column 2: Quick Links */}
          <div className={styles.col}>
            <span className={styles.colTitle}>{localize(config.linksTitle ?? "دسترسی سریع", "fa")}</span>
            <ul className={`${styles.linkList} ${linksLayoutClass}`}>
              {(config.links ?? []).map((link) => {
                const linkSlotId = `footerLink:${link.id}`;
                const isSelected = canvasDrag?.selectedId === linkSlotId;
                const isDragging = canvasDrag?.activeId === linkSlotId;
                const isTarget = canvasDrag?.dropTarget?.targetId === linkSlotId;
                const dropPlacement = isTarget ? canvasDrag?.dropTarget?.placement : null;
                const isDraggable = Boolean(canvasDrag?.enabled);

                return (
                  <li
                    key={link.id}
                    className={`${isDraggable ? styles.editableLink : ""} ${
                      isSelected ? styles.linkSelected : ""
                    } ${isDragging ? styles.linkDragging : ""} ${
                      dropPlacement === "before" ? styles.linkDropBefore : ""
                    } ${dropPlacement === "after" ? styles.linkDropAfter : ""}`}
                    draggable={isDraggable}
                    onClick={(e) => {
                      if (isDraggable && canvasDrag?.onSelect) {
                        e.stopPropagation();
                        canvasDrag.onSelect(linkSlotId, "footerLink");
                      }
                    }}
                    onDragStart={(e) => {
                      if (!isDraggable) return;
                      e.stopPropagation();
                      e.dataTransfer.setData("text/plain", linkSlotId);
                      e.dataTransfer.effectAllowed = "move";
                      canvasDrag?.onDragStart?.(linkSlotId, "footerLink");
                    }}
                    onDragOver={(e) => {
                      if (!isDraggable) return;
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = "move";
                      const rect = e.currentTarget.getBoundingClientRect();
                      const mouseY = e.clientY - rect.top;
                      const placement: "before" | "after" =
                        rect.height > 0 && mouseY / rect.height < 0.5 ? "before" : "after";
                      canvasDrag?.onDragOver?.(linkSlotId, "footerLink", placement);
                    }}
                    onDragLeave={(e) => {
                      if (!isDraggable) return;
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        canvasDrag?.onDragLeave?.(linkSlotId);
                      }
                    }}
                    onDrop={(e) => {
                      if (!isDraggable) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const targetPlacement = canvasDrag?.dropTarget?.placement ?? "after";
                      canvasDrag?.onDrop?.(linkSlotId, targetPlacement);
                    }}
                    onDragEnd={(e) => {
                      if (!isDraggable) return;
                      e.stopPropagation();
                      canvasDrag?.onDragEnd?.();
                    }}
                  >
                    <a
                      href={resolveLinkHref(link.link)}
                      target={link.target ?? "_self"}
                      rel={link.target === "_blank" ? "noopener noreferrer" : undefined}
                      className={styles.linkItem}
                      onClick={(e) => {
                        if (isDraggable && canvasDrag?.onSelect) {
                          e.preventDefault();
                          e.stopPropagation();
                          canvasDrag.onSelect(linkSlotId, "footerLink");
                          return;
                        }
                        if (link.target !== "_blank" && onNavigate) {
                          e.preventDefault();
                          onNavigate(link.link);
                        }
                      }}
                    >
                      {localize(link.label, "fa")}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Column 3: Live telemetry & status */}
          {config.showStatusIndicator && (
            <div className={styles.col}>
              <span className={styles.colTitle}>وضعیت سرویس</span>
              <div className={styles.statusIndicator}>
                <span className={styles.statusDot} />
                <span>{localize(config.statusText ?? "سرویس فعال", "fa")}</span>
              </div>
            </div>
          )}
        </div>

        {/* Bottom copyright bar */}
        <div className={styles.bottomBar}>
          <span>{localize(config.copyright ?? "", "fa")}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {isFooterThemeToggle && onAppearanceModeChange && (
              <div
                data-testid="footer-theme-toggle"
                className={canvasDrag?.enabled ? styles.editableThemeToggle : ""}
                draggable={Boolean(canvasDrag?.enabled)}
                onClick={(e) => {
                  if (canvasDrag?.enabled && canvasDrag?.onSelect) {
                    e.stopPropagation();
                    canvasDrag.onSelect("slot:themeToggle", "themeToggle");
                  }
                }}
                onDragStart={(e) => {
                  if (!canvasDrag?.enabled) return;
                  e.stopPropagation();
                  e.dataTransfer.setData("text/plain", "slot:themeToggle");
                  e.dataTransfer.effectAllowed = "move";
                  canvasDrag?.onDragStart?.("slot:themeToggle", "themeToggle");
                }}
                onDragEnd={(e) => {
                  if (!canvasDrag?.enabled) return;
                  e.stopPropagation();
                  canvasDrag?.onDragEnd?.();
                }}
              >
                <ThemeToggle mode={appearanceMode} onChange={onAppearanceModeChange} />
              </div>
            )}
            <span style={{ opacity: 0.6 }}>v2.4.0 · SCADA Web Engine</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
