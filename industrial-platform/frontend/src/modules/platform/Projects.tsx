import { useEffect, useState, type FormEvent } from "react";
import { ApiError, http } from "../../shared/api/http";
import type { Project } from "../../shared/api/types";
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
          {projects.map((p) => (
            <li key={p.id} className={`${ui.card} ${ui.row}`} style={{ justifyContent: "space-between" }}>
              <span>{p.name} <span className={ui.muted}>({p.slug})</span></span>
              <button className={`${ui.button} ${ui.iconButton}`} onClick={() => onOpen(p)}
                      title="ورود به پروژه" aria-label={`ورود به پروژهٔ ${p.name}`}>
                <EnterIcon />
              </button>
            </li>
          ))}
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
