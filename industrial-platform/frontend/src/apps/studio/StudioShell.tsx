import { useEffect, useState, type ReactNode } from "react";
import type { Project } from "../../shared/api/types";
import type { AppearanceMode } from "../../shared/style-engine/parts";
import { getProjectDataMode } from "../../shared/site-layout";
import ui from "../../shared/ui/controls.module.css";
import { ThemeToggle } from "../../shared/ui/ThemeToggle";
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
  mode, onModeChange, userName, active, project, onNavigate, onLogout, onOpenCredentials, children,
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
      <aside className={styles.nav} aria-label="ناوبری استودیو">
        <div className={styles.brand}>
          <span className={styles.brandName}>Industrial Platform</span>
          <span className={styles.brandSub}>Studio · دسترسی ادمین</span>
        </div>

        <nav className={styles.section} aria-label="ابزارها">
          <div className={styles.sectionLabel}>فضای کاری</div>
          <button
            type="button"
            className={`${styles.item} ${active === "projects" ? styles.itemActive : ""}`}
            onClick={() => onNavigate("projects")}
          >
            <span className={styles.itemIcon} aria-hidden>▣</span>
            پروژه‌ها
          </button>

          {inProject && project && (
            <div className={styles.projectChip}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>{project.name}</strong>
                <span
                  style={{
                    fontSize: "0.68rem",
                    padding: "1px 6px",
                    borderRadius: 6,
                    background:
                      dataMode === "test"
                        ? "rgba(245, 165, 36, 0.2)"
                        : dataMode === "live"
                        ? "rgba(16, 185, 129, 0.2)"
                        : "rgba(56, 189, 248, 0.15)",
                    color:
                      dataMode === "test"
                        ? "#f5a524"
                        : dataMode === "live"
                        ? "#34d399"
                        : "#38bdf8",
                    border: `1px solid ${
                      dataMode === "test"
                        ? "rgba(245, 165, 36, 0.4)"
                        : dataMode === "live"
                        ? "rgba(16, 185, 129, 0.4)"
                        : "rgba(56, 189, 248, 0.3)"
                    }`,
                    fontWeight: 600,
                  }}
                  title={
                    dataMode === "test"
                      ? "محیط داده‌ها: تستی / شبیه‌سازی"
                      : dataMode === "live"
                      ? "محیط داده‌ها: واقعی و عملیاتی"
                      : "محیط داده‌ها: خودکار"
                  }
                >
                  {dataMode === "test" ? "🧪 تستی" : dataMode === "live" ? "🟢 واقعی" : "⚡ خودکار"}
                </span>
              </div>
              <span dir="ltr">{project.slug}</span>
            </div>
          )}

          <div className={styles.sectionLabel}>ابزار پروژه</div>
          <button
            type="button"
            className={`${styles.item} ${active === "pages" || active === "editor" ? styles.itemActive : ""}`}
            disabled={!inProject}
            onClick={() => onNavigate("pages")}
            title={inProject ? undefined : "اول یک پروژه باز کنید"}
          >
            <span className={styles.itemIcon} aria-hidden>▦</span>
            صفحات
            {editor && <span className={styles.itemMeta}>ویرایش</span>}
          </button>
          <button
            type="button"
            className={`${styles.item} ${active === "site-layout" ? styles.itemActive : ""}`}
            disabled={!inProject}
            onClick={() => onNavigate("site-layout")}
            title={inProject ? undefined : "اول یک پروژه باز کنید"}
          >
            <span className={styles.itemIcon} aria-hidden>🎨</span>
            قالب و تم سایت
          </button>
          <button
            type="button"
            className={`${styles.item} ${active === "data-sources" ? styles.itemActive : ""}`}
            disabled={!inProject}
            onClick={() => onNavigate("data-sources")}
            title={inProject ? undefined : "اول یک پروژه باز کنید"}
          >
            <span className={styles.itemIcon} aria-hidden>◎</span>
            منابع داده
          </button>
          <button
            type="button"
            className={`${styles.item} ${active === "components" ? styles.itemActive : ""}`}
            disabled={!inProject}
            onClick={() => onNavigate("components")}
            title={inProject ? undefined : "اول یک پروژه باز کنید"}
          >
            <span className={styles.itemIcon} aria-hidden>◇</span>
            کامپوننت‌ها
          </button>
        </nav>

        <div className={styles.footer}>
          <div
            className={styles.userRow}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: onOpenCredentials ? "pointer" : "default",
            }}
            onClick={onOpenCredentials}
            title={onOpenCredentials ? "کلیک جهت تغییر رمز عبور و مدیریت حساب کاربری" : undefined}
          >
            <span style={{ fontWeight: 600 }}>{userName}</span>
            {onOpenCredentials && (
              <span
                style={{
                  fontSize: "0.72rem",
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "rgba(56, 189, 248, 0.15)",
                  color: "#38bdf8",
                  border: "1px solid rgba(56, 189, 248, 0.3)",
                }}
              >
                ⚙️ امنیت و رمز
              </span>
            )}
          </div>
          <div className={ui.row} style={{ paddingInline: 4, justifyContent: "space-between" }}>
            <ThemeToggle mode={mode} onChange={onModeChange} />
            <button type="button" className={ui.button} onClick={onLogout}>خروج</button>
          </div>
        </div>
      </aside>

      <div className={`${styles.main} ${editor ? styles.mainEditor : ""}`}>
        {children}
      </div>
    </div>
  );
}
