import { useEffect, useState, type FormEvent } from "react";
import { ApiError, http } from "../../shared/api/http";
import type { Project } from "../../shared/api/types";
import { getProjectDataMode } from "../../shared/site-layout";
import ui from "../../shared/ui/controls.module.css";
import { EnterIcon } from "../../shared/ui/EnterIcon";

export function Projects({ canCreate, onOpen }: { canCreate: boolean; onOpen: (p: Project) => void }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = () => http.get<{ items: Project[] }>("/projects").then(({ data }) => setProjects(data.items));
  useEffect(() => {
    void reload();
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await http.post("/projects", { body: { slug, name } });
      setSlug("");
      setName("");
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.errors?.map((x) => `${x.pointer} ${x.message}`).join("; ") || err.message) : "ساخت پروژه ناموفق بود");
    }
  };

  return (
    <div className={ui.form} style={{ maxWidth: 640, margin: "32px auto" }}>
      <h2 style={{ margin: 0 }}>پروژه‌ها</h2>
      {projects === null ? <div className={ui.muted}>…</div> : (
        <ul className={ui.list}>
          {projects.map((p) => {
            const pMode = getProjectDataMode(p.id, p.slug);
            return (
              <li key={p.id} className={`${ui.card} ${ui.row}`} style={{ justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <strong>{p.name}</strong>
                  <span className={ui.muted}>({p.slug})</span>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      padding: "2px 6px",
                      borderRadius: 6,
                      background:
                        pMode === "test"
                          ? "rgba(245, 165, 36, 0.15)"
                          : pMode === "live"
                          ? "rgba(16, 185, 129, 0.15)"
                          : "rgba(56, 189, 248, 0.12)",
                      color:
                        pMode === "test"
                          ? "#f5a524"
                          : pMode === "live"
                          ? "#34d399"
                          : "#38bdf8",
                      border: `1px solid ${
                        pMode === "test"
                          ? "rgba(245, 165, 36, 0.3)"
                          : pMode === "live"
                          ? "rgba(16, 185, 129, 0.3)"
                          : "rgba(56, 189, 248, 0.25)"
                      }`,
                      fontWeight: 600,
                    }}
                    title={
                      pMode === "test"
                        ? "داده‌های پروژه تستی / شبیه‌سازی است"
                        : pMode === "live"
                        ? "داده‌های پروژه واقعی و عملیاتی است"
                        : "وضعیت داده‌ها به طور خودکار تعیین می‌شود"
                    }
                  >
                    {pMode === "test" ? "🧪 داده‌های تستی" : pMode === "live" ? "🟢 داده‌های واقعی" : "⚡ داده‌ها: خودکار"}
                  </span>
                </span>
                <button className={`${ui.button} ${ui.iconButton}`} onClick={() => onOpen(p)}
                        title="ورود به پروژه" aria-label={`ورود به پروژهٔ ${p.name}`}>
                  <EnterIcon />
                </button>
              </li>
            );
          })}
          {projects.length === 0 && <li className={ui.muted}>هنوز پروژه‌ای ساخته نشده است.</li>}
        </ul>
      )}
      {canCreate && (
        <form className={`${ui.card} ${ui.form}`} onSubmit={create}>
          <strong>پروژهٔ جدید</strong>
          <input className={ui.input} placeholder="شناسه (مثلاً darkhoveyn-pilot)" value={slug} onChange={(e) => setSlug(e.target.value)} required />
          <input className={ui.input} placeholder="نام پروژه" value={name} onChange={(e) => setName(e.target.value)} required />
          {error && <div className={ui.alert}>{error}</div>}
          <button className={`${ui.button} ${ui.primary}`}>ساخت</button>
        </form>
      )}
    </div>
  );
}
