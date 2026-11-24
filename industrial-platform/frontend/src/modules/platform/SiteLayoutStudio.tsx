import { useEffect, useState, type CSSProperties } from "react";
import { http } from "../../shared/api/http";
import type { DocumentContent, PageSummary, Project } from "../../shared/api/types";
import { localize } from "../../shared/i18n";
import {
  loadSiteLayout,
  projectThemeToCssVars,
  saveSiteLayout,
  SiteFooter,
  SiteHeader,
  type FooterConfig,
  type HeaderConfig,
  type HeaderKpiWidget,
  type HeaderSectionId,
  type MenuItemConfig,
  type MenuPosition,
  type ProjectThemeConfig,
  type SiteLayoutConfig,
  type SiteLayoutDragKind,
  type SiteLayoutDropTarget,
  type ThemeTogglePlacement,
} from "../../shared/site-layout";
import type { AppearanceMode } from "../../shared/style-engine/parts";
import { testApiEndpoint } from "../../shared/site-layout/kpi-api";
import ui from "../../shared/ui/controls.module.css";
import { ThemeToggle } from "../../shared/ui/ThemeToggle";
import { TrashIcon } from "../../shared/ui/TrashIcon";
import styles from "./SiteLayoutStudio.module.css";

interface Props {
  project: Project;
  appearanceMode?: AppearanceMode;
  onOpenPage?: (page: PageSummary) => void;
}

type Tab = "header" | "menu" | "footer" | "theme" | "data-mode";


function textFa(text: unknown): string {
  if (!text) return "";
  if (typeof text === "string") return text;
  if (typeof text === "object" && text !== null && "fa" in text) {
    return String((text as Record<string, string>).fa ?? "");
  }
  return "";
}

const BRAND_PALETTES = [
  { name: "فیروزه‌ای صنعتی", hex: "#0ea5e9" },
  { name: "آبی نفتی پتروشیمی", hex: "#2563eb" },
  { name: "سبز انرژی و پایدار", hex: "#10b981" },
  { name: "کهربایی هشدار و توان", hex: "#f59e0b" },
  { name: "بنفش مانیتورینگ", hex: "#8b5cf6" },
  { name: "زرشکی اضطراری", hex: "#ef4444" },
];

const LOGO_ICONS = ["⚡", "🏭", "⚙", "🌊", "🛡", "🔬", "🚀", "💡", "🌐", "📊", "🔥", "💎"];

const HEADER_BLOCK_META: Record<HeaderSectionId, { label: string; icon: string; desc: string }> = {
  logo: { label: "لوگو و نام برند (Logo & Title)", icon: "⚡", desc: "نمایش نماد، نام پروژه و زیرعنوان" },
  menu: { label: "منوی ناوبری اصلی (Navigation Menu)", icon: "🧭", desc: "لینک‌ها و دکمه‌های هدایت صفحات" },
  kpis: { label: "شاخص‌های تله‌متری زنده (KPI Chips)", icon: "📊", desc: "پایش بلادرنگ توان، فشار، دما و وضعیت" },
  extra: { label: "نشانگر وضعیت / بج (Status Badge)", icon: "🔔", desc: "برچسب وضعیت سیستم (آنلاین/شیفت)" },
  themeToggle: { label: "دکمه تغییر تم روز/شب (Theme Toggle)", icon: "🌓", desc: "سوئیچ بین حالت تاریک و روشن" },
};

const PLACEMENT_OPTIONS: Array<{
  id: ThemeTogglePlacement;
  title: string;
  desc: string;
  icon: string;
}> = [
  {
    id: "header-left",
    title: "هدر - سمت چپ (پیشنهادی)",
    desc: "در نوار بالای سایت در سمت چپ، کنار نشانگر و آیتم‌های وضعیت",
    icon: "◧",
  },
  {
    id: "header-right",
    title: "هدر - سمت راست",
    desc: "در ابتدای نوار بالا، در کنار لوگو و نام برند صنعتی",
    icon: "◨",
  },
  {
    id: "header-menu",
    title: "داخل منوی ناوبری",
    desc: "به عنوان آخرین آیتم تعاملی در نوار منوی اصلی سایت",
    icon: "☰",
  },
  {
    id: "footer",
    title: "داخل فوتر سایت",
    desc: "در نوار پایین صفحه، در کنار کپی‌رایت و اطلاعات نسخه",
    icon: "☷",
  },
  {
    id: "floating-bottom-left",
    title: "شناور در پایین صفحه - چپ",
    desc: "دکمه گرد شناور و ثابت در گوشه سمت چپ پایین صفحه",
    icon: "↙",
  },
  {
    id: "floating-bottom-right",
    title: "شناور در پایین صفحه - راست",
    desc: "دکمه گرد شناور و ثابت در گوشه سمت راست پایین صفحه",
    icon: "↘",
  },
  {
    id: "hidden",
    title: "مخفی / غیرفعال",
    desc: "دکمه تغییر تم از ظاهر سایت حذف می‌شود",
    icon: "🚫",
  },
];

const DEFAULT_HEADER_ORDER: HeaderSectionId[] = ["logo", "menu", "kpis", "extra", "themeToggle"];

const TAB_SECTIONS: Record<Tab, string[]> = {
  header: ["hdr_order", "hdr_theme_toggle", "hdr_global", "hdr_logo", "hdr_badge", "hdr_kpi"],
  menu: ["menu_layout", "menu_items"],
  footer: ["ftr_global", "ftr_content", "ftr_links"],
  theme: ["thm_brand", "thm_default", "thm_radius", "thm_night", "thm_day", "thm_sync"],
  "data-mode": ["data_env"],
};

interface AccordionCardProps {
  id: string;
  title: React.ReactNode;
  badge?: React.ReactNode;
  badgeActive?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  headerTrailing?: React.ReactNode;
  style?: CSSProperties;
  children: React.ReactNode;
}

function AccordionCard({
  id: _id,
  title,
  badge,
  badgeActive,
  isOpen,
  onToggle,
  headerTrailing,
  style,
  children,
}: AccordionCardProps) {
  return (
    <div
      className={`${styles.accordionCard} ${isOpen ? styles.accordionCardOpen : ""}`}
      data-open={isOpen ? "true" : "false"}
      style={style}
    >
      <button
        type="button"
        className={`${styles.accordionHeader} ${isOpen ? styles.accordionHeaderOpen : ""}`}
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <div className={styles.accordionTitleGroup}>
          <span className={styles.accordionTitle}>{title}</span>
          {badge !== undefined && badge !== null && (
            <span
              className={`${styles.accordionBadge} ${
                badgeActive ? styles.accordionBadgeActive : styles.accordionBadgeInactive
              }`}
            >
              {badge}
            </span>
          )}
        </div>
        <div className={styles.accordionTrailing} onClick={(e) => e.stopPropagation()}>
          {headerTrailing}
          <span
            className={`${styles.accordionChevron} ${isOpen ? styles.accordionChevronOpen : ""}`}
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 6.5L8 10.5L12 6.5" />
            </svg>
          </span>
        </div>
      </button>

      {/* transitions.dev two-element panel (grid 0fr ↔ 1fr smooth height animation) */}
      <div className={styles.accordionPanel}>
        <div className={styles.accordionPanelInner}>
          <div className={styles.accordionBodyContent}>{children}</div>
        </div>
      </div>
    </div>
  );
}

export function SiteLayoutStudio({ project, appearanceMode = "night", onOpenPage }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("header");
  const [layout, setLayout] = useState<SiteLayoutConfig>(() => loadSiteLayout(project.id, project.name, project.slug));
  const [previewMode, setPreviewMode] = useState<AppearanceMode>(appearanceMode);
  const [previewPath, setPreviewPath] = useState<string>("/");
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [savedToast, setSavedToast] = useState(false);
  const [apiTestResults, setApiTestResults] = useState<Record<string, { loading?: boolean; result?: string; error?: string }>>({});

  // Accordion open/collapsed sections state
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    hdr_order: true,
    hdr_theme_toggle: true,
    hdr_global: true,
    hdr_logo: false,
    hdr_badge: false,
    hdr_kpi: false,
    menu_layout: true,
    menu_items: true,
    ftr_global: true,
    ftr_content: false,
    ftr_links: false,
    thm_brand: true,
    thm_default: true,
    thm_radius: false,
    thm_night: false,
    thm_day: false,
    thm_sync: true,
    data_env: true,
  });

  const toggleSection = (id: string, defaultOpen = true) => {
    setOpenSections((prev) => {
      const current = prev[id] !== undefined ? prev[id] : defaultOpen;
      return { ...prev, [id]: !current };
    });
  };

  const expandAllInTab = (tab: Tab) => {
    const ids = TAB_SECTIONS[tab] || [];
    setOpenSections((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        next[id] = true;
      });
      return next;
    });
  };

  const collapseAllInTab = (tab: Tab) => {
    const ids = TAB_SECTIONS[tab] || [];
    setOpenSections((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        next[id] = false;
      });
      return next;
    });
  };

  // Drag & drop state for header blocks, menu items, header KPIs, and footer links
  const [draggedHeaderBlock, setDraggedHeaderBlock] = useState<number | null>(null);
  const [dragOverHeaderBlock, setDragOverHeaderBlock] = useState<number | null>(null);

  const [draggedMenuItem, setDraggedMenuItem] = useState<number | null>(null);
  const [dragOverMenuItem, setDragOverMenuItem] = useState<number | null>(null);

  const [draggedKpi, setDraggedKpi] = useState<number | null>(null);
  const [dragOverKpi, setDragOverKpi] = useState<number | null>(null);

  const [draggedFooterLink, setDraggedFooterLink] = useState<number | null>(null);
  const [dragOverFooterLink, setDragOverFooterLink] = useState<number | null>(null);

  // Live Preview Canvas Drag & Drop State
  const [canvasDragActiveId, setCanvasDragActiveId] = useState<string | null>(null);
  const [canvasDragKind, setCanvasDragKind] = useState<SiteLayoutDragKind | null>(null);
  const [canvasDropTarget, setCanvasDropTarget] = useState<SiteLayoutDropTarget | null>(null);
  const [selectedCanvasId, setSelectedCanvasId] = useState<string | null>(null);
  const [dragOverThemePlacement, setDragOverThemePlacement] = useState<ThemeTogglePlacement | null>(null);
  const [themePlacementToast, setThemePlacementToast] = useState<string | null>(null);

  // Sync theme across all pages state
  const [syncingTheme, setSyncingTheme] = useState(false);
  const [syncResult, setSyncResult] = useState<{ text: string; error?: boolean } | null>(null);

  const handleSyncThemeToAllPages = async () => {
    setSyncingTheme(true);
    setSyncResult(null);
    try {
      saveSiteLayout(layout, project.slug);

      const pagesRes = await http.get<{ items: PageSummary[] }>(`/projects/${project.id}/pages`);
      const allPages = (pagesRes.data?.items && pagesRes.data.items.length > 0)
        ? pagesRes.data.items
        : pages;
      let updatedCount = 0;

      for (const p of allPages) {
        try {
          const pageRes = await http.get<{
            id: string;
            status: string;
            headRevision: number;
            document: DocumentContent;
          }>(`/pages/${p.id}`);

          const doc = pageRes.data?.document;
          if (!doc) {
            console.warn(`No document found for page ${p.id}`);
            continue;
          }

          const revNo = pageRes.data?.headRevision ?? p.headRevision ?? 1;
          const ifMatchTag = pageRes.etag
            ? (pageRes.etag.startsWith('"') || pageRes.etag.startsWith('W/"') ? pageRes.etag : `"${pageRes.etag}"`)
            : `"rev-${revNo}"`;

          const nextSettings = { ...(doc.settings ?? {}) };
          // Schema only allows "day" or "night". If system/auto, remove colorScheme so page inherits project theme!
          if (layout.theme.defaultAppearance === "day" || layout.theme.defaultAppearance === "night") {
            nextSettings.colorScheme = layout.theme.defaultAppearance;
          } else {
            delete nextSettings.colorScheme;
          }
          nextSettings.direction = (nextSettings.direction as string) ?? "rtl";

          const updatedDoc: DocumentContent = {
            ...doc,
            settings: nextSettings,
          };

          const saveRes = await http.put<{ revisionNo: number }>(`/pages/${p.id}/document`, {
            body: { content: updatedDoc },
            ifMatch: ifMatchTag,
          });

          updatedCount++;

          // If page was published, republish to regenerate live runtime bundle
          if (p.status === "published" || pageRes.data?.status === "published") {
            try {
              await http.post(`/pages/${p.id}/publish`, {
                body: { revisionNo: saveRes.data.revisionNo },
              });
            } catch {
              /* document update is still saved */
            }
          }
        } catch (err) {
          console.warn(`Failed to sync theme for page ${p.id}:`, err);
        }
      }

      // Sync appearance mode preference in localStorage
      if (layout.theme.defaultAppearance === "day" || layout.theme.defaultAppearance === "night") {
        try {
          localStorage.setItem(`ip.appearanceMode.${project.slug}`, layout.theme.defaultAppearance);
          localStorage.setItem(`ip.appearanceMode.${project.id}`, layout.theme.defaultAppearance);
          localStorage.setItem("ip.appearanceMode", layout.theme.defaultAppearance);
        } catch {
          /* ignore */
        }
      }

      window.dispatchEvent(new CustomEvent("ip-site-layout-change", { detail: { projectId: project.id } }));
      window.dispatchEvent(new Event("storage"));

      setSyncResult({
        text: `✓ قالب و تم پروژه با موفقیت روی تمامی ${updatedCount} برگه اعمال و ذخیره شد.`,
      });
      setThemePlacementToast(`✓ قالب و تم با موفقیت روی تمام ${updatedCount} صفحه همگام‌سازی شد.`);
      setTimeout(() => setThemePlacementToast(null), 5000);
      setTimeout(() => setSyncResult(null), 6000);
    } catch {
      setSyncResult({
        text: "خطا در ارتباط با سرور برای همگام‌سازی برگه‌ها.",
        error: true,
      });
    } finally {
      setSyncingTheme(false);
    }
  };

  const currentPageSummary = pages.find((p) => p.path === previewPath);

  const handleCanvasSelect = (id: string, kind: SiteLayoutDragKind) => {
    setSelectedCanvasId(id);
    if (kind === "headerBlock") {
      if (id === "slot:menu") {
        setActiveTab("menu");
      } else {
        setActiveTab("header");
      }
    } else if (kind === "menuItem") {
      setActiveTab("menu");
    } else if (kind === "kpi" || kind === "themeToggle") {
      setActiveTab("header");
    } else if (kind === "footerLink") {
      setActiveTab("footer");
    }
  };

  const handleCanvasDragStart = (id: string, kind: SiteLayoutDragKind) => {
    setCanvasDragActiveId(id);
    setCanvasDragKind(kind);
    setCanvasDropTarget(null);
  };

  const handleCanvasDragOver = (
    id: string,
    kind: SiteLayoutDragKind,
    placement: "before" | "after",
  ) => {
    void kind;
    if (id === canvasDragActiveId) return;
    setCanvasDropTarget({ targetId: id, placement });
  };

  const handleCanvasDragLeave = (id: string) => {
    if (canvasDropTarget?.targetId === id) {
      setCanvasDropTarget(null);
    }
  };

  const handleCanvasDrop = (targetId: string, placement: "before" | "after") => {
    if (!canvasDragActiveId || canvasDragActiveId === targetId) {
      setCanvasDragActiveId(null);
      setCanvasDragKind(null);
      setCanvasDropTarget(null);
      return;
    }

    // 1. Header Slot Drop
    if (canvasDragActiveId.startsWith("slot:") && targetId.startsWith("slot:")) {
      const fromSlot = canvasDragActiveId.replace("slot:", "") as HeaderSectionId;
      const toSlot = targetId.replace("slot:", "") as HeaderSectionId;
      const fromIdx = currentHeaderOrder.indexOf(fromSlot);
      const toIdx = currentHeaderOrder.indexOf(toSlot);
      if (fromIdx !== -1 && toIdx !== -1) {
        const newOrder = [...currentHeaderOrder];
        const [moved] = newOrder.splice(fromIdx, 1);
        if (moved) {
          const newToIdx = newOrder.indexOf(toSlot);
          const insertIdx = placement === "after" ? newToIdx + 1 : newToIdx;
          newOrder.splice(insertIdx, 0, moved);
          updateHeader({ headerOrder: newOrder });
        }
      }
    }
    // 2. Menu Item Drop
    else if (canvasDragActiveId.startsWith("menu:") && targetId.startsWith("menu:")) {
      const fromId = canvasDragActiveId.replace("menu:", "");
      const toId = targetId.replace("menu:", "");
      const items = [...layout.header.menu.items];
      const fromIdx = items.findIndex((it) => it.id === fromId);
      const toIdx = items.findIndex((it) => it.id === toId);
      if (fromIdx !== -1 && toIdx !== -1) {
        const [moved] = items.splice(fromIdx, 1);
        if (moved) {
          const newToIdx = items.findIndex((it) => it.id === toId);
          const insertIdx = placement === "after" ? newToIdx + 1 : newToIdx;
          items.splice(insertIdx, 0, moved);
          setLayout((prev) => ({
            ...prev,
            header: { ...prev.header, menu: { ...prev.header.menu, items } },
          }));
        }
      }
    }
    // 3. KPI Chip Drop
    else if (canvasDragActiveId.startsWith("kpi:") && targetId.startsWith("kpi:")) {
      const fromId = canvasDragActiveId.replace("kpi:", "");
      const toId = targetId.replace("kpi:", "");
      const kpis = [...(layout.header.kpiWidgets ?? [])];
      const fromIdx = kpis.findIndex((k) => k.id === fromId);
      const toIdx = kpis.findIndex((k) => k.id === toId);
      if (fromIdx !== -1 && toIdx !== -1) {
        const [moved] = kpis.splice(fromIdx, 1);
        if (moved) {
          const newToIdx = kpis.findIndex((k) => k.id === toId);
          const insertIdx = placement === "after" ? newToIdx + 1 : newToIdx;
          kpis.splice(insertIdx, 0, moved);
          setLayout((prev) => ({
            ...prev,
            header: { ...prev.header, kpiWidgets: kpis },
          }));
        }
      }
    }
    // 4. Footer Link Drop
    else if (canvasDragActiveId.startsWith("footerLink:") && targetId.startsWith("footerLink:")) {
      const fromId = canvasDragActiveId.replace("footerLink:", "");
      const toId = targetId.replace("footerLink:", "");
      const links = [...(layout.footer.links ?? [])];
      const fromIdx = links.findIndex((l) => l.id === fromId);
      const toIdx = links.findIndex((l) => l.id === toId);
      if (fromIdx !== -1 && toIdx !== -1) {
        const [moved] = links.splice(fromIdx, 1);
        if (moved) {
          const newToIdx = links.findIndex((l) => l.id === toId);
          const insertIdx = placement === "after" ? newToIdx + 1 : newToIdx;
          links.splice(insertIdx, 0, moved);
          setLayout((prev) => ({
            ...prev,
            footer: { ...prev.footer, links },
          }));
        }
      }
    }

    setCanvasDragActiveId(null);
    setCanvasDragKind(null);
    setCanvasDropTarget(null);
  };

  const handleCanvasDragEnd = () => {
    setCanvasDragActiveId(null);
    setCanvasDragKind(null);
    setCanvasDropTarget(null);
    setDragOverThemePlacement(null);
  };

  const handleDropThemePlacement = (placement: ThemeTogglePlacement) => {
    updateHeader({ themeTogglePlacement: placement });
    updateFooter({ themeTogglePlacement: placement });
    setLayout((prev) => ({ ...prev, themeTogglePlacement: placement }));
    setCanvasDragActiveId(null);
    setCanvasDragKind(null);
    setCanvasDropTarget(null);
    setDragOverThemePlacement(null);
    const opt = PLACEMENT_OPTIONS.find((p) => p.id === placement);
    setThemePlacementToast(`موقعیت دکمه تم به «${opt?.title ?? placement}» منتقل شد.`);
    setTimeout(() => setThemePlacementToast(null), 3000);
  };

  const handleTestKpiApi = async (kpi: HeaderKpiWidget) => {
    if (!kpi.apiUrl) return;
    setApiTestResults((prev) => ({ ...prev, [kpi.id]: { loading: true } }));
    const res = await testApiEndpoint(kpi.apiUrl, kpi.apiMethod || "GET", kpi.apiJsonPath);
    if (res.success) {
      setApiTestResults((prev) => ({
        ...prev,
        [kpi.id]: {
          loading: false,
          result: `موفق! مقدار دریافت‌شده: ${res.formatted ?? "—"}`,
        },
      }));
      if (res.formatted) {
        updateHeaderKpi(kpi.id, { value: res.formatted });
      }
    } else {
      setApiTestResults((prev) => ({
        ...prev,
        [kpi.id]: {
          loading: false,
          error: res.error || "خطا در برقراری ارتباط با API",
        },
      }));
    }
  };

  // Fetch project pages for quick dropdown selection
  useEffect(() => {
    http.get<{ items: PageSummary[] }>(`/projects/${project.id}/pages`)
      .then((res) => setPages(res.data.items))
      .catch(() => setPages([]));
  }, [project.id]);

  const updateHeader = (patch: Partial<HeaderConfig>) => {
    setLayout((prev) => ({ ...prev, header: { ...prev.header, ...patch } }));
  };

  const updateFooter = (patch: Partial<FooterConfig>) => {
    setLayout((prev) => ({ ...prev, footer: { ...prev.footer, ...patch } }));
  };

  const updateTheme = (patch: Partial<ProjectThemeConfig>) => {
    setLayout((prev) => ({ ...prev, theme: { ...prev.theme, ...patch } }));
  };

  const handleSave = () => {
    saveSiteLayout(layout, project.slug);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 3000);
  };

  // Menu items helpers
  const addMenuItem = () => {
    const newItem: MenuItemConfig = {
      id: `menu-${Date.now()}`,
      label: { fa: "آیتم جدید", en: "New Item" },
      icon: "📌",
      link: pages[0]?.path ?? "/",
      target: "_self",
      isButton: false,
    };
    setLayout((prev) => ({
      ...prev,
      header: {
        ...prev.header,
        menu: {
          ...prev.header.menu,
          items: [...prev.header.menu.items, newItem],
        },
      },
    }));
  };

  const updateMenuItem = (id: string, patch: Partial<MenuItemConfig>) => {
    setLayout((prev) => ({
      ...prev,
      header: {
        ...prev.header,
        menu: {
          ...prev.header.menu,
          items: prev.header.menu.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
        },
      },
    }));
  };

  const removeMenuItem = (id: string) => {
    setLayout((prev) => ({
      ...prev,
      header: {
        ...prev.header,
        menu: {
          ...prev.header.menu,
          items: prev.header.menu.items.filter((it) => it.id !== id),
        },
      },
    }));
  };

  const currentHeaderOrder: HeaderSectionId[] =
    layout.header.headerOrder && layout.header.headerOrder.length > 0
      ? layout.header.headerOrder
      : DEFAULT_HEADER_ORDER;

  const reorderHeaderBlock = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const newOrder = [...currentHeaderOrder];
    const [moved] = newOrder.splice(fromIndex, 1);
    if (!moved) return;
    newOrder.splice(toIndex, 0, moved);
    updateHeader({ headerOrder: newOrder });
  };

  const moveHeaderBlock = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= currentHeaderOrder.length) return;
    reorderHeaderBlock(index, target);
  };

  const reorderMenuItem = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const items = [...layout.header.menu.items];
    const [moved] = items.splice(fromIndex, 1);
    if (!moved) return;
    items.splice(toIndex, 0, moved);
    setLayout((prev) => ({
      ...prev,
      header: { ...prev.header, menu: { ...prev.header.menu, items } },
    }));
  };

  const moveMenuItem = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= layout.header.menu.items.length) return;
    reorderMenuItem(index, target);
  };

  // Header KPI telemetry widgets helpers
  const addHeaderKpi = () => {
    const newKpi: HeaderKpiWidget = {
      id: `kpi-${Date.now()}`,
      label: { fa: "شاخص جدید", en: "New KPI" },
      value: "100",
      unit: "kW",
      status: "good",
      icon: "⚡",
    };
    setLayout((prev) => ({
      ...prev,
      header: {
        ...prev.header,
        kpiWidgets: [...(prev.header.kpiWidgets ?? []), newKpi],
      },
    }));
  };

  const updateHeaderKpi = (id: string, patch: Partial<HeaderKpiWidget>) => {
    setLayout((prev) => ({
      ...prev,
      header: {
        ...prev.header,
        kpiWidgets: (prev.header.kpiWidgets ?? []).map((k) => (k.id === id ? { ...k, ...patch } : k)),
      },
    }));
  };

  const removeHeaderKpi = (id: string) => {
    setLayout((prev) => ({
      ...prev,
      header: {
        ...prev.header,
        kpiWidgets: (prev.header.kpiWidgets ?? []).filter((k) => k.id !== id),
      },
    }));
  };

  const reorderHeaderKpi = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const items = [...(layout.header.kpiWidgets ?? [])];
    const [moved] = items.splice(fromIndex, 1);
    if (!moved) return;
    items.splice(toIndex, 0, moved);
    setLayout((prev) => ({
      ...prev,
      header: { ...prev.header, kpiWidgets: items },
    }));
  };

  const moveHeaderKpi = (index: number, delta: -1 | 1) => {
    const items = layout.header.kpiWidgets ?? [];
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    reorderHeaderKpi(index, target);
  };

  // Footer links helpers
  const addFooterLink = () => {
    const newLink: MenuItemConfig = {
      id: `flink-${Date.now()}`,
      label: { fa: "لینک جدید", en: "New Link" },
      link: pages[0]?.path ?? "/",
      target: "_self",
    };
    setLayout((prev) => ({
      ...prev,
      footer: {
        ...prev.footer,
        links: [...(prev.footer.links ?? []), newLink],
      },
    }));
  };

  const updateFooterLink = (id: string, patch: Partial<MenuItemConfig>) => {
    setLayout((prev) => ({
      ...prev,
      footer: {
        ...prev.footer,
        links: (prev.footer.links ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)),
      },
    }));
  };

  const removeFooterLink = (id: string) => {
    setLayout((prev) => ({
      ...prev,
      footer: {
        ...prev.footer,
        links: (prev.footer.links ?? []).filter((l) => l.id !== id),
      },
    }));
  };

  const reorderFooterLink = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const links = [...(layout.footer.links ?? [])];
    const [moved] = links.splice(fromIndex, 1);
    if (!moved) return;
    links.splice(toIndex, 0, moved);
    setLayout((prev) => ({
      ...prev,
      footer: { ...prev.footer, links },
    }));
  };

  const moveFooterLink = (index: number, delta: -1 | 1) => {
    const links = layout.footer.links ?? [];
    const target = index + delta;
    if (target < 0 || target >= links.length) return;
    reorderFooterLink(index, target);
  };

  const themeVars = projectThemeToCssVars(layout.theme, previewMode);

  return (
    <div className={styles.studio} dir="rtl">
      {/* Top action toolbar */}
      <div className={styles.topBar}>
        <div className={styles.projectInfo}>
          <span style={{ fontSize: "1.2rem" }}>🎨</span>
          <strong className={styles.projectTitle}>ادیتور جامع قالب، هدر و منوی سایت</strong>
          <span className={styles.projectSlug}>{project.slug}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            className={ui.button}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
              borderColor: "#38bdf8",
              color: "#fff",
              fontWeight: 600,
              boxShadow: "0 2px 8px rgba(14, 165, 233, 0.25)",
            }}
            disabled={syncingTheme}
            onClick={handleSyncThemeToAllPages}
            title="اعمال و همگام‌سازی تم و رنگ‌های پروژه روی تمامی صفحات موجود"
          >
            {syncingTheme ? "⏳ در حال همگام‌سازی…" : "🔄 همگام‌سازی تم در تمام صفحات"}
          </button>
          <button type="button" className={`${ui.button} ${ui.primary}`} onClick={handleSave}>
            💾 ذخیره تنظیمات قالب
          </button>
        </div>
      </div>

      <div className={styles.mainContent}>
        {/* Left: Configuration form with tabs */}
        <div className={styles.editorPanel}>
          <div className={styles.tabsBar} role="tablist">
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === "header" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("header")}
            >
              <span>▣</span> هدر و لوگو
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === "menu" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("menu")}
            >
              <span>☰</span> منو و ناوبری
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === "footer" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("footer")}
            >
              <span>☷</span> فوتر سایت
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === "theme" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("theme")}
            >
              <span>🎨</span> تم پروژه
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === "data-mode" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("data-mode")}
            >
              <span>🧪</span> محیط داده‌ها
            </button>
          </div>

          <div className={styles.tabContent}>
            {/* TAB 1: HEADER & LOGO */}
            {activeTab === "header" && (
              <>
                <div className={styles.accordionToggleRow}>
                  <button
                    type="button"
                    className={styles.accordionToggleAllBtn}
                    onClick={() => expandAllInTab("header")}
                  >
                    ➕ باز کردن همه
                  </button>
                  <button
                    type="button"
                    className={styles.accordionToggleAllBtn}
                    onClick={() => collapseAllInTab("header")}
                  >
                    ➖ بستن همه
                  </button>
                </div>

                <AccordionCard
                  id="hdr_order"
                  title="🔀 چیدمان و ترتیب المان‌های هدر (Drag & Drop Reorder)"
                  badge={`${currentHeaderOrder.length} المان`}
                  badgeActive={true}
                  isOpen={Boolean(openSections.hdr_order)}
                  onToggle={() => toggleSection("hdr_order", true)}
                >
                  <div className={ui.hint} style={{ margin: "2px 0 8px 0" }}>
                    برای تغییر ترتیب افقی قرارگیری المان‌ها در نوار هدر، کارت‌ها را با ماوس بکشید و جابجا کنید (Drag & Drop) یا از دکمه‌های ↑ و ↓ استفاده فرمایید.
                  </div>
                  <div className={styles.headerBlockList}>
                    {currentHeaderOrder.map((blockId, index) => {
                      const meta = HEADER_BLOCK_META[blockId];
                      const isDragging = draggedHeaderBlock === index;
                      const isDragOver = dragOverHeaderBlock === index;

                      let isActive = true;
                      let statusText = "فعال";
                      if (blockId === "logo") {
                        isActive = Boolean(layout.header.logo.enabled);
                        statusText = isActive ? "لوگو فعال" : "غیرفعال";
                      } else if (blockId === "menu") {
                        isActive = Boolean(layout.header.menu.enabled);
                        statusText = isActive ? "منو فعال" : "غیرفعال";
                      } else if (blockId === "kpis") {
                        const count = layout.header.kpiWidgets?.length ?? 0;
                        isActive = count > 0;
                        statusText = count > 0 ? `${count} شاخص` : "بدون شاخص";
                      } else if (blockId === "extra") {
                        isActive = Boolean(layout.header.extraText.enabled);
                        statusText = isActive ? "نشانگر فعال" : "غیرفعال";
                      } else if (blockId === "themeToggle") {
                        const plc = layout.header.themeTogglePlacement || "header-left";
                        isActive = plc.startsWith("header");
                        statusText =
                          plc === "hidden"
                            ? "مخفی"
                            : plc === "footer"
                            ? "در فوتر"
                            : plc.startsWith("floating")
                            ? "شناور"
                            : "در هدر";
                      }

                      return (
                        <div
                          key={blockId}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", String(index));
                            setDraggedHeaderBlock(index);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            if (dragOverHeaderBlock !== index) setDragOverHeaderBlock(index);
                          }}
                          onDragLeave={() => {
                            if (dragOverHeaderBlock === index) setDragOverHeaderBlock(null);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (draggedHeaderBlock !== null && draggedHeaderBlock !== index) {
                              reorderHeaderBlock(draggedHeaderBlock, index);
                            }
                            setDraggedHeaderBlock(null);
                            setDragOverHeaderBlock(null);
                          }}
                          onDragEnd={() => {
                            setDraggedHeaderBlock(null);
                            setDragOverHeaderBlock(null);
                          }}
                          className={`${styles.headerBlockCard} ${isDragging ? styles.itemCardDragging : ""} ${
                            isDragOver ? styles.itemCardDragOver : ""
                          }`}
                        >
                          <div className={styles.headerBlockInfo}>
                            <span className={styles.dragHandle} title="برای جابجایی بکشید">
                              ⠿
                            </span>
                            <span className={styles.headerBlockIcon}>{meta.icon}</span>
                            <div>
                              <div className={styles.headerBlockTitle}>{meta.label}</div>
                              <div className={styles.headerBlockDesc}>{meta.desc}</div>
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span
                              className={`${styles.statusPill} ${
                                isActive ? styles.statusPillActive : styles.statusPillMuted
                              }`}
                            >
                              {statusText}
                            </span>
                            <div className={styles.itemCardActions}>
                              <button
                                type="button"
                                className={ui.button}
                                disabled={index === 0}
                                onClick={() => moveHeaderBlock(index, -1)}
                                title="انتقال به بالا (راست‌تر در هدر)"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className={ui.button}
                                disabled={index === currentHeaderOrder.length - 1}
                                onClick={() => moveHeaderBlock(index, 1)}
                                title="انتقال به پایین (چپ‌تر در هدر)"
                              >
                                ↓
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </AccordionCard>

                <AccordionCard
                  id="hdr_theme_toggle"
                  title="🌓 موقعیت دکمه تغییر تم روز و شب (Theme Toggle Placement)"
                  badge={
                    PLACEMENT_OPTIONS.find(
                      (p) => p.id === (layout.header.themeTogglePlacement || "header-left")
                    )?.title ?? "هدر"
                  }
                  badgeActive={true}
                  isOpen={Boolean(openSections.hdr_theme_toggle)}
                  onToggle={() => toggleSection("hdr_theme_toggle", true)}
                >
                  <div className={ui.hint} style={{ margin: "2px 0 8px 0" }}>
                    موقعیت دکمه سوئیچ بین حالت تیره (Night) و روشن (Day) را در ساختار سایت مشخص کنید:
                  </div>
                  <div className={styles.placementGrid}>
                    {PLACEMENT_OPTIONS.map((opt) => {
                      const currentPlacement = layout.header.themeTogglePlacement || "header-left";
                      const isSelected = currentPlacement === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          className={`${styles.placementCard} ${isSelected ? styles.placementCardActive : ""}`}
                          onClick={() => {
                            updateHeader({ themeTogglePlacement: opt.id });
                            setLayout((prev) => ({ ...prev, themeTogglePlacement: opt.id }));
                          }}
                        >
                          <div className={styles.placementCardTop}>
                            <span className={styles.placementCardTitle}>
                              <span>{opt.icon}</span> {opt.title}
                            </span>
                            {isSelected && (
                              <span style={{ color: "#38bdf8", fontWeight: 700, fontSize: "0.9rem" }}>✓</span>
                            )}
                          </div>
                          <span className={styles.placementCardDesc}>{opt.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </AccordionCard>

                <AccordionCard
                  id="hdr_global"
                  title="📌 هدر کلی سایت (Global Site Header)"
                  badge={layout.header.enabled ? "روشن" : "خاموش"}
                  badgeActive={layout.header.enabled}
                  isOpen={Boolean(openSections.hdr_global)}
                  onToggle={() => toggleSection("hdr_global", true)}
                >
                  <label className={styles.toggleLabel}>
                    <input
                      type="checkbox"
                      checked={layout.header.enabled}
                      onChange={(e) => updateHeader({ enabled: e.target.checked })}
                    />
                    نمایش هدر سایت
                  </label>
                  <label className={styles.toggleLabel}>
                    <input
                      type="checkbox"
                      checked={layout.header.sticky}
                      onChange={(e) => updateHeader({ sticky: e.target.checked })}
                    />
                    هدر چسبنده در بالای صفحه (Sticky Header)
                  </label>
                  <label className={styles.toggleLabel}>
                    <input
                      type="checkbox"
                      checked={layout.header.blur}
                      onChange={(e) => updateHeader({ blur: e.target.checked })}
                    />
                    پس‌زمینه مات شیشه‌ای (Glassmorphism Blur)
                  </label>

                  <label className={styles.toggleLabel}>
                    <input
                      type="checkbox"
                      checked={layout.header.shareMainPageHeader !== false}
                      onChange={(e) => updateHeader({ shareMainPageHeader: e.target.checked })}
                    />
                    اشتراک‌گذاری هدر برگه اصلی در تمام صفحات پروژه (Share Across All Pages)
                  </label>
                  <div className={ui.hint} style={{ margin: "2px 0 10px 0" }}>
                    با فعال بودن این گزینه، هدر ثابت طراحی‌شده در برگه اصلی (شامل لوگو، دکمه‌های ناوبری و KPIها) به صورت مشترک و بدون رندر مجدد روی تمام صفحات دیگر پروژه نمایش داده می‌شود.
                  </div>

                  <div className={ui.field} style={{ marginTop: 14 }}>
                    <span className={ui.label}>منبع و اولویت هدر سایت (Site Header Source):</span>
                    <select
                      className={ui.select}
                      value={layout.header.source || "auto"}
                      onChange={(e) => updateHeader({ source: e.target.value as "auto" | "standard" | "page-builder" })}
                    >
                      <option value="auto">هوشمند / خودکار (Auto) — اولویت با هدر طراحی‌شده در صفحه‌ساز</option>
                      <option value="standard">همیشه هدر استاندارد سایت (Standard Header)</option>
                      <option value="page-builder">هدر طراحی‌شده در صفحه‌ساز (Page Builder Header)</option>
                    </select>
                    <div className={ui.hint} style={{ marginTop: 4 }}>
                      در حالت «هوشمند»، اگر در صفحه‌ساز برای یک سکشن گزینه «هدر سایت» یا «هدر ثابت» انتخاب شده باشد، همان سکشن به عنوان هدر فیکس در بالای سایت قرار می‌گیرد و با هدر استاندارد تداخل نخواهد داشت.
                    </div>
                  </div>

                  <div className={ui.field} style={{ marginTop: 14 }}>
                    <span className={ui.label}>تراکم و ارتفاع نوار هدر (Header Density):</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[
                        { id: "compact", label: "فشرده (46px)" },
                        { id: "normal", label: "استاندارد (58px)" },
                        { id: "spacious", label: "جادار (72px)" },
                      ].map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          className={`${ui.button} ${(layout.header.density || "normal") === d.id ? ui.primary : ""}`}
                          style={{ flex: 1, fontSize: "0.78rem" }}
                          onClick={() => updateHeader({ density: d.id as any })}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={ui.field}>
                    <span className={ui.label}>فرمت چیدمان چیپ‌های تله‌متری (KPI Layout):</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[
                        { id: "inline", label: "خطی افقی (Inline)" },
                        { id: "stacked", label: "پشته‌ای (Stacked)" },
                        { id: "card", label: "کارتی (Card)" },
                      ].map((k) => (
                        <button
                          key={k.id}
                          type="button"
                          className={`${ui.button} ${(layout.header.kpiLayout || "inline") === k.id ? ui.primary : ""}`}
                          style={{ flex: 1, fontSize: "0.78rem" }}
                          onClick={() => updateHeader({ kpiLayout: k.id as any })}
                        >
                          {k.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </AccordionCard>

                <AccordionCard
                  id="hdr_logo"
                  title="⚡ تنظیمات لوگو و برند (Logo & Branding)"
                  badge={layout.header.logo.enabled ? "لوگو فعال" : "غیرفعال"}
                  badgeActive={layout.header.logo.enabled}
                  isOpen={Boolean(openSections.hdr_logo)}
                  onToggle={() => toggleSection("hdr_logo", false)}
                >
                  <label className={styles.toggleLabel}>
                    <input
                      type="checkbox"
                      checked={layout.header.logo.enabled}
                      onChange={(e) => updateHeader({ logo: { ...layout.header.logo, enabled: e.target.checked } })}
                    />
                    نمایش لوگو در هدر
                  </label>

                  {layout.header.logo.enabled && (
                    <>
                      <div className={ui.field}>
                        <span className={ui.label}>آیکون پیش‌فرض لوگو:</span>
                        <div className={styles.iconPickGrid}>
                          {LOGO_ICONS.map((ico) => (
                            <button
                              key={ico}
                              type="button"
                              className={`${styles.iconBtn} ${layout.header.logo.icon === ico ? styles.iconBtnActive : ""}`}
                              onClick={() => updateHeader({ logo: { ...layout.header.logo, icon: ico, imageUrl: "" } })}
                            >
                              {ico}
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className={ui.field}>
                        <span className={ui.label}>یا آدرس تصویر لوگو (URL):</span>
                        <input
                          className={ui.input}
                          dir="ltr"
                          placeholder="مثلاً https://.../logo.png"
                          value={layout.header.logo.imageUrl ?? ""}
                          onChange={(e) => updateHeader({ logo: { ...layout.header.logo, imageUrl: e.target.value } })}
                        />
                      </label>

                      <label className={ui.field}>
                        <span className={ui.label}>عنوان برند / پروژه:</span>
                        <input
                          className={ui.input}
                          value={textFa(layout.header.logo.title)}
                          placeholder="مثلاً پلتفرم صنعتی فولاد"
                          onChange={(e) => updateHeader({
                            logo: {
                              ...layout.header.logo,
                              title: { fa: e.target.value, en: e.target.value },
                            },
                          })}
                        />
                      </label>

                      <label className={ui.field}>
                        <span className={ui.label}>زیرعنوان / شعار:</span>
                        <input
                          className={ui.input}
                          value={textFa(layout.header.logo.subtitle)}
                          placeholder="سامانه تله‌متری و مانیتورینگ"
                          onChange={(e) => updateHeader({
                            logo: {
                              ...layout.header.logo,
                              subtitle: { fa: e.target.value, en: e.target.value },
                            },
                          })}
                        />
                      </label>

                      <label className={ui.field}>
                        <span className={ui.label}>اندازه لوگو:</span>
                        <select
                          className={ui.select}
                          value={layout.header.logo.size}
                          onChange={(e) => updateHeader({
                            logo: { ...layout.header.logo, size: e.target.value as "sm" | "md" | "lg" },
                          })}
                        >
                          <option value="sm">کوچک (۳۲px)</option>
                          <option value="md">متوسط (۴۰px)</option>
                          <option value="lg">بزرگ (۴۸px)</option>
                        </select>
                      </label>

                      {/* Logo Sub-Layout & Arrangement */}
                      <div className={ui.field}>
                        <span className={ui.label}>چیدمان و جهت لوگو نسبت به متن (Logo Layout):</span>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
                          {[
                            { id: "row", label: "⬌ افقی (آیکون راست، متن چپ)" },
                            { id: "column", label: "⬍ عمودی (آیکون بالا، متن زیر)" },
                            { id: "row-reverse", label: "⮂ معکوس (متن راست، آیکون چپ)" },
                            { id: "column-reverse", label: "⮃ معکوس (متن بالا، آیکون زیر)" },
                          ].map((l) => (
                            <button
                              key={l.id}
                              type="button"
                              className={`${ui.button} ${(layout.header.logo.layout || "row") === l.id ? ui.primary : ""}`}
                              style={{ fontSize: "0.76rem", padding: "6px 8px" }}
                              onClick={() => updateHeader({
                                logo: { ...layout.header.logo, layout: l.id as any },
                              })}
                            >
                              {l.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className={ui.field}>
                        <span className={ui.label}>تراز متن و آیکون (Alignment):</span>
                        <div style={{ display: "flex", gap: 6 }}>
                          {[
                            { id: "start", label: "راست / شروع" },
                            { id: "center", label: "وسط‌چین" },
                            { id: "end", label: "چپ / پایان" },
                          ].map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              className={`${ui.button} ${(layout.header.logo.align || "center") === a.id ? ui.primary : ""}`}
                              style={{ flex: 1, fontSize: "0.78rem" }}
                              onClick={() => updateHeader({
                                logo: { ...layout.header.logo, align: a.id as any },
                              })}
                            >
                              {a.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className={ui.field}>
                        <span className={ui.label}>فاصله بین آیکون و متن (Gap):</span>
                        <div style={{ display: "flex", gap: 6 }}>
                          {[
                            { id: "sm", label: "کم (6px)" },
                            { id: "md", label: "متوسط (12px)" },
                            { id: "lg", label: "زیاد (18px)" },
                          ].map((g) => (
                            <button
                              key={g.id}
                              type="button"
                              className={`${ui.button} ${(layout.header.logo.gap || "md") === g.id ? ui.primary : ""}`}
                              style={{ flex: 1, fontSize: "0.78rem" }}
                              onClick={() => updateHeader({
                                logo: { ...layout.header.logo, gap: g.id as any },
                              })}
                            >
                              {g.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className={styles.toggleLabel}>
                        <input
                          type="checkbox"
                          checked={layout.header.logo.showSubtitle !== false}
                          onChange={(e) => updateHeader({
                            logo: { ...layout.header.logo, showSubtitle: e.target.checked },
                          })}
                        />
                        نمایش زیرعنوان و شعار برند در لوگو
                      </label>
                    </>
                  )}
                </AccordionCard>

                <AccordionCard
                  id="hdr_badge"
                  title="🔔 نشانگر یا متن اختصاصی هدر (Status Badge)"
                  badge={layout.header.extraText.enabled ? "بج فعال" : "غیرفعال"}
                  badgeActive={layout.header.extraText.enabled}
                  isOpen={Boolean(openSections.hdr_badge)}
                  onToggle={() => toggleSection("hdr_badge", false)}
                >
                  <label className={styles.toggleLabel}>
                    <input
                      type="checkbox"
                      checked={layout.header.extraText.enabled}
                      onChange={(e) => updateHeader({
                        extraText: { ...layout.header.extraText, enabled: e.target.checked },
                      })}
                    />
                    نمایش نشانگر / بج در هدر
                  </label>

                  {layout.header.extraText.enabled && (
                    <>
                      <label className={ui.field}>
                        <span className={ui.label}>متن نشانگر:</span>
                        <input
                          className={ui.input}
                          value={textFa(layout.header.extraText.text)}
                          onChange={(e) => updateHeader({
                            extraText: {
                              ...layout.header.extraText,
                              text: { fa: e.target.value, en: e.target.value },
                            },
                          })}
                        />
                      </label>
                      <label className={ui.field}>
                        <span className={ui.label}>رنگ نشانگر:</span>
                        <select
                          className={ui.select}
                          value={layout.header.extraText.badgeStyle}
                          onChange={(e) => updateHeader({
                            extraText: {
                              ...layout.header.extraText,
                              badgeStyle: e.target.value as "none" | "info" | "success" | "warning",
                            },
                          })}
                        >
                          <option value="success">سبز آنلاین (Success)</option>
                          <option value="info">آبی اطلاع‌رسانی (Info)</option>
                          <option value="warning">زرد هشداری (Warning)</option>
                        </select>
                      </label>
                    </>
                  )}
                </AccordionCard>

                {/* KPI Widgets & Telemetry in Header */}
                <AccordionCard
                  id="hdr_kpi"
                  title="📊 ویجت‌ها و شاخص‌های اختصاصی هدر (Header KPI Widgets)"
                  badge={`${layout.header.kpiWidgets?.length ?? 0} شاخص`}
                  badgeActive={(layout.header.kpiWidgets?.length ?? 0) > 0}
                  headerTrailing={
                    <button
                      type="button"
                      className={`${ui.button} ${ui.primary}`}
                      onClick={addHeaderKpi}
                      style={{ fontSize: "0.78rem", padding: "4px 10px" }}
                    >
                      + افزودن شاخص KPI
                    </button>
                  }
                  isOpen={Boolean(openSections.hdr_kpi)}
                  onToggle={() => toggleSection("hdr_kpi", false)}
                >
                  <p className={ui.hint} style={{ margin: "2px 0 12px 0" }}>
                    می‌توانید المان‌های مانیتورینگ زنده (مثل توان مصرفی، فشار، دما و وضعیت سیستم) را مستقیماً در نوار هدر قرار دهید.
                  </p>

                  {(!layout.header.kpiWidgets || layout.header.kpiWidgets.length === 0) && (
                    <div className={ui.hint} style={{ textAlign: "center", padding: "12px", background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                      هنوز هیچ شاخصی در هدر تعریف نشده است. روی «+ افزودن شاخص KPI» کلیک کنید.
                    </div>
                  )}

                  <div className={styles.itemList}>
                    {(layout.header.kpiWidgets ?? []).map((kpi, index) => {
                      const isDragging = draggedKpi === index;
                      const isDragOver = dragOverKpi === index;
                      return (
                        <div
                          key={kpi.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", String(index));
                            setDraggedKpi(index);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            if (dragOverKpi !== index) setDragOverKpi(index);
                          }}
                          onDragLeave={() => {
                            if (dragOverKpi === index) setDragOverKpi(null);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (draggedKpi !== null && draggedKpi !== index) {
                              reorderHeaderKpi(draggedKpi, index);
                            }
                            setDraggedKpi(null);
                            setDragOverKpi(null);
                          }}
                          onDragEnd={() => {
                            setDraggedKpi(null);
                            setDragOverKpi(null);
                          }}
                          className={`${styles.itemCard} ${isDragging ? styles.itemCardDragging : ""} ${
                            isDragOver ? styles.itemCardDragOver : ""
                          }`}
                        >
                          <div className={styles.itemCardHeader}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span className={styles.dragHandle} title="برای جابجایی بکشید">
                                ⠿
                              </span>
                              <span style={{ fontSize: "1.1rem" }}>{kpi.icon || "📊"}</span>
                              <strong>{textFa(kpi.label)}</strong>
                              <span style={{ opacity: 0.7, fontSize: "0.85rem" }}>
                                ({kpi.value} {kpi.unit ?? ""})
                              </span>
                            </div>
                            <div className={styles.itemCardActions}>
                              <button
                                type="button"
                                className={ui.button}
                                disabled={index === 0}
                                onClick={() => moveHeaderKpi(index, -1)}
                                title="انتقال به بالا"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className={ui.button}
                                disabled={index === (layout.header.kpiWidgets?.length ?? 0) - 1}
                                onClick={() => moveHeaderKpi(index, 1)}
                                title="انتقال به پایین"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                className={`${ui.button} ${ui.iconButton} ${ui.dangerIcon}`}
                                onClick={() => removeHeaderKpi(kpi.id)}
                                title="حذف شاخص"
                              >
                                <TrashIcon size={14} />
                              </button>
                            </div>
                          </div>

                        <div className={styles.itemCardBody}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <label className={ui.field}>
                              <span className={ui.label}>عنوان شاخص:</span>
                              <input
                                className={ui.input}
                                value={textFa(kpi.label)}
                                placeholder="مثلاً توان خط ۱"
                                onChange={(e) => updateHeaderKpi(kpi.id, { label: { fa: e.target.value, en: e.target.value } })}
                              />
                            </label>
                            <label className={ui.field}>
                              <span className={ui.label}>آیکون:</span>
                              <input
                                className={ui.input}
                                value={kpi.icon ?? ""}
                                placeholder="⚡, 📈, ⏱, 🏭, 🌡, 🔋"
                                onChange={(e) => updateHeaderKpi(kpi.id, { icon: e.target.value })}
                              />
                            </label>
                          </div>

                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                            <label className={ui.field}>
                              <span className={ui.label}>مقدار نمایشی:</span>
                              <input
                                className={ui.input}
                                value={kpi.value}
                                dir="ltr"
                                placeholder="312.4"
                                onChange={(e) => updateHeaderKpi(kpi.id, { value: e.target.value })}
                              />
                            </label>
                            <label className={ui.field}>
                              <span className={ui.label}>واحد اندازه‌گیری:</span>
                              <input
                                className={ui.input}
                                value={kpi.unit ?? ""}
                                dir="ltr"
                                placeholder="kW, Bar, °C"
                                onChange={(e) => updateHeaderKpi(kpi.id, { unit: e.target.value })}
                              />
                            </label>
                            <label className={ui.field}>
                              <span className={ui.label}>وضعیت رنگی:</span>
                              <select
                                className={ui.select}
                                value={kpi.status ?? "good"}
                                onChange={(e) => updateHeaderKpi(kpi.id, { status: e.target.value as "good" | "warn" | "crit" })}
                              >
                                <option value="good">🟢 سبز (نرمال / پایدار)</option>
                                <option value="warn">🟡 زرد (هشدار / مراقبت)</option>
                                <option value="crit">🔴 قرمز (بحرانی / اضطراری)</option>
                              </select>
                            </label>
                          </div>

                          {/* Connection to Live API or Data Binding */}
                          <div style={{
                            marginTop: 10,
                            padding: "10px 12px",
                            background: "rgba(255, 255, 255, 0.03)",
                            borderRadius: 6,
                            border: "1px solid rgba(255, 255, 255, 0.07)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#38bdf8" }}>
                                🔗 اتصال داده زنده (Live API / Data Binding)
                              </span>
                              <select
                                className={ui.select}
                                style={{ width: "auto", fontSize: "0.8rem", padding: "3px 8px" }}
                                value={kpi.dataSourceType || "static"}
                                onChange={(e) => updateHeaderKpi(kpi.id, { dataSourceType: e.target.value as "static" | "api" | "binding" })}
                              >
                                <option value="static">مقدار دستی (Static)</option>
                                <option value="api">اتصال به API زنده (REST API)</option>
                                <option value="binding">بایندینگ پلتفرم (Live Binding)</option>
                              </select>
                            </div>

                            {kpi.dataSourceType === "api" && (
                              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 8 }}>
                                  <label className={ui.field}>
                                    <span className={ui.label}>روش:</span>
                                    <select
                                      className={ui.select}
                                      value={kpi.apiMethod || "GET"}
                                      onChange={(e) => updateHeaderKpi(kpi.id, { apiMethod: e.target.value as "GET" | "POST" })}
                                    >
                                      <option value="GET">GET</option>
                                      <option value="POST">POST</option>
                                    </select>
                                  </label>
                                  <label className={ui.field}>
                                    <span className={ui.label}>آدرس API (URL یا Path):</span>
                                    <input
                                      className={ui.input}
                                      dir="ltr"
                                      value={kpi.apiUrl ?? ""}
                                      placeholder="/api/v1/telemetry/power یا https://..."
                                      onChange={(e) => updateHeaderKpi(kpi.id, { apiUrl: e.target.value })}
                                    />
                                  </label>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 8 }}>
                                  <label className={ui.field}>
                                    <span className={ui.label}>مسیر JSON (JSONPath):</span>
                                    <input
                                      className={ui.input}
                                      dir="ltr"
                                      value={kpi.apiJsonPath ?? ""}
                                      placeholder="مثلاً: $.value یا data.active_kw"
                                      onChange={(e) => updateHeaderKpi(kpi.id, { apiJsonPath: e.target.value })}
                                    />
                                  </label>
                                  <label className={ui.field}>
                                    <span className={ui.label}>بروزرسانی (ثانیه):</span>
                                    <input
                                      className={ui.input}
                                      type="number"
                                      min={1}
                                      max={3600}
                                      dir="ltr"
                                      value={kpi.apiRefreshSeconds ?? 5}
                                      onChange={(e) => updateHeaderKpi(kpi.id, { apiRefreshSeconds: Number(e.target.value) || 5 })}
                                    />
                                  </label>
                                </div>

                                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                                  <button
                                    type="button"
                                    className={`${ui.button} ${ui.secondary}`}
                                    style={{ fontSize: "0.8rem", padding: "4px 12px" }}
                                    onClick={() => void handleTestKpiApi(kpi)}
                                    disabled={!kpi.apiUrl || apiTestResults[kpi.id]?.loading}
                                  >
                                    {apiTestResults[kpi.id]?.loading ? "در حال فراخوانی…" : "⚡ تست زنده اتصال API"}
                                  </button>
                                  {apiTestResults[kpi.id]?.result && (
                                    <span style={{ fontSize: "0.8rem", color: "#10b981", fontWeight: 500 }}>
                                      {apiTestResults[kpi.id]?.result}
                                    </span>
                                  )}
                                  {apiTestResults[kpi.id]?.error && (
                                    <span style={{ fontSize: "0.8rem", color: "#ef4444", fontWeight: 500 }}>
                                      {apiTestResults[kpi.id]?.error}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}

                            {kpi.dataSourceType === "binding" && (
                              <label className={ui.field} style={{ marginTop: 4 }}>
                                <span className={ui.label}>شناسه بایندینگ زنده (Binding ID):</span>
                                <input
                                  className={ui.input}
                                  dir="ltr"
                                  value={kpi.bindingId ?? ""}
                                  placeholder="مثلاً: power_signal یا temp_tank"
                                  onChange={(e) => updateHeaderKpi(kpi.id, { bindingId: e.target.value })}
                                />
                                <div className={ui.hint} style={{ marginTop: 4 }}>
                                  مقدار این شاخص به صورت بلادرنگ از سوکت داده‌های پلتفرم استخراج می‌شود.
                                </div>
                              </label>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </AccordionCard>
              </>
            )}

            {/* TAB 2: MENU & NAVIGATION */}
            {activeTab === "menu" && (
              <>
                <div className={styles.accordionToggleRow}>
                  <button
                    type="button"
                    className={styles.accordionToggleAllBtn}
                    onClick={() => expandAllInTab("menu")}
                  >
                    ➕ باز کردن همه
                  </button>
                  <button
                    type="button"
                    className={styles.accordionToggleAllBtn}
                    onClick={() => collapseAllInTab("menu")}
                  >
                    ➖ بستن همه
                  </button>
                </div>

                <AccordionCard
                  id="menu_layout"
                  title="🧭 موقعیت و حالت نمایش منو"
                  badge={
                    layout.header.menu.position === "left"
                      ? "سمت چپ"
                      : layout.header.menu.position === "right"
                      ? "سمت راست"
                      : "نوار پایین"
                  }
                  badgeActive={true}
                  isOpen={Boolean(openSections.menu_layout)}
                  onToggle={() => toggleSection("menu_layout", true)}
                >
                  <label className={ui.field}>
                    <span className={ui.label}>موقعیت و چینش منو در صفحه:</span>
                    <select
                      className={ui.select}
                      value={layout.header.menu.position}
                      onChange={(e) => updateHeader({
                        menu: { ...layout.header.menu, position: e.target.value as MenuPosition },
                      })}
                    >
                      <option value="left">سمت چپ هدر (متداول و خوانا)</option>
                      <option value="right">سمت راست در کنار لوگو</option>
                      <option value="bottom">پایین هدر (نوار مجزا Sub-Bar)</option>
                    </select>
                  </label>

                  <label className={styles.toggleLabel}>
                    <input
                      type="checkbox"
                      checked={layout.header.menu.hamburger}
                      onChange={(e) => updateHeader({
                        menu: { ...layout.header.menu, hamburger: e.target.checked },
                      })}
                    />
                    حالت منوی همبرگری (Hamburger Slide Drawer)
                  </label>

                  {layout.header.menu.hamburger && (
                    <label className={ui.field}>
                      <span className={ui.label}>جهت باز شدن دراور همبرگری:</span>
                      <select
                        className={ui.select}
                        value={layout.header.menu.hamburgerSide}
                        onChange={(e) => updateHeader({
                          menu: { ...layout.header.menu, hamburgerSide: e.target.value as "right" | "left" },
                        })}
                      >
                        <option value="right">باز شدن از سمت راست</option>
                        <option value="left">باز شدن از سمت چپ</option>
                      </select>
                    </label>
                  )}

                  {/* Menu items layout & spacing */}
                  <div className={ui.field}>
                    <span className={ui.label}>جهت و فرمت قرارگیری آیکون و متن در آیتم‌ها:</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[
                        { id: "row", label: "⬌ افقی (کنار هم)" },
                        { id: "column", label: "⬍ عمودی (آیکون بالا)" },
                        { id: "row-reverse", label: "⮂ معکوس" },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className={`${ui.button} ${(layout.header.menu.itemLayout || "row") === m.id ? ui.primary : ""}`}
                          style={{ flex: 1, fontSize: "0.78rem" }}
                          onClick={() => updateHeader({
                            menu: { ...layout.header.menu, itemLayout: m.id as any },
                          })}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={ui.field}>
                    <span className={ui.label}>فاصله بین آیتم‌های منو (Spacing):</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[
                        { id: "sm", label: "کم (4px)" },
                        { id: "md", label: "متوسط (8px)" },
                        { id: "lg", label: "زیاد (14px)" },
                      ].map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          className={`${ui.button} ${(layout.header.menu.gap || "md") === g.id ? ui.primary : ""}`}
                          style={{ flex: 1, fontSize: "0.78rem" }}
                          onClick={() => updateHeader({
                            menu: { ...layout.header.menu, gap: g.id as any },
                          })}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className={styles.toggleLabel}>
                    <input
                      type="checkbox"
                      checked={layout.header.menu.showIcons !== false}
                      onChange={(e) => updateHeader({
                        menu: { ...layout.header.menu, showIcons: e.target.checked },
                      })}
                    />
                    نمایش نماد و آیکون در آیتم‌های منو
                  </label>
                </AccordionCard>

                <AccordionCard
                  id="menu_items"
                  title="📋 آیتم‌های منو و لینک‌ها"
                  badge={`${layout.header.menu.items.length} آیتم`}
                  badgeActive={layout.header.menu.items.length > 0}
                  headerTrailing={
                    <button
                      type="button"
                      className={`${ui.button} ${ui.primary}`}
                      onClick={addMenuItem}
                      style={{ fontSize: "0.78rem", padding: "4px 10px" }}
                    >
                      + افزودن آیتم
                    </button>
                  }
                  isOpen={Boolean(openSections.menu_items)}
                  onToggle={() => toggleSection("menu_items", true)}
                >
                  <div className={styles.itemList}>
                    {layout.header.menu.items.map((item, index) => {
                      const isDragging = draggedMenuItem === index;
                      const isDragOver = dragOverMenuItem === index;
                      return (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", String(index));
                            setDraggedMenuItem(index);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            if (dragOverMenuItem !== index) setDragOverMenuItem(index);
                          }}
                          onDragLeave={() => {
                            if (dragOverMenuItem === index) setDragOverMenuItem(null);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (draggedMenuItem !== null && draggedMenuItem !== index) {
                              reorderMenuItem(draggedMenuItem, index);
                            }
                            setDraggedMenuItem(null);
                            setDragOverMenuItem(null);
                          }}
                          onDragEnd={() => {
                            setDraggedMenuItem(null);
                            setDragOverMenuItem(null);
                          }}
                          className={`${styles.itemCard} ${isDragging ? styles.itemCardDragging : ""} ${
                            isDragOver ? styles.itemCardDragOver : ""
                          }`}
                        >
                          <div className={styles.itemCardHeader}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span className={styles.dragHandle} title="برای جابجایی بکشید">
                                ⠿
                              </span>
                              <span>{item.icon || "•"}</span>
                              <strong>{localize(item.label, "fa")}</strong>
                              {item.isButton && <span className={ui.hint}>(دکمه)</span>}
                            </div>
                            <div className={styles.itemCardActions}>
                              <button
                                type="button"
                                className={ui.button}
                                disabled={index === 0}
                                onClick={() => moveMenuItem(index, -1)}
                                title="انتقال به بالا"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className={ui.button}
                                disabled={index === layout.header.menu.items.length - 1}
                                onClick={() => moveMenuItem(index, 1)}
                                title="انتقال به پایین"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                className={`${ui.button} ${ui.dangerIcon}`}
                                onClick={() => removeMenuItem(item.id)}
                                title="حذف آیتم"
                              >
                                <TrashIcon size={13} />
                              </button>
                            </div>
                          </div>

                        <div className={styles.row}>
                          <input
                            className={ui.input}
                            style={{ width: 60, textAlign: "center" }}
                            value={item.icon ?? ""}
                            placeholder="آیکون"
                            onChange={(e) => updateMenuItem(item.id, { icon: e.target.value })}
                          />
                          <input
                            className={ui.input}
                            style={{ flex: 1 }}
                            value={textFa(item.label)}
                            placeholder="عنوان آیتم منو"
                            onChange={(e) => updateMenuItem(item.id, { label: { fa: e.target.value, en: e.target.value } })}
                          />
                        </div>

                        <div className={ui.field}>
                          <span className={ui.label}>لینک به صفحه پروژه یا آدرس وب:</span>
                          {pages.length > 0 && (
                            <select
                              className={ui.select}
                              style={{ marginBottom: 4 }}
                              value={pages.some((p) => p.path === item.link) ? item.link : ""}
                              onChange={(e) => {
                                if (e.target.value) updateMenuItem(item.id, { link: e.target.value });
                              }}
                            >
                              <option value="">-- انتخاب از صفحات این پروژه --</option>
                              {pages.map((p) => (
                                <option key={p.id} value={p.path}>
                                  {localize(p.title, "fa")} ({p.path})
                                </option>
                              ))}
                            </select>
                          )}
                          <input
                            className={ui.input}
                            dir="ltr"
                            placeholder="/monitoring یا https://..."
                            value={item.link}
                            onChange={(e) => updateMenuItem(item.id, { link: e.target.value })}
                          />
                        </div>

                        <div className={styles.row} style={{ justifyContent: "space-between" }}>
                          <label className={styles.toggleLabel} style={{ fontSize: "0.78rem" }}>
                            <input
                              type="checkbox"
                              checked={Boolean(item.isButton)}
                              onChange={(e) => updateMenuItem(item.id, { isButton: e.target.checked })}
                            />
                            طرح دکمه شاخص
                          </label>

                          <select
                            className={ui.select}
                            style={{ width: 140, fontSize: "0.75rem" }}
                            value={item.target ?? "_self"}
                            onChange={(e) => updateMenuItem(item.id, { target: e.target.value as "_self" | "_blank" })}
                          >
                            <option value="_self">در همین صفحه</option>
                            <option value="_blank">در تب جدید (_blank)</option>
                          </select>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </AccordionCard>
              </>
            )}

            {/* TAB 3: FOOTER */}
            {activeTab === "footer" && (
              <>
                <div className={styles.accordionToggleRow}>
                  <button
                    type="button"
                    className={styles.accordionToggleAllBtn}
                    onClick={() => expandAllInTab("footer")}
                  >
                    ➕ باز کردن همه
                  </button>
                  <button
                    type="button"
                    className={styles.accordionToggleAllBtn}
                    onClick={() => collapseAllInTab("footer")}
                  >
                    ➖ بستن همه
                  </button>
                </div>

                <AccordionCard
                  id="ftr_global"
                  title="☷ فوتر سایت (Global Footer)"
                  badge={layout.footer.enabled ? "روشن" : "خاموش"}
                  badgeActive={layout.footer.enabled}
                  isOpen={Boolean(openSections.ftr_global)}
                  onToggle={() => toggleSection("ftr_global", true)}
                >
                  <label className={styles.toggleLabel}>
                    <input
                      type="checkbox"
                      checked={layout.footer.enabled}
                      onChange={(e) => updateFooter({ enabled: e.target.checked })}
                    />
                    نمایش فوتر در پایین سایت
                  </label>

                  <label className={styles.toggleLabel}>
                    <input
                      type="checkbox"
                      checked={layout.footer.sticky}
                      onChange={(e) => updateFooter({ sticky: e.target.checked })}
                    />
                    فوتر چسبنده در پایین پنجره (Sticky Footer)
                  </label>
                  <span className={ui.hint}>
                    در صورت فعال‌سازی، فوتر در پایین پنجره ثابت می‌ماند و محتوای صفحه در بالای آن اسکرول می‌شود.
                  </span>

                  {/* Footer Columns & Links Layout */}
                  <div className={ui.field} style={{ marginTop: 14 }}>
                    <span className={ui.label}>ساختار ستون‌های فوتر (Columns Layout):</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[
                        { id: "3-col", label: "۳ ستونه کلاسیک" },
                        { id: "2-col", label: "۲ ستونه گسترده" },
                        { id: "stacked", label: "پشته‌ای تک‌ستونه" },
                      ].map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={`${ui.button} ${(layout.footer.columnsLayout || "3-col") === c.id ? ui.primary : ""}`}
                          style={{ flex: 1, fontSize: "0.78rem" }}
                          onClick={() => updateFooter({ columnsLayout: c.id as any })}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={ui.field}>
                    <span className={ui.label}>نحوه چیدمان پیوندهای دسترسی سریع (Links Layout):</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[
                        { id: "column", label: "لیست عمودی" },
                        { id: "row", label: "افقی ردیفی" },
                        { id: "grid", label: "شبکه ۲ ستونه" },
                      ].map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          className={`${ui.button} ${(layout.footer.linksLayout || "column") === l.id ? ui.primary : ""}`}
                          style={{ flex: 1, fontSize: "0.78rem" }}
                          onClick={() => updateFooter({ linksLayout: l.id as any })}
                        >
                          {l.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </AccordionCard>

                <AccordionCard
                  id="ftr_content"
                  title="📝 محتوا و متن‌های فوتر"
                  badge={layout.footer.showStatusIndicator ? "وضعیت سرویس فعال" : "محتوا"}
                  badgeActive={layout.footer.showStatusIndicator}
                  isOpen={Boolean(openSections.ftr_content)}
                  onToggle={() => toggleSection("ftr_content", false)}
                >
                  <label className={ui.field}>
                    <span className={ui.label}>متن کپی‌رایت:</span>
                    <input
                      className={ui.input}
                      value={textFa(layout.footer.copyright)}
                      onChange={(e) => updateFooter({
                        copyright: { fa: e.target.value, en: e.target.value },
                      })}
                    />
                  </label>

                  <label className={ui.field}>
                    <span className={ui.label}>شرح درباره سیستم (ستون اول):</span>
                    <textarea
                      className={ui.textarea}
                      rows={3}
                      value={textFa(layout.footer.aboutText)}
                      onChange={(e) => updateFooter({
                        aboutText: { fa: e.target.value, en: e.target.value },
                      })}
                    />
                  </label>

                  <label className={styles.toggleLabel}>
                    <input
                      type="checkbox"
                      checked={layout.footer.showStatusIndicator}
                      onChange={(e) => updateFooter({ showStatusIndicator: e.target.checked })}
                    />
                    نمایش نشانگر وضعیت سرویس در فوتر
                  </label>

                  {layout.footer.showStatusIndicator && (
                    <label className={ui.field}>
                      <span className={ui.label}>متن وضعیت سرویس:</span>
                      <input
                        className={ui.input}
                        value={textFa(layout.footer.statusText)}
                        onChange={(e) => updateFooter({
                          statusText: { fa: e.target.value, en: e.target.value },
                        })}
                      />
                    </label>
                  )}
                </AccordionCard>

                <AccordionCard
                  id="ftr_links"
                  title="🔗 لینک‌های دسترسی سریع فوتر (Footer Quick Links)"
                  badge={`${layout.footer.links.length} لینک`}
                  badgeActive={layout.footer.links.length > 0}
                  headerTrailing={
                    <button
                      type="button"
                      className={`${ui.button} ${ui.primary}`}
                      onClick={addFooterLink}
                      style={{ fontSize: "0.78rem", padding: "4px 10px" }}
                    >
                      + افزودن لینک فوتر
                    </button>
                  }
                  isOpen={Boolean(openSections.ftr_links)}
                  onToggle={() => toggleSection("ftr_links", false)}
                >
                  <div className={ui.hint} style={{ margin: "2px 0 8px 0" }}>
                    لینک‌های مفید در پایین سایت را مرتب کرده و با ماوس بکشید تا ترتیبشان جابجا شود (Drag & Drop).
                  </div>

                  {(!layout.footer.links || layout.footer.links.length === 0) && (
                    <div className={ui.hint} style={{ textAlign: "center", padding: "12px", background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                      هنوز هیچ لینکی در فوتر ثبت نشده است. روی «+ افزودن لینک فوتر» کلیک کنید.
                    </div>
                  )}

                  <div className={styles.itemList}>
                    {(layout.footer.links ?? []).map((link, index) => {
                      const isDragging = draggedFooterLink === index;
                      const isDragOver = dragOverFooterLink === index;
                      return (
                        <div
                          key={link.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", String(index));
                            setDraggedFooterLink(index);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            if (dragOverFooterLink !== index) setDragOverFooterLink(index);
                          }}
                          onDragLeave={() => {
                            if (dragOverFooterLink === index) setDragOverFooterLink(null);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (draggedFooterLink !== null && draggedFooterLink !== index) {
                              reorderFooterLink(draggedFooterLink, index);
                            }
                            setDraggedFooterLink(null);
                            setDragOverFooterLink(null);
                          }}
                          onDragEnd={() => {
                            setDraggedFooterLink(null);
                            setDragOverFooterLink(null);
                          }}
                          className={`${styles.itemCard} ${isDragging ? styles.itemCardDragging : ""} ${
                            isDragOver ? styles.itemCardDragOver : ""
                          }`}
                        >
                          <div className={styles.itemCardHeader}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span className={styles.dragHandle} title="برای جابجایی بکشید">
                                ⠿
                              </span>
                              <strong>{localize(link.label, "fa")}</strong>
                              <span style={{ opacity: 0.6, fontSize: "0.8rem", direction: "ltr" }}>{link.link}</span>
                            </div>
                            <div className={styles.itemCardActions}>
                              <button
                                type="button"
                                className={ui.button}
                                disabled={index === 0}
                                onClick={() => moveFooterLink(index, -1)}
                                title="انتقال به بالا"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className={ui.button}
                                disabled={index === (layout.footer.links?.length ?? 0) - 1}
                                onClick={() => moveFooterLink(index, 1)}
                                title="انتقال به پایین"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                className={`${ui.button} ${ui.dangerIcon}`}
                                onClick={() => removeFooterLink(link.id)}
                                title="حذف لینک"
                              >
                                <TrashIcon size={13} />
                              </button>
                            </div>
                          </div>

                          <div className={styles.row}>
                            <input
                              className={ui.input}
                              style={{ flex: 1 }}
                              value={textFa(link.label)}
                              placeholder="عنوان لینک فوتر"
                              onChange={(e) => updateFooterLink(link.id, { label: { fa: e.target.value, en: e.target.value } })}
                            />
                            <select
                              className={ui.select}
                              style={{ width: 140, fontSize: "0.75rem" }}
                              value={link.target ?? "_self"}
                              onChange={(e) => updateFooterLink(link.id, { target: e.target.value as "_self" | "_blank" })}
                            >
                              <option value="_self">در همین صفحه</option>
                              <option value="_blank">تب جدید (_blank)</option>
                            </select>
                          </div>

                          <div className={ui.field}>
                            {pages.length > 0 && (
                              <select
                                className={ui.select}
                                style={{ marginBottom: 4 }}
                                value={pages.some((p) => p.path === link.link) ? link.link : ""}
                                onChange={(e) => {
                                  if (e.target.value) updateFooterLink(link.id, { link: e.target.value });
                                }}
                              >
                                <option value="">-- انتخاب از صفحات پروژه --</option>
                                {pages.map((p) => (
                                  <option key={p.id} value={p.path}>
                                    {localize(p.title, "fa")} ({p.path})
                                  </option>
                                ))}
                              </select>
                            )}
                            <input
                              className={ui.input}
                              dir="ltr"
                              placeholder="/monitoring یا https://..."
                              value={link.link}
                              onChange={(e) => updateFooterLink(link.id, { link: e.target.value })}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </AccordionCard>
              </>
            )}

            {/* TAB 4: THEME */}
            {activeTab === "theme" && (
              <>
                <div className={styles.accordionToggleRow}>
                  <button
                    type="button"
                    className={styles.accordionToggleAllBtn}
                    onClick={() => expandAllInTab("theme")}
                  >
                    ➕ باز کردن همه
                  </button>
                  <button
                    type="button"
                    className={styles.accordionToggleAllBtn}
                    onClick={() => collapseAllInTab("theme")}
                  >
                    ➖ بستن همه
                  </button>
                </div>

                <AccordionCard
                  id="thm_brand"
                  title="🎨 رنگ اصلی برند پروژه (Primary Brand Color)"
                  badge={layout.theme.brandColor}
                  badgeActive={true}
                  isOpen={Boolean(openSections.thm_brand)}
                  onToggle={() => toggleSection("thm_brand", true)}
                >
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    {BRAND_PALETTES.map((p) => (
                      <button
                        key={p.hex}
                        type="button"
                        className={ui.button}
                        style={{
                          background: p.hex,
                          color: "#ffffff",
                          fontSize: "0.75rem",
                          padding: "5px 10px",
                          border: layout.theme.brandColor === p.hex ? "2px solid #ffffff" : "1px solid rgba(0,0,0,0.2)",
                        }}
                        onClick={() => updateTheme({ brandColor: p.hex })}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>

                  <label className={ui.field}>
                    <span className={ui.label}>انتخاب رنگ دلخواه:</span>
                    <div className={styles.row}>
                      <input
                        type="color"
                        value={layout.theme.brandColor}
                        onChange={(e) => updateTheme({ brandColor: e.target.value })}
                      />
                      <input
                        className={ui.input}
                        dir="ltr"
                        value={layout.theme.brandColor}
                        onChange={(e) => updateTheme({ brandColor: e.target.value })}
                      />
                    </div>
                  </label>
                </AccordionCard>

                <AccordionCard
                  id="thm_default"
                  title="🌓 حالت پیش‌فرض نمایش پروژه (Default Appearance)"
                  badge={layout.theme.defaultAppearance === "night" ? "شب" : layout.theme.defaultAppearance === "day" ? "روز" : "خودکار"}
                  badgeActive={true}
                  isOpen={Boolean(openSections.thm_default)}
                  onToggle={() => toggleSection("thm_default", true)}
                >
                  <div style={{ display: "flex", gap: 8 }}>
                    {([
                      { id: "night", label: "🌙 شب (Night)" },
                      { id: "day", label: "☀️ روز (Day)" },
                      { id: "system", label: "🖥️ خودکار (System)" },
                    ] as const).map((app) => (
                      <button
                        key={app.id}
                        type="button"
                        className={`${ui.button} ${(layout.theme.defaultAppearance ?? "system") === app.id ? ui.primary : ""}`}
                        style={{ flex: 1, fontSize: "0.78rem" }}
                        onClick={() => updateTheme({ defaultAppearance: app.id })}
                      >
                        {app.label}
                      </button>
                    ))}
                  </div>
                </AccordionCard>

                <AccordionCard
                  id="thm_radius"
                  title="📐 استایل گوشه‌ها (Border Radius)"
                  badge={layout.theme.borderRadius ?? "md"}
                  badgeActive={true}
                  isOpen={Boolean(openSections.thm_radius)}
                  onToggle={() => toggleSection("thm_radius", false)}
                >
                  <div style={{ display: "flex", gap: 8 }}>
                    {(["sm", "md", "lg", "full"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        className={`${ui.button} ${layout.theme.borderRadius === r ? ui.primary : ""}`}
                        style={{ flex: 1, fontSize: "0.78rem" }}
                        onClick={() => updateTheme({ borderRadius: r })}
                      >
                        {r === "sm" ? "تیز (4px)" : r === "md" ? "معمولی (8px)" : r === "lg" ? "گرد (12px)" : "کپسولی (20px)"}
                      </button>
                    ))}
                  </div>
                </AccordionCard>

                <AccordionCard
                  id="thm_night"
                  title="🌙 رنگ‌های حالت شب (Night Appearance)"
                  isOpen={Boolean(openSections.thm_night)}
                  onToggle={() => toggleSection("thm_night", false)}
                >
                  <label className={ui.field}>
                    <span className={ui.label}>پس‌زمینه اصلی:</span>
                    <div className={styles.row}>
                      <input
                        type="color"
                        value={layout.theme.night.surfaceBase}
                        onChange={(e) => updateTheme({
                          night: { ...layout.theme.night, surfaceBase: e.target.value },
                        })}
                      />
                      <input
                        className={ui.input}
                        dir="ltr"
                        value={layout.theme.night.surfaceBase}
                        onChange={(e) => updateTheme({
                          night: { ...layout.theme.night, surfaceBase: e.target.value },
                        })}
                      />
                    </div>
                  </label>
                  <label className={ui.field}>
                    <span className={ui.label}>سطح کارت‌ها و هدر (Raised):</span>
                    <div className={styles.row}>
                      <input
                        type="color"
                        value={layout.theme.night.surfaceRaised}
                        onChange={(e) => updateTheme({
                          night: { ...layout.theme.night, surfaceRaised: e.target.value },
                        })}
                      />
                      <input
                        className={ui.input}
                        dir="ltr"
                        value={layout.theme.night.surfaceRaised}
                        onChange={(e) => updateTheme({
                          night: { ...layout.theme.night, surfaceRaised: e.target.value },
                        })}
                      />
                    </div>
                  </label>
                </AccordionCard>

                <AccordionCard
                  id="thm_day"
                  title="☀️ رنگ‌های حالت روز (Day Appearance)"
                  isOpen={Boolean(openSections.thm_day)}
                  onToggle={() => toggleSection("thm_day", false)}
                >
                  <label className={ui.field}>
                    <span className={ui.label}>پس‌زمینه اصلی:</span>
                    <div className={styles.row}>
                      <input
                        type="color"
                        value={layout.theme.day.surfaceBase}
                        onChange={(e) => updateTheme({
                          day: { ...layout.theme.day, surfaceBase: e.target.value },
                        })}
                      />
                      <input
                        className={ui.input}
                        dir="ltr"
                        value={layout.theme.day.surfaceBase}
                        onChange={(e) => updateTheme({
                          day: { ...layout.theme.day, surfaceBase: e.target.value },
                        })}
                      />
                    </div>
                  </label>
                  <label className={ui.field}>
                    <span className={ui.label}>سطح کارت‌ها و هدر (Raised):</span>
                    <div className={styles.row}>
                      <input
                        type="color"
                        value={layout.theme.day.surfaceRaised}
                        onChange={(e) => updateTheme({
                          day: { ...layout.theme.day, surfaceRaised: e.target.value },
                        })}
                      />
                      <input
                        className={ui.input}
                        dir="ltr"
                        value={layout.theme.day.surfaceRaised}
                        onChange={(e) => updateTheme({
                          day: { ...layout.theme.day, surfaceRaised: e.target.value },
                        })}
                      />
                    </div>
                  </label>
                </AccordionCard>

                <AccordionCard
                  id="thm_sync"
                  title="🌐 اعمال و هماهنگ‌سازی سراسری تم روی تمام صفحات (Sync Theme to All Pages)"
                  isOpen={Boolean(openSections.thm_sync)}
                  onToggle={() => toggleSection("thm_sync", true)}
                  style={{
                    border: "1px solid rgba(56, 189, 248, 0.4)",
                    background: "rgba(14, 165, 233, 0.06)",
                    boxShadow: "0 0 16px rgba(14, 165, 233, 0.08)",
                  }}
                >
                  <p
                    className={ui.hint}
                    style={{ margin: "2px 0 12px 0", lineHeight: 1.6, color: "var(--color-text-muted, #8b98a5)" }}
                  >
                    اگر صفحاتی در پروژه ساخته‌اید که از رنگ‌های تم فعلی پیروی نمی‌کنند یا تم متفاوتی دارند، با فشردن دکمه زیر، تنظیمات رنگ‌های برند، سطوح شب/روز و قالب کلی روی تمام برگه‌های پروژه به صورت یکپارچه ذخیره و اعمال می‌شود.
                  </p>
                  <button
                    type="button"
                    className={`${ui.button} ${ui.primary}`}
                    style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "0.85rem" }}
                    disabled={syncingTheme}
                    onClick={handleSyncThemeToAllPages}
                  >
                    {syncingTheme ? "در حال همگام‌سازی برگه‌ها…" : "✨ همگام‌سازی و اعمال تم روی تمام صفحات پروژه"}
                  </button>
                  {syncResult && (
                    <div
                      style={{
                        marginTop: 10,
                        fontSize: "0.85rem",
                        color: syncResult.error ? "#ef4444" : "#10b981",
                        fontWeight: 600,
                        padding: "8px 12px",
                        background: syncResult.error ? "rgba(239, 68, 68, 0.12)" : "rgba(16, 185, 129, 0.12)",
                        border: syncResult.error ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(16, 185, 129, 0.3)",
                        borderRadius: 6,
                      }}
                    >
                      {syncResult.text}
                    </div>
                  )}
                </AccordionCard>
              </>
            )}

            {/* TAB 5: DATA ENVIRONMENT & MODE */}
            {activeTab === "data-mode" && (
              <>
                <div className={styles.accordionToggleRow}>
                  <button
                    type="button"
                    className={styles.accordionToggleAllBtn}
                    onClick={() => expandAllInTab("data-mode")}
                  >
                    ➕ باز کردن همه
                  </button>
                  <button
                    type="button"
                    className={styles.accordionToggleAllBtn}
                    onClick={() => collapseAllInTab("data-mode")}
                  >
                    ➖ بستن همه
                  </button>
                </div>

                <AccordionCard
                  id="data_env"
                  title="🧪 وضعیت و ایمنی داده‌های پروژه (Data Environment)"
                  badge={
                    layout.dataEnvironment === "live"
                      ? "عملیاتی زنده (Live)"
                      : layout.dataEnvironment === "test"
                      ? "شبیه‌سازی (Test)"
                      : "خودکار (Auto)"
                  }
                  badgeActive={layout.dataEnvironment === "live"}
                  isOpen={Boolean(openSections.data_env)}
                  onToggle={() => toggleSection("data_env", true)}
                >
                  <p className={ui.muted} style={{ fontSize: "0.84rem", margin: "0 0 16px", lineHeight: 1.6 }}>
                    در سامانه‌های مانیتورینگ صنعتی و SCADA، تفکیک داده‌های شبیه‌سازی‌شده (Test / Simulation) از داده‌های واقعی و عملیاتی نیروگاه (Live Data) از الزامات حیاتی امنیت و ایمنی فرآیند است.
                  </p>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 18 }}>
                    {/* Option 1: Auto */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        const next = { ...layout, dataEnvironment: "auto" as const };
                        setLayout(next);
                        saveSiteLayout(next, project.slug);
                      }}
                      style={{
                        border: `2px solid ${(layout.dataEnvironment ?? "auto") === "auto" ? "var(--color-brand, #38bdf8)" : "var(--color-border-subtle, rgba(255,255,255,0.08))"}`,
                        background: (layout.dataEnvironment ?? "auto") === "auto" ? "rgba(56, 189, 248, 0.08)" : "rgba(255,255,255,0.02)",
                        borderRadius: 10,
                        padding: "14px 16px",
                        cursor: "pointer",
                        transition: "all 0.18s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: "1.3rem" }}>⚡</span>
                        <strong style={{ fontSize: "0.95rem" }}>تشخیص خودکار (Auto-Detect)</strong>
                      </div>
                      <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--color-text-muted, #8b98a5)", lineHeight: 1.5 }}>
                        سیستم بر مبنای منابع داده فعال و بایندینگ‌های هر صفحه، تستی یا زنده بودن داده‌ها را تشخیص می‌دهد.
                      </p>
                    </div>

                    {/* Option 2: Test / Simulated */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        const next = { ...layout, dataEnvironment: "test" as const };
                        setLayout(next);
                        saveSiteLayout(next, project.slug);
                      }}
                      style={{
                        border: `2px solid ${layout.dataEnvironment === "test" ? "#f5a524" : "var(--color-border-subtle, rgba(255,255,255,0.08))"}`,
                        background: layout.dataEnvironment === "test" ? "rgba(245, 165, 36, 0.1)" : "rgba(255,255,255,0.02)",
                        borderRadius: 10,
                        padding: "14px 16px",
                        cursor: "pointer",
                        transition: "all 0.18s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: "1.3rem" }}>🧪</span>
                        <strong style={{ fontSize: "0.95rem", color: "#f5a524" }}>حالت آزمایشی / تستی (Test Mode)</strong>
                      </div>
                      <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--color-text-muted, #8b98a5)", lineHeight: 1.5 }}>
                        پروژه به عنوان محیط تست و شبیه‌سازی مشخص می‌شود؛ برچسب تستی در هدر و بنر هشدار در صفحات فعال خواهد بود.
                      </p>
                    </div>

                    {/* Option 3: Live / Production */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        const next = { ...layout, dataEnvironment: "live" as const };
                        setLayout(next);
                        saveSiteLayout(next, project.slug);
                      }}
                      style={{
                        border: `2px solid ${layout.dataEnvironment === "live" ? "#10b981" : "var(--color-border-subtle, rgba(255,255,255,0.08))"}`,
                        background: layout.dataEnvironment === "live" ? "rgba(16, 185, 129, 0.1)" : "rgba(255,255,255,0.02)",
                        borderRadius: 10,
                        padding: "14px 16px",
                        cursor: "pointer",
                        transition: "all 0.18s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: "1.3rem" }}>🟢</span>
                        <strong style={{ fontSize: "0.95rem", color: "#34d399" }}>حالت واقعی و عملیاتی (Live SCADA)</strong>
                      </div>
                      <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--color-text-muted, #8b98a5)", lineHeight: 1.5 }}>
                        پروژه به عنوان سامانه واقعی و عملیاتی نیروگاه تلقی شده و داده‌ها به عنوان مقادیر معتبر تلقی می‌شوند.
                      </p>
                    </div>
                  </div>

                  <div style={{ borderTop: "1px solid var(--color-border-subtle, rgba(255,255,255,0.08))", paddingTop: 14 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: "0.88rem" }}>
                      <input
                        type="checkbox"
                        checked={layout.showDataModeBadge ?? true}
                        onChange={(e) => {
                          const next = { ...layout, showDataModeBadge: e.target.checked };
                          setLayout(next);
                          saveSiteLayout(next, project.slug);
                        }}
                      />
                      <span>نمایش نشانگر وضعیت داده‌ها (🧪 تستی / 🟢 واقعی) در هدر سایت</span>
                    </label>
                    <p className={ui.muted} style={{ fontSize: "0.8rem", margin: "4px 26px 0" }}>
                      با فعال بودن این گزینه، ناظران در هدر پروژه متوجه تستی یا واقعی بودن داده‌ها می‌شوند.
                    </p>
                  </div>
                </AccordionCard>
              </>
            )}
          </div>
        </div>

        {/* Right: Real-time Live Interactive Preview */}
        <div className={styles.previewPanel}>
          <div className={styles.previewToolbar}>
            <div className={styles.previewTitle}>
              <span>👁️</span>
              <span>پیش‌نمایش زنده و لحظه‌ای پوسته سایت</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <ThemeToggle mode={previewMode} onChange={setPreviewMode} />
              {currentPageSummary && onOpenPage && (
                <button
                  type="button"
                  className={ui.button}
                  style={{ fontSize: "0.78rem", borderColor: "#38bdf8", color: "#38bdf8" }}
                  onClick={() => onOpenPage(currentPageSummary)}
                  title="باز کردن این صفحه در صفحه ساز"
                >
                  ویرایش این صفحه ↗
                </button>
              )}
              <button
                type="button"
                className={ui.button}
                style={{ fontSize: "0.78rem" }}
                onClick={() => setPreviewPath("/")}
              >
                بازنشانی مسیر
              </button>
            </div>
          </div>

          <div
            className={styles.previewCanvas}
            data-theme={previewMode}
            style={themeVars as CSSProperties}
          >
            {/* Visual Canvas Drag & Drop Banner */}
            <div className={styles.canvasInteractiveBanner}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={styles.canvasBannerPill}>✨ حالت Canvas Drag & Drop فعال</span>
                <span>المان‌های هدر، منو، شاخص‌های KPI، دکمه تم و فوتر را با ماوس مستقیماً بگیرید و جابجا کنید.</span>
              </div>
              {selectedCanvasId && (
                <span style={{ fontSize: "0.75rem", opacity: 0.9 }}>
                  المان انتخابی: <code dir="ltr" style={{ color: "#38bdf8" }}>{selectedCanvasId}</code>
                </span>
              )}
            </div>

            {/* Live Header Rendering with Visual Canvas Drag & Drop */}
            <SiteHeader
              config={layout.header}
              theme={layout.theme}
              appearanceMode={previewMode}
              onAppearanceModeChange={setPreviewMode}
              siteSlug={project.slug}
              currentPath={previewPath}
              onNavigate={(path) => setPreviewPath(path)}
              dataMode={layout.dataEnvironment ?? "auto"}
              showDataModeBadge={layout.showDataModeBadge ?? layout.header.showDataModeBadge ?? true}
              canvasDrag={{
                enabled: true,
                activeId: canvasDragActiveId,
                dropTarget: canvasDropTarget,
                selectedId: selectedCanvasId,
                onSelect: handleCanvasSelect,
                onDragStart: handleCanvasDragStart,
                onDragOver: handleCanvasDragOver,
                onDragLeave: handleCanvasDragLeave,
                onDrop: handleCanvasDrop,
                onDragEnd: handleCanvasDragEnd,
              }}
            />

            {/* Scrollable Mock Body */}
            <div className={styles.previewBody}>
              <div className={styles.mockCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h2 style={{ margin: 0, fontSize: "1.2rem", color: "var(--color-text-primary, #e6edf3)" }}>
                    نمای زنده صفحه: <code dir="ltr" style={{ color: "var(--color-brand, #38bdf8)" }}>{previewPath}</code>
                  </h2>
                  <span className={ui.hint}>اسکرول کنید تا رفتار هدر و فوتر را بیازمایید</span>
                </div>
                <p style={{ margin: 0, color: "var(--color-text-muted, #8b98a5)", lineHeight: 1.6 }}>
                  این ناحیه محتوای داینامیک صفحات سایت شماست. تغییرات منو (راست/چپ/پایین)، لوگو، منوی همبرگری و چسبندگی هدر و فوتر در لحظه اعمال می‌شوند.
                </p>
              </div>

              <div className={styles.mockGrid}>
                <div className={styles.mockCard}>
                  <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted, #8b98a5)" }}>وضعیت خط تولید</div>
                  <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "var(--color-brand, #38bdf8)" }}>۹۸.۴٪</div>
                  <div style={{ fontSize: "0.75rem", color: "#3fb950" }}>▲ عملکرد بهینه و پایدار</div>
                </div>
                <div className={styles.mockCard}>
                  <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted, #8b98a5)" }}>دمای محفظه واکنش</div>
                  <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "var(--color-text-primary, #e6edf3)" }}>۲۸۴.۶ °C</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted, #8b98a5)" }}>محدوده مجاز فرآیند</div>
                </div>
                <div className={styles.mockCard}>
                  <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted, #8b98a5)" }}>فشار مخزن ۳</div>
                  <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "var(--color-text-primary, #e6edf3)" }}>۶.۲ Bar</div>
                  <div style={{ fontSize: "0.75rem", color: "#3fb950" }}>تنظیم خودکار شیر فشارشکن</div>
                </div>
              </div>

              <div className={styles.mockCard} style={{ minHeight: 280 }}>
                <h3 style={{ margin: 0, fontSize: "1rem" }}>آزمون اسکرول و چسبندگی المان‌ها</h3>
                <p style={{ color: "var(--color-text-muted, #8b98a5)", lineHeight: 1.8 }}>
                  اگر گزینه <strong>«هدر چسبنده (Sticky Header)»</strong> را فعال کرده باشید، با اسکرول به پایین، هدر در بالای صفحه فیکس باقی می‌ماند.
                  همچنین در صورت فعال‌سازی <strong>«فوتر چسبنده (Sticky Footer)»</strong>، فوتر همواره در انتهای پنجره ثابت خواهد بود.
                </p>
                <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 8 }}>
                  <span style={{ opacity: 0.5, fontSize: "0.85rem" }}>[نمودار تله‌متری صنعتی بلادرنگ]</span>
                </div>
              </div>
            </div>

            {/* Live Footer Rendering with Visual Canvas Drag & Drop */}
            <SiteFooter
              config={layout.footer}
              theme={layout.theme}
              appearanceMode={previewMode}
              onAppearanceModeChange={setPreviewMode}
              themeTogglePlacement={layout.header.themeTogglePlacement ?? layout.themeTogglePlacement}
              siteSlug={project.slug}
              onNavigate={(path) => setPreviewPath(path)}
              canvasDrag={{
                enabled: true,
                activeId: canvasDragActiveId,
                dropTarget: canvasDropTarget,
                selectedId: selectedCanvasId,
                onSelect: (id, kind) => handleCanvasSelect(id, kind as SiteLayoutDragKind),
                onDragStart: (id, kind) => handleCanvasDragStart(id, kind as SiteLayoutDragKind),
                onDragOver: (id, kind, placement) =>
                  handleCanvasDragOver(id, kind as SiteLayoutDragKind, placement),
                onDragLeave: handleCanvasDragLeave,
                onDrop: handleCanvasDrop,
                onDragEnd: handleCanvasDragEnd,
              }}
            />

            {/* Floating theme toggle preview inside canvas if selected */}
            {((layout.header.themeTogglePlacement ?? layout.themeTogglePlacement) === "floating-bottom-left" ||
              (layout.header.themeTogglePlacement ?? layout.themeTogglePlacement) === "floating-bottom-right") && (
              <div
                className={
                  (layout.header.themeTogglePlacement ?? layout.themeTogglePlacement) === "floating-bottom-left"
                    ? styles.previewFloatingToggleLeft
                    : styles.previewFloatingToggleRight
                }
                title="برای جابجایی دکمه تم، با ماوس بکشید"
                draggable={true}
                onDragStart={(e) => {
                  e.stopPropagation();
                  e.dataTransfer.setData("text/plain", "slot:themeToggle");
                  handleCanvasDragStart("slot:themeToggle", "themeToggle");
                }}
                onDragEnd={handleCanvasDragEnd}
              >
                <ThemeToggle mode={previewMode} onChange={setPreviewMode} />
              </div>
            )}

            {/* Interactive Theme Placement Drop Targets Overlay when dragging Theme Toggle */}
            {(canvasDragKind === "themeToggle" || canvasDragActiveId === "slot:themeToggle") && (
              <div className={styles.themePlacementOverlay}>
                <div className={styles.themePlacementHeader}>
                  <span>🎯 دکمه تغییر تم را در یکی از موقعیت‌های زیر رها کنید:</span>
                  <button
                    type="button"
                    className={ui.button}
                    style={{ fontSize: "0.75rem" }}
                    onClick={handleCanvasDragEnd}
                  >
                    انصراف
                  </button>
                </div>
                <div className={styles.themePlacementGrid}>
                  {PLACEMENT_OPTIONS.filter((p) => p.id !== "hidden").map((target) => {
                    const isHovered = dragOverThemePlacement === target.id;
                    const isCurrent =
                      (layout.header.themeTogglePlacement ?? layout.themeTogglePlacement) === target.id;
                    return (
                      <div
                        key={target.id}
                        className={`${styles.themeDropTargetCard} ${
                          isHovered ? styles.themeDropTargetCardActive : ""
                        }`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          e.dataTransfer.dropEffect = "move";
                          setDragOverThemePlacement(target.id);
                        }}
                        onDragLeave={() => {
                          if (dragOverThemePlacement === target.id) {
                            setDragOverThemePlacement(null);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDropThemePlacement(target.id);
                        }}
                        onClick={() => handleDropThemePlacement(target.id)}
                      >
                        <span className={styles.themeDropTargetIcon}>{target.icon}</span>
                        <span className={styles.themeDropTargetTitle}>{target.title}</span>
                        <span className={styles.themeDropTargetDesc}>{target.desc}</span>
                        {isCurrent && (
                          <span
                            style={{
                              fontSize: "0.7rem",
                              color: "#38bdf8",
                              fontWeight: 600,
                              background: "rgba(56, 189, 248, 0.15)",
                              padding: "2px 8px",
                              borderRadius: 4,
                            }}
                          >
                            موقعیت فعلی
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Success notification */}
      {savedToast && (
        <div className={styles.successToast}>
          <span>✓</span>
          <span>تنظیمات قالب، هدر، منو و تم پروژه با موفقیت ذخیره شد.</span>
        </div>
      )}

      {/* Theme placement drag & drop notification */}
      {themePlacementToast && (
        <div
          className={styles.successToast}
          style={{ background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)" }}
        >
          <span>🎯</span>
          <span>{themePlacementToast}</span>
        </div>
      )}
    </div>
  );
}
