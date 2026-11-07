import type { ReactNode } from "react";
import type { Project } from "../../shared/api/types";
import type { AppearanceMode } from "../../shared/style-engine/parts";
import ui from "../../shared/ui/controls.module.css";
import { ThemeToggle } from "../../shared/ui/ThemeToggle";
import styles from "./StudioShell.module.css";

export type StudioNavId = "projects" | "pages" | "data-sources" | "components" | "editor";

interface Props {
  mode: AppearanceMode;
  onModeChange: (mode: AppearanceMode) => void;
  userName: string;
  active: StudioNavId;
  project: Project | null;
  onNavigate: (id: Exclude<StudioNavId, "editor">) => void;
  onLogout: () => void;
  children: ReactNode;
}

export function StudioShell({
  mode, onModeChange, userName, active, project, onNavigate, onLogout, children,
}: Props) {
  const inProject = Boolean(project);
  const editor = active === "editor";

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
              <strong>{project.name}</strong>
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
          <div className={styles.userRow}>{userName}</div>
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
