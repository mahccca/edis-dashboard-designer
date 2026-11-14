import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { localize } from "../i18n";
import { createDefaultSiteLayout } from "./defaults";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import { loadSiteLayout, saveSiteLayout } from "./storage";

afterEach(cleanup);

describe("site layout components", () => {
  it("renders SiteHeader with sticky positioning, brand logo, and menu items", () => {
    const layout = createDefaultSiteLayout("p-1", "پتروشیمی خلیج", "petro-pg");
    render(
      <SiteHeader
        config={layout.header}
        theme={layout.theme}
        appearanceMode="night"
        currentPath="/"
      />,
    );

    const header = screen.getByRole("banner");
    expect(header).toBeTruthy();
    expect(header.getAttribute("data-site-header")).toBe("true");
    expect(screen.getByText("پتروشیمی خلیج")).toBeTruthy();
    expect(screen.getByText("نمای اصلی")).toBeTruthy();
    expect(screen.getByText("پایش خط تولید")).toBeTruthy();
  });

  it("supports hamburger menu toggle, opens drawer via portal into document.body, and closes with escape key", () => {
    const layout = createDefaultSiteLayout("p-1", "پتروشیمی خلیج");
    const hamburgerHeader = {
      ...layout.header,
      menu: {
        ...layout.header.menu,
        hamburger: true,
      },
    };

    render(
      <SiteHeader
        config={hamburgerHeader}
        theme={layout.theme}
        appearanceMode="night"
        currentPath="/"
      />,
    );

    const hamburgerBtn = screen.getByRole("button", { name: "باز و بستن منو" });
    expect(hamburgerBtn).toBeTruthy();

    fireEvent.click(hamburgerBtn);
    const portal = screen.getByTestId("hamburger-portal");
    expect(portal).toBeTruthy();
    expect(portal.parentElement).toBe(document.body);

    const drawer = screen.getByRole("dialog");
    expect(drawer).toBeTruthy();
    expect(screen.getByRole("button", { name: "بستن منو" })).toBeTruthy();
    expect(screen.getByText(/شاخص‌های مانیتورینگ زنده/)).toBeTruthy();

    // Escape closes drawer
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("hamburger-portal")).toBeNull();
  });

  it("renders header KPI widgets in the main bar", () => {
    const layout = createDefaultSiteLayout("p-1", "پتروشیمی خلیج");
    render(
      <SiteHeader
        config={layout.header}
        theme={layout.theme}
        appearanceMode="night"
        currentPath="/"
      />,
    );

    const kpiContainer = screen.getByTestId("header-kpi-container");
    expect(kpiContainer).toBeTruthy();
    expect(screen.getByText("توان اکتیو")).toBeTruthy();
    expect(screen.getByText("312.4")).toBeTruthy();
    expect(screen.getByText("فشار مخزن")).toBeTruthy();
    expect(screen.getByText("6.2")).toBeTruthy();
  });

  it("renders SiteFooter with sticky and copyright info", () => {
    const layout = createDefaultSiteLayout("p-1", "پتروشیمی خلیج");
    const stickyFooter = {
      ...layout.footer,
      sticky: true,
    };

    const { container } = render(
      <SiteFooter
        config={stickyFooter}
        theme={layout.theme}
        appearanceMode="night"
      />,
    );

    const footer = container.querySelector("footer");
    expect(footer).toBeTruthy();
    expect(footer?.getAttribute("data-site-footer")).toBe("true");
    expect(screen.getByText(/تمامی حقوق برای پلتفرم بصری صنعتی/)).toBeTruthy();
    expect(screen.getByText(/اتصال پایدار/)).toBeTruthy();
  });

  it("renders live data binding values for KPI widgets in SiteHeader", () => {
    const layout = createDefaultSiteLayout("p-1", "پتروشیمی خلیج");
    const kpiWithBinding = {
      ...layout.header,
      kpiWidgets: [
        {
          id: "kpi-power",
          label: { fa: "توان اکتیو", en: "Active Power" },
          value: "100",
          unit: "kW",
          status: "good" as const,
          dataSourceType: "binding" as const,
          bindingId: "bind_power_live",
        },
      ],
    };

    render(
      <SiteHeader
        config={kpiWithBinding}
        theme={layout.theme}
        appearanceMode="night"
        currentPath="/"
        liveValues={{
          bind_power_live: {
            bindingId: "bind_power_live",
            value: 489.7,
            unit: "kW",
            quality: "good",
            sourceTimestamp: null,
            origin: "data_source_signal",
            dataOrigin: "live",
            isTestData: false,
          },
        }}
      />,
    );

    expect(screen.getByText("489.7")).toBeTruthy();
    expect(screen.getByText("kW")).toBeTruthy();
  });

  it("saves and loads site layout from storage correctly", () => {
    const layout = createDefaultSiteLayout("test-proj", "تست پروژه");
    layout.theme.brandColor = "#2563eb";
    saveSiteLayout(layout);

    const loaded = loadSiteLayout("test-proj");
    expect(loaded.theme.brandColor).toBe("#2563eb");
    expect(localize(loaded.header.logo.title, "fa")).toBe("تست پروژه");
  });

  it("renders ThemeToggle in header and toggles mode when placement is header-left", () => {
    const layout = createDefaultSiteLayout("p-1", "پتروشیمی خلیج");
    const onModeChange = vi.fn();
    render(
      <SiteHeader
        config={{ ...layout.header, themeTogglePlacement: "header-left" }}
        theme={layout.theme}
        appearanceMode="night"
        onAppearanceModeChange={onModeChange}
        currentPath="/"
      />,
    );

    const toggle = screen.getByTestId("header-theme-toggle");
    expect(toggle).toBeTruthy();

    const sunBtn = screen.getByRole("button", { name: "حالت روز" });
    fireEvent.click(sunBtn);
    expect(onModeChange).toHaveBeenCalledWith("day");
  });

  it("honors custom headerOrder sequence in SiteHeader", () => {
    const layout = createDefaultSiteLayout("p-1", "پتروشیمی خلیج");
    const { container } = render(
      <SiteHeader
        config={{
          ...layout.header,
          headerOrder: ["themeToggle", "logo", "menu", "kpis", "extra"],
          themeTogglePlacement: "header-right",
        }}
        theme={layout.theme}
        appearanceMode="night"
        onAppearanceModeChange={() => {}}
        currentPath="/"
      />,
    );

    const slots = container.querySelectorAll("[data-slot]");
    const slotNames = Array.from(slots).map((s) => s.getAttribute("data-slot"));
    expect(slotNames[0]).toBe("themeToggle");
    expect(slotNames[1]).toBe("logo");
    expect(slotNames[2]).toBe("menu");
  });

  it("does not render ThemeToggle in header when placement is footer or hidden", () => {
    const layout = createDefaultSiteLayout("p-1", "پتروشیمی خلیج");
    render(
      <SiteHeader
        config={{ ...layout.header, themeTogglePlacement: "hidden" }}
        theme={layout.theme}
        appearanceMode="night"
        onAppearanceModeChange={() => {}}
        currentPath="/"
      />,
    );

    expect(screen.queryByTestId("header-theme-toggle")).toBeNull();
  });

  it("renders ThemeToggle in SiteFooter when placement is footer", () => {
    const layout = createDefaultSiteLayout("p-1", "پتروشیمی خلیج");
    const onModeChange = vi.fn();
    render(
      <SiteFooter
        config={{ ...layout.footer, themeTogglePlacement: "footer" }}
        theme={layout.theme}
        appearanceMode="night"
        onAppearanceModeChange={onModeChange}
      />,
    );

    const toggle = screen.getByTestId("footer-theme-toggle");
    expect(toggle).toBeTruthy();
    const sunBtn = screen.getByRole("button", { name: "حالت روز" });
    fireEvent.click(sunBtn);
    expect(onModeChange).toHaveBeenCalledWith("day");
  });

  it("supports interactive canvas drag & drop on header slot blocks, menu items, and KPI chips", () => {
    const layout = createDefaultSiteLayout("p-1", "پتروشیمی خلیج");
    const onSelect = vi.fn();
    const onDragStart = vi.fn();
    const onDragOver = vi.fn();
    const onDrop = vi.fn();

    const { container } = render(
      <SiteHeader
        config={layout.header}
        theme={layout.theme}
        appearanceMode="night"
        currentPath="/"
        canvasDrag={{
          enabled: true,
          activeId: "slot:logo",
          dropTarget: { targetId: "slot:menu", placement: "before" },
          selectedId: "slot:logo",
          onSelect,
          onDragStart,
          onDragOver,
          onDrop,
        }}
      />,
    );

    // Slots are marked draggable
    const logoSlot = container.querySelector('[data-slot="logo"]');
    expect(logoSlot).toBeTruthy();
    expect(logoSlot?.getAttribute("draggable")).toBe("true");

    // Grab handle badge rendered for selected slot
    expect(screen.getByText(/لوگو/)).toBeTruthy();

    // Trigger drag start on logo slot
    fireEvent.dragStart(logoSlot!, {
      dataTransfer: { setData: vi.fn(), effectAllowed: "" },
    });
    expect(onDragStart).toHaveBeenCalledWith("slot:logo", "headerBlock");

    // Trigger drag over menu slot
    const menuSlot = container.querySelector('[data-slot="menu"]');
    expect(menuSlot).toBeTruthy();
    fireEvent.dragOver(menuSlot!, {
      dataTransfer: { dropEffect: "" },
      clientX: 100,
    });
    expect(onDragOver).toHaveBeenCalled();

    // Trigger drop
    fireEvent.drop(menuSlot!, {
      dataTransfer: {},
    });
    expect(onDrop).toHaveBeenCalledWith("slot:menu", "before");
  });

  it("supports interactive canvas drag & drop on footer links", () => {
    const layout = createDefaultSiteLayout("p-1", "پتروشیمی خلیج");
    const onSelect = vi.fn();
    const onDragStart = vi.fn();
    const onDrop = vi.fn();

    const { container } = render(
      <SiteFooter
        config={layout.footer}
        theme={layout.theme}
        appearanceMode="night"
        canvasDrag={{
          enabled: true,
          activeId: null,
          dropTarget: null,
          selectedId: null,
          onSelect,
          onDragStart,
          onDrop,
        }}
      />,
    );

    const linkItems = container.querySelectorAll("li[draggable='true']");
    expect(linkItems.length).toBeGreaterThan(0);

    const firstLink = linkItems[0];
    fireEvent.dragStart(firstLink!, {
      dataTransfer: { setData: vi.fn(), effectAllowed: "" },
    });
    expect(onDragStart).toHaveBeenCalled();

    fireEvent.drop(firstLink!, {
      dataTransfer: {},
    });
    expect(onDrop).toHaveBeenCalled();
  });

  it("supports custom logo layout (column: icon above text), alignment, and subtitle toggle", () => {
    const layout = createDefaultSiteLayout("p-1", "پتروشیمی خلیج");
    const { container, rerender } = render(
      <SiteHeader
        config={{
          ...layout.header,
          logo: {
            ...layout.header.logo,
            layout: "column",
            align: "center",
            gap: "lg",
            showSubtitle: false,
          },
        }}
        theme={layout.theme}
        appearanceMode="night"
        currentPath="/"
      />,
    );

    const logoWrapper = container.querySelector('[class*="logoWrapper"]');
    expect(logoWrapper).toBeTruthy();
    expect(logoWrapper?.className).toMatch(/logoLayoutColumn/);
    expect(logoWrapper?.className).toMatch(/logoAlignCenter/);
    expect(logoWrapper?.className).toMatch(/logoGapLg/);

    // Subtitle is hidden when showSubtitle is false
    expect(screen.queryByText("سامانه هوشمند مانیتورینگ و کنترل")).toBeNull();

    // Rerender with row-reverse layout and subtitle enabled
    rerender(
      <SiteHeader
        config={{
          ...layout.header,
          logo: {
            ...layout.header.logo,
            layout: "row-reverse",
            align: "start",
            showSubtitle: true,
          },
        }}
        theme={layout.theme}
        appearanceMode="night"
        currentPath="/"
      />,
    );

    expect(container.querySelector('[class*="logoWrapper"]')?.className).toMatch(/logoLayoutRowReverse/);
    expect(screen.getByText("سامانه هوشمند مانیتورینگ و کنترل")).toBeTruthy();
  });

  it("supports custom menu item layout, KPI chip layout, and footer columns/links layouts", () => {
    const layout = createDefaultSiteLayout("p-1", "پتروشیمی خلیج");
    const { container } = render(
      <SiteHeader
        config={{
          ...layout.header,
          density: "compact",
          kpiLayout: "card",
          menu: {
            ...layout.header.menu,
            itemLayout: "column",
            gap: "lg",
          },
        }}
        theme={layout.theme}
        appearanceMode="night"
        currentPath="/"
      />,
    );

    // Density
    const mainBar = container.querySelector('[class*="mainBar"]');
    expect(mainBar?.className).toMatch(/densityCompact/);

    // Menu Item layout
    const menuItem = container.querySelector('[class*="menuItem"]');
    expect(menuItem?.className).toMatch(/menuItemLayoutColumn/);

    // KPI chip layout
    const kpiChip = container.querySelector('[class*="kpiChip"]');
    expect(kpiChip?.className).toMatch(/kpiLayoutCard/);

    // Footer layouts
    const { container: footerContainer } = render(
      <SiteFooter
        config={{
          ...layout.footer,
          columnsLayout: "2-col",
          linksLayout: "row",
        }}
        theme={layout.theme}
        appearanceMode="night"
      />,
    );

    const columns = footerContainer.querySelector('[class*="columns"]');
    expect(columns?.className).toMatch(/columns2Col/);

    const linkList = footerContainer.querySelector('[class*="linkList"]');
    expect(linkList?.className).toMatch(/linkListRow/);
  });
});
