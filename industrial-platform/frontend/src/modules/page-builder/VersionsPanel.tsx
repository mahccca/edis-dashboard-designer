import { useEffect, useState } from "react";
import { http } from "../../shared/api/http";
import type { PublishedVersion, RevisionSummary } from "../../shared/api/types";
import { TestDataBadge } from "../../shared/ui/TestDataBadge";
import styles from "./Editor.module.css";

interface Props {
  pageId: string;
  refreshKey: number;
  canRestore: boolean;
  onRestore: (revisionNo: number) => void;
  onActivate: (versionNo: number) => void;
  onClose?: () => void;
  onPublishedCountChange?: (count: number) => void;
}

function ClockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ZapIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function RotateCcwIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return iso;
  }
}

export function VersionsPanel({
  pageId,
  refreshKey,
  canRestore,
  onRestore,
  onActivate,
  onClose,
  onPublishedCountChange,
}: Props) {
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);
  const [published, setPublished] = useState<PublishedVersion[]>([]);
  const [activeTab, setActiveTab] = useState<"published" | "revisions">("published");

  useEffect(() => {
    void http
      .get<{ items: RevisionSummary[] }>(`/pages/${pageId}/revisions`)
      .then(({ data }) => setRevisions(data.items))
      .catch(() => {});

    void http
      .get<{ items: PublishedVersion[] }>(`/pages/${pageId}/published-versions`)
      .then(({ data }) => {
        setPublished(data.items);
        onPublishedCountChange?.(data.items.length);
      })
      .catch(() => {});
  }, [pageId, refreshKey, onPublishedCountChange]);

  return (
    <div className={styles.historyDrawer} role="region" aria-label="تاریخچه نسخه‌ها و ویرایش‌ها">
      {/* Header */}
      <div className={styles.historyHeader}>
        <div className={styles.historyTitleGroup}>
          <div className={styles.historyTitle}>
            <ClockIcon />
            <span>تاریخچه و نسخه‌ها</span>
          </div>
          <div className={styles.historySubtitle}>
            مدیریت نسخه‌های منتشرشده و بازگردانی ویرایش‌های سند
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            className={styles.historyCloseBtn}
            onClick={onClose}
            title="بستن تاریخچه (Esc)"
            aria-label="بستن تاریخچه"
          >
            ✕
          </button>
        )}
      </div>

      {/* Segmented Pill Tabs */}
      <div className={styles.segmentedTabContainer}>
        <div className={styles.segmentedTabTrack} role="tablist">
          <button
            type="button"
            className={`${styles.segmentedTabBtn} ${activeTab === "published" ? styles.segmentedTabBtnActive : ""}`}
            onClick={() => setActiveTab("published")}
            role="tab"
            aria-selected={activeTab === "published"}
          >
            <span>نسخه‌های منتشرشده</span>
            <span className={styles.historyBadge}>{published.length}</span>
          </button>
          <button
            type="button"
            className={`${styles.segmentedTabBtn} ${activeTab === "revisions" ? styles.segmentedTabBtnActive : ""}`}
            onClick={() => setActiveTab("revisions")}
            role="tab"
            aria-selected={activeTab === "revisions"}
          >
            <span>ویرایش‌ها</span>
            <span className={styles.historyBadge}>{revisions.length}</span>
          </button>
        </div>
      </div>

      {/* Body content */}
      <div className={styles.historyBody}>
        {/* TAB 1: PUBLISHED VERSIONS */}
        {activeTab === "published" && (
          <div className={styles.historyTimeline}>
            {published.length === 0 ? (
              <div className={styles.historyEmptyState}>
                <div className={styles.historyEmptyIcon} aria-hidden="true">
                  <PackageIcon />
                </div>
                <div><strong>هنوز نسخه‌ای از این صفحه منتشر نشده است.</strong></div>
                <div>
                  پس از اعمال تغییرات، با کلیک روی دکمه «انتشار» در بالای صفحه می‌توانید نسخه زنده و قابل مشاهده در ران‌تایم بسازید.
                </div>
              </div>
            ) : (
              published.map((v) => (
                <div
                  key={v.id}
                  className={`${styles.historyCard} ${v.isLive ? styles.historyCardLive : ""}`}
                >
                  <div className={styles.historyCardHeader}>
                    <div className={styles.historyCardTitle}>
                      <span>نسخهٔ {v.versionNo}</span>
                      {v.containsTestData && <TestDataBadge />}
                    </div>
                    <span
                      className={`${styles.historyCardBadge} ${
                        v.isLive ? styles.historyCardBadgeLive : ""
                      }`}
                    >
                      {v.isLive ? "🟢 در حال نمایش زنده" : "آرشیو شده"}
                    </span>
                  </div>

                  <div className={styles.historyCardMeta}>
                    <div className={styles.historyCardMetaRow}>
                      <span>مبتنی بر ویرایش: <strong>{v.sourceRevisionNo}</strong></span>
                      <span>·</span>
                      <span>زمان انتشار: {formatDate(v.publishedAt)}</span>
                    </div>
                    {v.note && (
                      <div style={{ opacity: 0.85, marginTop: 4, fontStyle: "italic" }}>
                        یادداشت: {v.note}
                      </div>
                    )}
                  </div>

                  <div className={styles.historyCardActions}>
                    {v.isLive ? (
                      <span className={styles.historyLiveBadge}>
                        <CheckIcon />
                        <span>نسخهٔ فعال جاری سایت</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={styles.historyActionBtn}
                        onClick={() => onActivate(v.versionNo)}
                        title="فعال‌سازی این نسخه به عنوان نسخه اصلی سایت"
                      >
                        <ZapIcon />
                        <span>فعال‌سازی این نسخه</span>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 2: REVISIONS */}
        {activeTab === "revisions" && (
          <div className={styles.historyTimeline}>
            {!canRestore && (
              <div className={styles.historyWarningAlert}>
                ⚠️ <strong>تغییرات ذخیره‌نشده دارید:</strong> برای بازگردانی ویرایش‌های گذشته، لطفاً ابتدا تغییرات فعلی را ذخیره کنید یا دکمه Reset را بزنید.
              </div>
            )}

            {revisions.map((r, index) => {
              const isLatest = index === 0;
              return (
                <div key={r.revisionNo} className={styles.historyCard}>
                  <div className={styles.historyCardHeader}>
                    <div className={styles.historyCardTitle}>
                      <span>ویرایش {r.revisionNo}</span>
                      {r.autosave && (
                        <span className={styles.historyCardBadge}>ذخیره خودکار</span>
                      )}
                    </div>
                    <span className={styles.historyCardBadge}>
                      {isLatest ? "آخرین ویرایش" : "گذشته"}
                    </span>
                  </div>

                  <div className={styles.historyCardMeta}>
                    <div className={styles.historyCardMetaRow}>
                      <span>تاریخ ثبت: {formatDate(r.createdAt)}</span>
                      {r.restoredFrom && (
                        <span>· بازگردانی از ویرایش {r.restoredFrom}</span>
                      )}
                    </div>
                    {r.message && <div>توضیحات: {r.message}</div>}
                  </div>

                  <div className={styles.historyCardActions}>
                    {isLatest ? (
                      <span style={{ fontSize: "0.72rem", color: "var(--dp-ink-3)" }}>
                        ویرایش فعال در ویرایشگر
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={styles.historyActionBtn}
                        disabled={!canRestore}
                        onClick={() => onRestore(r.revisionNo)}
                        title={
                          canRestore
                            ? "بازگردانی محتوای صفحه به این ویرایش"
                            : "ابتدا تغییرات فعلی را ذخیره یا ریست کنید"
                        }
                      >
                        <RotateCcwIcon />
                        <span>بازگردانی به این ویرایش</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
