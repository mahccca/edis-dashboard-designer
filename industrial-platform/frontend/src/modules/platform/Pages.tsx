import { useEffect, useState, type FormEvent } from "react";
import { ApiError, http } from "../../shared/api/http";
import type { PageSummary, Project } from "../../shared/api/types";
import { localize } from "../../shared/i18n";
import ui from "../../shared/ui/controls.module.css";
import { TrashIcon } from "../../shared/ui/TrashIcon";

export function Pages({ project, onOpen }: {
  project: Project;
  onOpen: (p: PageSummary) => void;
}) {
  const [pages, setPages] = useState<PageSummary[] | null>(null);
  const [form, setForm] = useState({ titleFa: "", titleEn: "", slug: "", path: "/", kind: "page" });
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const reload = () => http.get<{ items: PageSummary[] }>(`/projects/${project.id}/pages`).then(({ data }) => setPages(data.items));
  useEffect(() => {
    void reload();
  }, [project.id]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const title: Record<string, string> = {};
    if (form.titleFa) title.fa = form.titleFa;
    if (form.titleEn) title.en = form.titleEn;
    try {
      await http.post(`/projects/${project.id}/pages`, { body: { kind: form.kind, title, slug: form.slug, path: form.path } });
      setForm({ titleFa: "", titleEn: "", slug: "", path: "/", kind: "page" });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.errors?.map((x) => `${x.pointer}: ${x.message}`).join("; ") || err.message) : "ساخت صفحه ناموفق بود");
    }
  };

  const remove = async (p: PageSummary) => {
    setDeleteError(null);
    try {
      await http.delete(`/pages/${p.id}`, { ifMatch: `"rev-${p.headRevision}"` });
      setConfirmId(null);
      await reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 412) {
        setDeleteError("این صفحه در این فاصله تغییر کرده است؛ فهرست به‌روز شد، دوباره تلاش کنید.");
        await reload();
      } else if (err instanceof ApiError && err.status === 403) {
        setDeleteError("اجازهٔ حذف این صفحه را ندارید.");
      } else {
        setDeleteError(err instanceof Error ? err.message : "حذف ناموفق بود");
      }
    }
  };

  return (
    <div className={ui.form} style={{ maxWidth: 760, margin: "32px auto" }}>
      <h2 style={{ margin: 0 }}>صفحات</h2>
      <p className={ui.muted} style={{ margin: 0 }}>صفحه بسازید، ویرایش کنید یا منتشر کنید. ابزارهای دیگر از نوار کناری در دسترس‌اند.</p>
      {pages === null ? <div className={ui.muted}>…</div> : (
        <ul className={ui.list}>
          {pages.map((p) => (
            <li key={p.id} className={`${ui.card} ${ui.row}`} style={{ justifyContent: "space-between" }}>
              <span>
                {localize(p.title, "fa")} <code>{p.path}</code>{" "}
                <span className={ui.muted}>ویرایش {p.headRevision} · {p.livePublishedVersionNo ? `نسخهٔ منتشرشده ${p.livePublishedVersionNo}` : "منتشرنشده"}
                  {p.hasUnpublishedChanges ? " · تغییرات منتشرنشده دارد" : ""}</span>
              </span>
              <span className={ui.row}>
                {p.livePublishedVersionNo && (
                  <a className={ui.button} href={`/runtime.html?site=${encodeURIComponent(project.slug)}&path=${encodeURIComponent(p.path)}`}
                     target="_blank" rel="noreferrer">نمایش ↗</a>
                )}
                <button className={`${ui.button} ${ui.primary}`} onClick={() => onOpen(p)}>ویرایش</button>
                {confirmId === p.id ? (
                  <span className={ui.row} role="group" aria-label="تأیید حذف">
                    <span className={ui.muted}>
                      {p.livePublishedVersionNo ? "صفحه از نمایش عمومی هم برداشته می‌شود. حذف شود؟" : "حذف شود؟"}
                    </span>
                    <button className={`${ui.button} ${ui.danger}`} onClick={() => void remove(p)}>بله، حذف شود</button>
                    <button className={ui.button} onClick={() => setConfirmId(null)}>انصراف</button>
                  </span>
                ) : (
                  <button className={`${ui.button} ${ui.iconButton} ${ui.dangerIcon}`}
                          onClick={() => { setDeleteError(null); setConfirmId(p.id); }}
                          title="حذف صفحه" aria-label={`حذف صفحهٔ ${localize(p.title, "fa")}`}>
                    <TrashIcon />
                  </button>
                )}
              </span>
            </li>
          ))}
          {pages.length === 0 && <li className={ui.muted}>هنوز صفحه‌ای ساخته نشده است.</li>}
        </ul>
      )}
      {deleteError && <div className={ui.alert} role="alert">{deleteError}</div>}
      <form className={`${ui.card} ${ui.form}`} onSubmit={create}>
        <strong>صفحهٔ جدید</strong>
        <div className={ui.row}>
          <input className={ui.input} placeholder="عنوان فارسی" value={form.titleFa} onChange={(e) => setForm({ ...form, titleFa: e.target.value })} />
          <input className={ui.input} placeholder="عنوان انگلیسی (اختیاری)" dir="ltr" value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} />
        </div>
        <div className={ui.row}>
          <input className={ui.input} placeholder="شناسه (slug)" dir="ltr" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required />
          <input className={ui.input} placeholder="آدرس (مثلاً ‎/plant/overview)" dir="ltr" value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value })} required />
          <select className={ui.select} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option value="page">صفحه</option>
            <option value="dashboard">داشبورد</option>
          </select>
        </div>
        {error && <div className={ui.alert}>{error}</div>}
        <button className={`${ui.button} ${ui.primary}`} disabled={!form.titleFa && !form.titleEn}>ساخت</button>
      </form>
    </div>
  );
}
