import { useCallback, useEffect, useState } from "react";
import { ApiError, http, setCsrfToken } from "../../shared/api/http";
import type { Me, PageSummary, Project } from "../../shared/api/types";
import { useAppearancePreference } from "../../shared/appearance/useAppearancePreference";
import { Editor } from "../../modules/page-builder/Editor";
import { ComponentStudio } from "../../modules/platform/ComponentStudio";
import { DataSources } from "../../modules/platform/DataSources";
import { Login } from "../../modules/platform/Login";
import { Pages } from "../../modules/platform/Pages";
import { Projects } from "../../modules/platform/Projects";
import ui from "../../shared/ui/controls.module.css";
import { ThemeToggle } from "../../shared/ui/ThemeToggle";
import { StudioShell, type StudioNavId } from "./StudioShell";

type View =
  | { name: "projects" }
  | { name: "pages"; project: Project }
  | { name: "data-sources"; project: Project }
  | { name: "components"; project: Project }
  | { name: "editor"; project: Project; page: PageSummary };

export function StudioApp() {
  const [me, setMe] = useState<Me | null | "anonymous">(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ name: "projects" });
  const { mode, setMode } = useAppearancePreference("night");

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

  const logout = async () => {
    await http.post("/auth/logout");
    setCsrfToken(null);
    setMe("anonymous");
    setView({ name: "projects" });
  };

  const project = view.name === "projects" ? null : view.project;

  const navigate = (id: Exclude<StudioNavId, "editor">) => {
    if (id === "projects") {
      setView({ name: "projects" });
      return;
    }
    if (!project) return;
    if (id === "pages") setView({ name: "pages", project });
    else if (id === "data-sources") setView({ name: "data-sources", project });
    else setView({ name: "components", project });
  };

  if (me === null) {
    return (
      <div className={ui.muted} style={{ padding: 32 }} data-theme={mode}>
        در حال بارگذاری…
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
    >
      {view.name === "projects" && (
        <Projects canCreate={me.platformPermissions.includes("platform.create_project")} onOpen={(p) => setView({ name: "pages", project: p })} />
      )}
      {view.name === "pages" && (
        <Pages project={view.project} onOpen={(page) => setView({ name: "editor", project: view.project, page })} />
      )}
      {view.name === "data-sources" && (
        <DataSources project={view.project} />
      )}
      {view.name === "components" && (
        <ComponentStudio project={view.project} />
      )}
      {view.name === "editor" && (
        <Editor project={view.project} page={view.page} onBack={() => setView({ name: "pages", project: view.project })} />
      )}
    </StudioShell>
  );
}
