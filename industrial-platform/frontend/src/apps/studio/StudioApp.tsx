import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, http, setCsrfToken } from "../../shared/api/http";
import type { Me, PageSummary, Project } from "../../shared/api/types";
import { useAppearancePreference } from "../../shared/appearance/useAppearancePreference";
import { Editor } from "../../modules/page-builder/Editor";
import { ComponentStudio } from "../../modules/platform/ComponentStudio";
import { DataSources } from "../../modules/platform/DataSources";
import { Login } from "../../modules/platform/Login";
import { Pages } from "../../modules/platform/Pages";
import { Projects } from "../../modules/platform/Projects";
import { SiteLayoutStudio } from "../../modules/platform/SiteLayoutStudio";
import { UserCredentialsModal } from "../../modules/platform/UserCredentialsModal";
import ui from "../../shared/ui/controls.module.css";
import { ThemeToggle } from "../../shared/ui/ThemeToggle";
import { StudioShell, type StudioNavId } from "./StudioShell";

export type View =
  | { name: "projects" }
  | { name: "pages"; project: Project }
  | { name: "data-sources"; project: Project }
  | { name: "components"; project: Project }
  | { name: "site-layout"; project: Project }
  | { name: "editor"; project: Project; page: PageSummary };

interface PersistedViewParams {
  projectId: string | null;
  tab: string | null;
  pageId: string | null;
}

function readViewFromUrlOrStorage(): PersistedViewParams {
  const params = new URLSearchParams(window.location.search);
  let projectId = params.get("project") || params.get("projectId");
  let tab = params.get("tab") || params.get("view");
  let pageId = params.get("page") || params.get("pageId");

  if (!projectId) {
    try {
      const raw = localStorage.getItem("ip.studio.lastView");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.projectId === "string") {
          projectId = parsed.projectId;
          tab = tab || parsed.tab || "pages";
          pageId = pageId || parsed.pageId || null;
        }
      }
    } catch {
      /* ignore */
    }
  }

  return { projectId, tab, pageId };
}

function syncViewToUrlAndStorage(currentView: View, replace = false) {
  const url = new URL(window.location.href);
  if (currentView.name === "projects") {
    url.searchParams.delete("project");
    url.searchParams.delete("projectId");
    url.searchParams.delete("tab");
    url.searchParams.delete("view");
    url.searchParams.delete("page");
    url.searchParams.delete("pageId");
    try {
      localStorage.removeItem("ip.studio.lastView");
    } catch {
      /* ignore */
    }
  } else {
    url.searchParams.set("project", currentView.project.id);
    url.searchParams.set("tab", currentView.name);
    if (currentView.name === "editor") {
      url.searchParams.set("page", currentView.page.id);
    } else {
      url.searchParams.delete("page");
      url.searchParams.delete("pageId");
    }
    try {
      localStorage.setItem(
        "ip.studio.lastView",
        JSON.stringify({
          projectId: currentView.project.id,
          projectSlug: currentView.project.slug,
          tab: currentView.name,
          pageId: currentView.name === "editor" ? currentView.page.id : null,
        })
      );
    } catch {
      /* ignore */
    }
  }

  const newSearch = url.searchParams.toString() ? `?${url.searchParams.toString()}` : "";
  const newUrl = url.pathname + newSearch + url.hash;
  const currentUrl = window.location.pathname + window.location.search + window.location.hash;

  if (newUrl !== currentUrl) {
    if (replace) {
      window.history.replaceState({ studioView: currentView.name }, "", newUrl);
    } else {
      window.history.pushState({ studioView: currentView.name }, "", newUrl);
    }
  }
}

export function StudioApp() {
  const [me, setMe] = useState<Me | null | "anonymous">(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ name: "projects" });
  const [isRestoring, setIsRestoring] = useState(false);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const { mode, setMode } = useAppearancePreference("night");
  const hasRestoredRef = useRef(false);

  const updateView = useCallback((nextView: View, replace = false) => {
    syncViewToUrlAndStorage(nextView, replace);
    setView(nextView);
  }, []);

  const restoreView = useCallback(async () => {
    const { projectId, tab, pageId } = readViewFromUrlOrStorage();
    if (!projectId) {
      setView({ name: "projects" });
      return;
    }

    setIsRestoring(true);
    try {
      let targetProject: Project | null = null;
      try {
        const { data } = await http.get<Project>(`/projects/${projectId}`);
        targetProject = data;
      } catch {
        try {
          const { data: listRes } = await http.get<{ items: Project[] }>("/projects");
          targetProject = listRes.items.find((p) => p.id === projectId || p.slug === projectId) ?? null;
        } catch {
          targetProject = null;
        }
      }

      if (!targetProject) {
        updateView({ name: "projects" }, true);
        return;
      }

      const targetTab = tab || "pages";

      if (targetTab === "editor" && pageId) {
        try {
          const { data: pagesRes } = await http.get<{ items: PageSummary[] }>(`/projects/${targetProject.id}/pages`);
          const targetPage = pagesRes.items.find(
            (p) => p.id === pageId || p.slug === pageId || p.path === pageId
          );
          if (targetPage) {
            updateView({ name: "editor", project: targetProject, page: targetPage }, true);
            return;
          }
        } catch {
          /* fallback to pages */
        }
        updateView({ name: "pages", project: targetProject }, true);
        return;
      }

      if (
        targetTab === "site-layout" ||
        targetTab === "data-sources" ||
        targetTab === "components"
      ) {
        updateView({ name: targetTab, project: targetProject }, true);
        return;
      }

      updateView({ name: "pages", project: targetProject }, true);
    } catch {
      updateView({ name: "projects" }, true);
    } finally {
      setIsRestoring(false);
    }
  }, [updateView]);

  const loadMe = useCallback(async () => {
    setBootError(null);
    try {
      const { data } = await http.get<Me>("/auth/me");
      setCsrfToken(data.csrfToken);
      setMe(data);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setMe("anonymous");
        return;
      }
      setMe("anonymous");
      setBootError(e instanceof ApiError ? `${e.status}: ${e.message}` : "ارتباط با سرور برقرار نشد");
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (me && me !== "anonymous" && !hasRestoredRef.current) {
      hasRestoredRef.current = true;
      void restoreView();
    }
  }, [me, restoreView]);

  useEffect(() => {
    const onPopState = () => {
      if (me && me !== "anonymous") {
        void restoreView();
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [me, restoreView]);

  const logout = async () => {
    await http.post("/auth/logout");
    setCsrfToken(null);
    setMe("anonymous");
    hasRestoredRef.current = false;
    updateView({ name: "projects" }, true);
  };

  const project = view.name === "projects" ? null : view.project;

  const navigate = (id: Exclude<StudioNavId, "editor">) => {
    if (id === "projects") {
      updateView({ name: "projects" });
      return;
    }
    if (!project) return;
    if (id === "pages") updateView({ name: "pages", project });
    else if (id === "site-layout") updateView({ name: "site-layout", project });
    else if (id === "data-sources") updateView({ name: "data-sources", project });
    else updateView({ name: "components", project });
  };

  if (me === null || isRestoring) {
    return (
      <div className={ui.muted} style={{ padding: 32 }} data-theme={mode}>
        {isRestoring ? "در حال بازگردانی صفحهٔ جاری…" : "در حال بارگذاری…"}
        <div style={{ position: "fixed", insetInlineStart: 12, top: 12 }}><ThemeToggle mode={mode} onChange={setMode} /></div>
      </div>
    );
  }
  if (me === "anonymous") {
    return (
      <div data-theme={mode}>
        {bootError && <div className={ui.alert} style={{ margin: 16 }}>{bootError}</div>}
        <div style={{ position: "fixed", insetInlineStart: 12, top: 12, zIndex: 20 }}>
          <ThemeToggle mode={mode} onChange={setMode} />
        </div>
        <Login onLoggedIn={loadMe} />
      </div>
    );
  }

  return (
    <StudioShell
      mode={mode}
      onModeChange={setMode}
      userName={me.user.displayName}
      active={view.name}
      project={project}
      onNavigate={navigate}
      onLogout={() => void logout()}
      onOpenCredentials={() => setShowCredentialsModal(true)}
    >
      {view.name === "projects" && (
        <Projects canCreate={me.platformPermissions.includes("platform.create_project")} onOpen={(p) => updateView({ name: "pages", project: p })} />
      )}
      {view.name === "pages" && (
        <Pages project={view.project} onOpen={(page: PageSummary) => updateView({ name: "editor", project: view.project, page })} />
      )}
      {view.name === "data-sources" && (
        <DataSources project={view.project} />
      )}
      {view.name === "components" && (
        <ComponentStudio project={view.project} />
      )}
      {view.name === "site-layout" && (
        <SiteLayoutStudio project={view.project} appearanceMode={mode} onOpenPage={(page) => updateView({ name: "editor", project: view.project, page })} />
      )}

      {view.name === "editor" && (
        <Editor project={view.project} page={view.page} onBack={() => updateView({ name: "pages", project: view.project })} />
      )}

      {showCredentialsModal && (
        <UserCredentialsModal
          open={showCredentialsModal}
          onClose={() => setShowCredentialsModal(false)}
          me={me}
          onUserUpdated={() => {
            void loadMe();
          }}
        />
      )}
    </StudioShell>
  );
}
