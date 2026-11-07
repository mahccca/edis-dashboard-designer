import type { AppearanceMode } from "../style-engine/parts";
import styles from "./ThemeToggle.module.css";

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 0 0 11.5 11.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

interface Props {
  mode: AppearanceMode;
  onChange: (mode: AppearanceMode) => void;
  className?: string;
}

/** Visitor-facing day/night switch (icon-only). */
export function ThemeToggle({ mode, onChange, className }: Props) {
  return (
    <div className={`${styles.toggle}${className ? ` ${className}` : ""}`} role="group" aria-label="حالت نمایش">
      <button type="button" className={styles.btn} aria-pressed={mode === "day"} aria-label="حالت روز"
              title="روز" onClick={() => onChange("day")}>
        <SunIcon />
      </button>
      <button type="button" className={styles.btn} aria-pressed={mode === "night"} aria-label="حالت شب"
              title="شب" onClick={() => onChange("night")}>
        <MoonIcon />
      </button>
    </div>
  );
}
