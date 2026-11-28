import { useEffect, useState, type ReactNode } from "react";
import type { Project } from "../../shared/api/types";
import type { AppearanceMode } from "../../shared/style-engine/parts";
import { getProjectDataMode } from "../../shared/site-layout";
import styles from "./StudioShell.module.css";

export type StudioNavId = "projects" | "pages" | "site-layout" | "data-sources" | "components" | "editor";

interface Props {
  mode: AppearanceMode;
  onModeChange: (mode: AppearanceMode) => void;
  userName: string;
  active: StudioNavId;
  project: Project | null;
  onNavigate: (id: Exclude<StudioNavId, "editor">) => void;
  onLogout: () => void;
  onOpenCredentials?: () => void;
  children: ReactNode;
}

export function StudioShell({
  mode,
  onModeChange,
  userName,
  active,
  project,
  onNavigate,
  onLogout,
  onOpenCredentials,
  children,
}: Props) {
  const inProject = Boolean(project);
  const editor = active === "editor";
  const [dataMode, setDataMode] = useState(() => (project ? getProjectDataMode(project.id, project.slug) : "auto"));

  useEffect(() => {
    if (!project) return;
    setDataMode(getProjectDataMode(project.id, project.slug));
    const onLayoutChange = () => {
      setDataMode(getProjectDataMode(project.id, project.slug));
    };
    window.addEventListener("ip-site-layout-change", onLayoutChange);
    return () => window.removeEventListener("ip-site-layout-change", onLayoutChange);
  }, [project]);

  return (
    <div className={styles.shell} data-theme={mode} dir="rtl">
      {/* Sleek slim vertical glass rail */}
      <aside className={styles.nav} aria-label="ناوبری استودیو">
        {/* Brand Icon */}
        <div className={styles.itemWrapper}>
          <div className={styles.brandLogo} aria-label="پلتفرم صنعتی Industrial Platform Studio">
            <span className={styles.brandIcon} aria-hidden="true">⚡</span>
          </div>
          <div className={styles.tooltip} role="tooltip">
            <span className={styles.tooltipTitle}>Industrial Platform Studio</span>
            <span className={styles.tooltipSub}>سیستم مدیریت و طراحی داشبورد صنعتی</span>
          </div>
        </div>

        <div className={styles.divider} />

        {/* Primary Navigation Icons */}
        <nav className={styles.section} aria-label="ابزارها">
          {/* Projects Button */}
          <div className={styles.itemWrapper}>
            <button
              type="button"
              className={`${styles.item} ${active === "projects" ? styles.itemActive : ""}`}
              onClick={() => onNavigate("projects")}
              aria-label="پروژه‌ها"
            >
              <span className={styles.itemIcon} aria-hidden="true">▣</span>
            </button>
            <div className={styles.tooltip} role="tooltip">
              <span className={styles.tooltipTitle}>پروژه‌ها</span>
              <span className={styles.tooltipSub}>مدیریت فضاهای کاری و سایت‌ها</span>
            </div>
          </div>

          {/* Active Project Indicator (if inside a project) */}
          {inProject && project && (
            <div className={styles.itemWrapper}>
              <div
                className={styles.projectPill}
                aria-label={`پروژه جاری: ${project.name}`}
              >
                <span className={styles.projectIcon} aria-hidden="true">🏭</span>
                <span
                  className={styles.dataModeDot}
                  data-mode={dataMode}
                  title={
                    dataMode === "test"
                      ? "محیط تستی"
                      : dataMode === "live"
                      ? "محیط واقعی"
                      : "محیط خودکار"
                  }
                />
              </div>
              <div className={styles.tooltip} role="tooltip">
                <span className={styles.tooltipTitle}>
                  <strong>{project.name}</strong>
                </span>
                <span className={styles.tooltipSub} dir="ltr">{project.slug}</span>
                <span className={styles.tooltipBadge}>
                  {dataMode === "test" ? "🧪 داده‌های تستی" : dataMode === "live" ? "🟢 داده‌های واقعی" : "⚡ داده‌ها: خودکار"}
                </span>
              </div>
            </div>
          )}

          {/* Pages Button */}
          <div className={styles.itemWrapper}>
            <button
              type="button"
              className={`${styles.item} ${active === "pages" || active === "editor" ? styles.itemActive : ""}`}
              disabled={!inProject}
              onClick={() => onNavigate("pages")}
              aria-label="صفحات"
            >
              <span className={styles.itemIcon} aria-hidden="true">▦</span>
              {editor && <span className={styles.editorIndicator} title="در حال ویرایش صفحه" />}
            </button>
            <div className={styles.tooltip} role="tooltip">
              <span className={styles.tooltipTitle}>صفحات</span>
              <span className={styles.tooltipSub}>
                {!inProject
                  ? "ابتدا یک پروژه انتخاب کنید"
                  : editor
                  ? "مشاهده صفحات (در حال ویرایش)"
                  : "لیست صفحات و ویرایشگر"}
              </span>
            </div>
          </div>

          {/* Site Layout & Global Theme Button */}
          <div className={styles.itemWrapper}>
            <button
              type="button"
              className={`${styles.item} ${active === "site-layout" ? styles.itemActive : ""}`}
              disabled={!inProject}
              onClick={() => onNavigate("site-layout")}
              aria-label="قالب و تم سایت"
            >
              <span className={styles.itemIcon} aria-hidden="true">🎨</span>
            </button>
            <div className={styles.tooltip} role="tooltip">
              <span className={styles.tooltipTitle}>قالب و تم سایت</span>
              <span className={styles.tooltipSub}>
                {inProject ? "هدر، منو، فوتر و تم پروژه" : "ابتدا یک پروژه انتخاب کنید"}
              </span>
            </div>
          </div>

          {/* Data Sources Button */}
          <div className={styles.itemWrapper}>
            <button
              type="button"
              className={`${styles.item} ${active === "data-sources" ? styles.itemActive : ""}`}
              disabled={!inProject}
              onClick={() => onNavigate("data-sources")}
              aria-label="منابع داده"
            >
              <span className={styles.itemIcon} aria-hidden="true">◎</span>
            </button>
            <div className={styles.tooltip} role="tooltip">
              <span className={styles.tooltipTitle}>منابع داده</span>
              <span className={styles.tooltipSub}>
                {inProject ? "سیگنال‌ها، شبیه‌ساز و اتصالات" : "ابتدا یک پروژه انتخاب کنید"}
              </span>
            </div>
          </div>

          {/* Components Button */}
          <div className={styles.itemWrapper}>
            <button
              type="button"
              className={`${styles.item} ${active === "components" ? styles.itemActive : ""}`}
              disabled={!inProject}
              onClick={() => onNavigate("components")}
              aria-label="کامپوننت‌ها"
            >
              <span className={styles.itemIcon} aria-hidden="true">◇</span>
            </button>
            <div className={styles.tooltip} role="tooltip">
              <span className={styles.tooltipTitle}>کامپوننت‌ها</span>
              <span className={styles.tooltipSub}>
                {inProject ? "کاتالوگ ویجت‌های صنعتی" : "ابتدا یک پروژه انتخاب کنید"}
              </span>
            </div>
          </div>
        </nav>

        {/* Footer / Account / Theme controls */}
        <div className={styles.footer}>
          {/* Security & Credentials */}
          {onOpenCredentials && (
            <div className={styles.itemWrapper}>
              <button
                type="button"
                className={styles.item}
                onClick={onOpenCredentials}
                aria-label="امنیت و حساب کاربری"
              >
                <span className={styles.itemIcon} aria-hidden="true">⚙️</span>
              </button>
              <div className={styles.tooltip} role="tooltip">
                <span className={styles.tooltipTitle}>حساب کاربری: {userName}</span>
                <span className={styles.tooltipSub}>مدیریت رمز عبور و امنیت</span>
              </div>
            </div>
          )}

          {/* Appearance Mode Toggle (Day/Night) */}
          <div className={styles.itemWrapper}>
            <button
              type="button"
              className={styles.item}
              onClick={() => onModeChange(mode === "night" ? "day" : "night")}
              aria-label={mode === "night" ? "تغییر به تم روز" : "تغییر به تم شب"}
            >
              <span className={styles.itemIcon} aria-hidden="true">
                {mode === "night" ? "☀️" : "🌙"}
              </span>
            </button>
            <div className={styles.tooltip} role="tooltip">
              <span className={styles.tooltipTitle}>
                {mode === "night" ? "تغییر به تم روز (Light)" : "تغییر به تم شب (Dark)"}
              </span>
              <span className={styles.tooltipSub}>تغییر رنگ‌بندی استودیو</span>
            </div>
          </div>

          {/* Logout */}
          <div className={styles.itemWrapper}>
            <button
              type="button"
              className={`${styles.item} ${styles.logoutBtn}`}
              onClick={onLogout}
              aria-label="خروج"
            >
              <span className={styles.itemIcon} aria-hidden="true">⎋</span>
            </button>
            <div className={styles.tooltip} role="tooltip">
              <span className={styles.tooltipTitle}>خروج از سیستم</span>
              <span className={styles.tooltipSub}>پایان نشست کاربر {userName}</span>
            </div>
          </div>
        </div>
      </aside>

      <div className={`${styles.main} ${editor ? styles.mainEditor : ""}`}>
        {children}
      </div>
    </div>
  );
}
