import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ApiError, http } from "../../shared/api/http";
import type { DocNode, RenderBundle } from "../../shared/api/types";
import { useAppearancePreference } from "../../shared/appearance/useAppearancePreference";
import type { Locale } from "../../shared/i18n";
import { useLiveValues, type LiveStatus } from "../../shared/live-data";
import { ThemeToggle } from "../../shared/ui/ThemeToggle";
import {
  loadSiteLayout,
  projectThemeToCssVars,
  projectThemeToTokens,
  saveSharedHeaderNode,
  SiteFooter,
  SiteHeader,
} from "../../shared/site-layout";
import { localize } from "../../shared/i18n";
import { NodeView, ThemeScope } from "../../shared/rendering/DocumentRenderer";
import { themeTokensFor } from "../../shared/appearance/tokens";
import { RuntimePage, testDataBindings } from "./RuntimePage";
import styles from "./RuntimeApp.module.css";

const LIVE_STATUS_LABEL: Record<LiveStatus, string> = {
  connecting: "در حال اتصال…", live: "زنده", polling: "به‌روزرسانی دوره‌ای", error: "خطا در دریافت داده",
};

type Load = { state: "loading" } | { state: "ready"; bundle: RenderBundle } | { state: "error"; status: number; message: string };

function findCustomHeaderSection(bundle: RenderBundle | null | undefined): DocNode | null {
  if (!bundle?.document?.root?.children) return null;
  const found = bundle.document.root.children.find(
    (node) =>
      node.type === "section" &&
      (Boolean(node.props?.isSiteHeader) || Boolean(node.props?.fixedHeader) || Boolean(node.props?.sharedHeader))
  );
  return found ?? null;
}

export function RuntimeApp({ search }: { search: string }) {
  const initialParams = new URLSearchParams(search);
  const site = initialParams.get("site") ?? "";
  const [currentPath, setCurrentPath] = useState<string>(() => initialParams.get("path") ?? "/");
  const locale: Locale = initialParams.get("lang") === "en" ? "en" : "fa";

  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [activeBundle, setActiveBundle] = useState<RenderBundle | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Client-side SPA navigation: updates URL and state without full page reload
  const navigate = useCallback(
    (toPath: string) => {
      let normalized = toPath.trim();
      if (normalized.includes("path=")) {
        try {
          const u = new URL(normalized, "http://localhost");
          normalized = u.searchParams.get("path") || normalized;
        } catch {
          /* ignore */
        }
      }
      if (!normalized.startsWith("/")) normalized = `/${normalized}`;
      if (normalized === currentPath) return;

      const url = new URL(window.location.href);
      url.searchParams.set("path", normalized);
      window.history.pushState({ site, path: normalized }, "", url.toString());
      setCurrentPath(normalized);
    },
    [currentPath, site]
  );

  // Handle browser back and forward buttons
  useEffect(() => {
    const onPopState = () => {
      const p = new URLSearchParams(window.location.search);
      setCurrentPath(p.get("path") ?? "/");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Fetch page bundle on path or site change with seamless transition
  useEffect(() => {
    if (!site) {
      setLoad({ state: "error", status: 400, message: "آدرس ناقص است؛ پارامتر site (شناسهٔ پروژه) لازم است." });
      return;
    }
    const ctrl = new AbortController();
    if (activeBundle) {
      setIsTransitioning(true);
    } else {
      setLoad({ state: "loading" });
    }

    http.get<RenderBundle>(`/runtime/sites/${encodeURIComponent(site)}/resolve`, {
      query: { path: currentPath },
      signal: ctrl.signal,
    })
      .then(async ({ data }) => {
        let bundleData = data;
        if (!bundleData) {
          try {
            const fresh = await http.get<RenderBundle>(`/runtime/sites/${encodeURIComponent(site)}/resolve`, {
              query: { path: currentPath, _t: Date.now() },
              signal: ctrl.signal,
            });
            bundleData = fresh.data;
          } catch {
            /* ignore */
          }
        }
        if (bundleData) {
          setActiveBundle(bundleData);
          setLoad({ state: "ready", bundle: bundleData });
          setIsTransitioning(false);
        }
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        const status = e instanceof ApiError ? e.status : 0;
        setLoad({ state: "error", status, message: e instanceof Error ? e.message : "بارگذاری صفحه ناموفق بود." });
        setIsTransitioning(false);
      });

    return () => ctrl.abort();
  }, [site, currentPath]);

  const siteLayout = loadSiteLayout(
    site,
    activeBundle?.page?.title ? localize(activeBundle.page.title, "fa") : site,
    site
  );

  const documentDefault = activeBundle?.document?.settings?.colorScheme;
  const effectiveDefault =
    typeof documentDefault === "string" && (documentDefault === "day" || documentDefault === "night")
      ? documentDefault
      : siteLayout.theme.defaultAppearance === "day"
      ? "day"
      : "night";

  const { mode, setMode } = useAppearancePreference(
    effectiveDefault,
    site || undefined
  );

  const live = useLiveValues(site, activeBundle?.publishedVersionId ?? null, activeBundle?.liveChannel?.topics ?? []);

  // If the main page ("/") has a custom header section, cache it project-wide
  const pageHeader = findCustomHeaderSection(activeBundle);
  const isMainPage = currentPath === "/" || currentPath === "";
  const headerSavedRef = useRef(false);

  useEffect(() => {
    if (isMainPage && pageHeader && !headerSavedRef.current) {
      saveSharedHeaderNode(site, pageHeader, site);
      headerSavedRef.current = true;
    }
  }, [isMainPage, pageHeader, site]);

  // Determine effective custom header: page's own header, or shared header from the main page
  const effectiveCustomHeader =
    pageHeader ?? (siteLayout.header.shareMainPageHeader !== false ? siteLayout.header.sharedHeaderNode ?? null : null);

  const headerSource = siteLayout.header.source || "auto";
  const useCustomPageHeader =
    headerSource === "page-builder"
      ? Boolean(effectiveCustomHeader)
      : headerSource === "standard"
      ? false
      : Boolean(effectiveCustomHeader);

  if (load.state === "loading" && !activeBundle) {
    return (
      <div className={styles.shell} data-theme={mode}>
        <div className={styles.message}>…</div>
        <ThemeToggle mode={mode} onChange={setMode} className={styles.themeToggle} />
      </div>
    );
  }
  if (load.state === "error" && !activeBundle) {
    return (
      <div className={styles.shell} data-theme={mode}>
        <div className={styles.message}>
          {load.status === 401 ? <a href="/">برای مشاهده وارد شوید</a> : load.status === 404 ? "صفحه یافت نشد." : load.message}
        </div>
        <ThemeToggle mode={mode} onChange={setMode} className={styles.themeToggle} />
      </div>
    );
  }
  if (!activeBundle) {
    return (
      <div className={styles.shell} data-theme={mode}>
        <div className={styles.message}>در حال آماده‌سازی داده‌های صفحه…</div>
        <ThemeToggle mode={mode} onChange={setMode} className={styles.themeToggle} />
      </div>
    );
  }

  const authorTokens = activeBundle.theme?.tokens ?? {};
  const schemeTokens = themeTokensFor(mode);
  const projectTokens = projectThemeToTokens(siteLayout.theme, mode);
  const themeTokens = {
    ...schemeTokens,
    ...authorTokens,
    ...projectTokens,
    color: {
      ...((schemeTokens.color as Record<string, unknown>) ?? {}),
      ...((authorTokens.color as Record<string, unknown>) ?? {}),
      ...((projectTokens.color as Record<string, unknown>) ?? {}),
    },
    radius: {
      ...((authorTokens.radius as Record<string, unknown>) ?? {}),
      ...((projectTokens.radius as Record<string, unknown>) ?? {}),
    },
  };
  const projectCssVars = projectThemeToCssVars(siteLayout.theme, mode);

  return (
    <div className={styles.shell} data-theme={mode} style={projectCssVars as CSSProperties}>
      <ThemeScope tokens={themeTokens} style={projectCssVars as CSSProperties}>
        {/* Top thin glowing transition progress bar */}
        {isTransitioning && <div className={styles.progressBar} aria-hidden="true" />}

        {/* PERSISTENT HEADER SLOT: Never unmounts, never resets state across page changes */}
        {useCustomPageHeader && effectiveCustomHeader ? (
          <header className={styles.customHeaderSlot} data-site-header="true">
            <NodeView
              node={effectiveCustomHeader}
              ctx={{
                components: activeBundle.components ?? [],
                values: live.values,
                testDataBindings: testDataBindings(activeBundle),
                locale,
                appearanceMode: mode,
                onNavigate: navigate,
              }}
            />
          </header>
        ) : (
          siteLayout.header.enabled && (
            <SiteHeader
              config={siteLayout.header}
              theme={siteLayout.theme}
              appearanceMode={mode}
              onAppearanceModeChange={setMode}
              siteSlug={site}
              currentPath={currentPath}
              onNavigate={navigate}
              liveValues={live.values}
              dataMode={siteLayout.dataEnvironment ?? "auto"}
              showDataModeBadge={siteLayout.showDataModeBadge ?? siteLayout.header.showDataModeBadge ?? true}
            />
          )
        )}

        {/* TRANSITIONING PAGE CONTENT */}
        <main className={`${styles.content} ${isTransitioning ? styles.transitioningContent : ""}`}>
          <RuntimePage
            bundle={activeBundle}
            values={live.values}
            locale={locale}
            appearanceMode={mode}
            onNavigate={navigate}
            omitHeaderSection={siteLayout.header.enabled || Boolean(useCustomPageHeader && effectiveCustomHeader)}
            projectTheme={siteLayout.theme}
            dataEnvironment={siteLayout.dataEnvironment ?? "auto"}
          />
        </main>

        {/* PERSISTENT FOOTER */}
        <SiteFooter
          config={siteLayout.footer}
          theme={siteLayout.theme}
          appearanceMode={mode}
          onAppearanceModeChange={setMode}
          themeTogglePlacement={siteLayout.header.themeTogglePlacement ?? siteLayout.themeTogglePlacement}
          siteSlug={site}
          onNavigate={navigate}
        />
        {((siteLayout.header.themeTogglePlacement ?? siteLayout.themeTogglePlacement) === "floating-bottom-left" ||
          (siteLayout.header.themeTogglePlacement ?? siteLayout.themeTogglePlacement) === "floating-bottom-right") && (
          <ThemeToggle
            mode={mode}
            onChange={setMode}
            className={
              (siteLayout.header.themeTogglePlacement ?? siteLayout.themeTogglePlacement) === "floating-bottom-left"
                ? styles.themeToggleFloatingLeft
                : styles.themeToggleFloatingRight
            }
          />
        )}
        <div className={styles.status} data-status={live.status}>
          <span>{LIVE_STATUS_LABEL[live.status]}</span>
          {(siteLayout.dataEnvironment === "test" ||
            (siteLayout.dataEnvironment !== "live" &&
              (activeBundle.containsTestData || Object.values(live.values).some((v) => v.isTestData)))) && (
            <span
              style={{
                marginInlineStart: 8,
                padding: "2px 6px",
                borderRadius: 4,
                background: "rgba(245, 165, 36, 0.25)",
                color: "#fbbf24",
                fontSize: "0.72rem",
                fontWeight: 600,
              }}
              title="داده‌های این سامانه از شبیه‌ساز دریافت می‌شوند و واقعی نیستند"
            >
              🧪 داده‌های تستی
            </span>
          )}
        </div>
      </ThemeScope>
    </div>
  );
}
