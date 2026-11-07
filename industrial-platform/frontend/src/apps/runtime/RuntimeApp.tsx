import { useEffect, useState } from "react";
import { ApiError, http } from "../../shared/api/http";
import type { RenderBundle } from "../../shared/api/types";
import { useAppearancePreference } from "../../shared/appearance/useAppearancePreference";
import type { Locale } from "../../shared/i18n";
import { useLiveValues, type LiveStatus } from "../../shared/live-data";
import { ThemeToggle } from "../../shared/ui/ThemeToggle";
import { RuntimePage } from "./RuntimePage";
import styles from "./RuntimeApp.module.css";

const LIVE_STATUS_LABEL: Record<LiveStatus, string> = {
  connecting: "در حال اتصال…", live: "زنده", polling: "به‌روزرسانی دوره‌ای", error: "خطا در دریافت داده",
};

type Load = { state: "loading" } | { state: "ready"; bundle: RenderBundle } | { state: "error"; status: number; message: string };

export function RuntimeApp({ search }: { search: string }) {
  const params = new URLSearchParams(search);
  const site = params.get("site") ?? "";
  const path = params.get("path") ?? "/";
  const locale: Locale = params.get("lang") === "en" ? "en" : "fa";
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    if (!site) {
      setLoad({ state: "error", status: 400, message: "آدرس ناقص است؛ پارامتر site (شناسهٔ پروژه) لازم است." });
      return;
    }
    const ctrl = new AbortController();
    http.get<RenderBundle>(`/runtime/sites/${encodeURIComponent(site)}/resolve`, { query: { path }, signal: ctrl.signal })
      .then(({ data }) => setLoad({ state: "ready", bundle: data }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        const status = e instanceof ApiError ? e.status : 0;
        setLoad({ state: "error", status, message: e instanceof Error ? e.message : "بارگذاری صفحه ناموفق بود." });
      });
    return () => ctrl.abort();
  }, [site, path]);

  const documentDefault = load.state === "ready" ? load.bundle.document.settings?.colorScheme : undefined;
  const { mode, setMode } = useAppearancePreference(
    typeof documentDefault === "string" ? documentDefault : undefined,
    site || undefined,
  );

  const bundle = load.state === "ready" ? load.bundle : null;
  const live = useLiveValues(site, bundle?.publishedVersionId ?? null, bundle?.liveChannel?.topics ?? []);

  if (load.state === "loading") {
    return (
      <div className={styles.shell} data-theme={mode}>
        <div className={styles.message}>…</div>
        <ThemeToggle mode={mode} onChange={setMode} className={styles.themeToggle} />
      </div>
    );
  }
  if (load.state === "error") {
    return (
      <div className={styles.shell} data-theme={mode}>
        <div className={styles.message}>
          {load.status === 401 ? <a href="/">برای مشاهده وارد شوید</a> : load.status === 404 ? "صفحه یافت نشد." : load.message}
        </div>
        <ThemeToggle mode={mode} onChange={setMode} className={styles.themeToggle} />
      </div>
    );
  }
  return (
    <div className={styles.shell} data-theme={mode}>
      <RuntimePage bundle={load.bundle} values={live.values} locale={locale} appearanceMode={mode} />
      <ThemeToggle mode={mode} onChange={setMode} className={styles.themeToggle} />
      <div className={styles.status} data-status={live.status}>{LIVE_STATUS_LABEL[live.status]}</div>
    </div>
  );
}
