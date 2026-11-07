import { useEffect, useState } from "react";
import { http } from "../../shared/api/http";
import type { PublishedVersion, RevisionSummary } from "../../shared/api/types";
import { TestDataBadge } from "../../shared/ui/TestDataBadge";
import ui from "../../shared/ui/controls.module.css";
import styles from "./Editor.module.css";

interface Props {
  pageId: string;
  refreshKey: number;
  canRestore: boolean;
  onRestore: (revisionNo: number) => void;
  onActivate: (versionNo: number) => void;
}

export function VersionsPanel({ pageId, refreshKey, canRestore, onRestore, onActivate }: Props) {
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);
  const [published, setPublished] = useState<PublishedVersion[]>([]);

  useEffect(() => {
    void http.get<{ items: RevisionSummary[] }>(`/pages/${pageId}/revisions`).then(({ data }) => setRevisions(data.items));
    void http.get<{ items: PublishedVersion[] }>(`/pages/${pageId}/published-versions`).then(({ data }) => setPublished(data.items));
  }, [pageId, refreshKey]);

  return (
    <div className={styles.panel}>
      <div className={styles.panelTitle}>نسخه‌های منتشرشده</div>
      <ul className={ui.list}>
        {published.map((v) => (
          <li key={v.id} className={ui.row} style={{ justifyContent: "space-between" }}>
            <span>
              نسخهٔ {v.versionNo} <span className={ui.muted}>(از ویرایش {v.sourceRevisionNo}) {v.isLive ? "· در حال نمایش" : ""}</span>{" "}
              {v.containsTestData && <TestDataBadge />}
            </span>
            {!v.isLive && <button className={ui.button} onClick={() => onActivate(v.versionNo)}>فعال‌سازی</button>}
          </li>
        ))}
        {published.length === 0 && <li className={ui.muted}>هنوز منتشر نشده است.</li>}
      </ul>
      <div className={styles.panelTitle}>ویرایش‌ها</div>
      <ul className={ui.list}>
        {revisions.map((r) => (
          <li key={r.revisionNo} className={ui.row} style={{ justifyContent: "space-between" }}>
            <span>ویرایش {r.revisionNo} <span className={ui.muted}>{r.message ?? ""}{r.restoredFrom ? ` (بازگردانی از ${r.restoredFrom})` : ""}</span></span>
            {r.revisionNo !== revisions[0]?.revisionNo && (
              <button className={ui.button} disabled={!canRestore} onClick={() => onRestore(r.revisionNo)}>بازگردانی</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
