import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentContent } from "../../shared/api/types";
import { BINDING_ID, KPI_SPEC, value } from "../../test/fixtures";
import { Editor } from "./Editor";

type Call = { method: string; path: string; body: unknown; headers: Record<string, string> };

const EMPTY_DOC: DocumentContent = { schemaVersion: 1, documentType: "page", settings: { direction: "rtl" }, root: { id: "root", type: "root", children: [] } };

/** In-memory stand-in for the VS-1 API, just enough for the editor flow (AT-2 UI path). */
function fakeApi(opts: { saveStatus?: number } = {}) {
  const calls: Call[] = [];
  const bindings: unknown[] = [];
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

  const routes: Array<[string, RegExp, (c: Call) => Response]> = [
    ["GET", /^\/pages\/p1$/, () => json(200, { id: "p1", document: EMPTY_DOC }, { ETag: '"rev-1"' })],
    ["GET", /^\/pages\/p1\/(revisions|published-versions)$/, () => json(200, { items: [] })],
    ["GET", /^\/projects\/proj\/components$/, () => json(200, { items: [{ id: KPI_SPEC.id, key: KPI_SPEC.key, latestPublishedVersion: "1.2.0" }] })],
    ["GET", /^\/components\/[^/]+\/versions\/1\.2\.0$/, () => json(200, KPI_SPEC)],
    ["GET", /^\/projects\/proj\/data-bindings$/, () => json(200, { items: bindings })],
    ["GET", /^\/projects\/proj\/objects$/, () => json(200, { items: [{ id: "o1", key: "darkhoveyn.site", name: { en: "Darkhoveyn site" }, typeId: "t1", typeVersion: 1 }] })],
    ["GET", /^\/projects\/proj\/object-types$/, () => json(200, { items: [{ id: "t1", version: 1, variables: [{ key: "ac_power", name: { en: "AC power" }, dataType: "number", unit: "W" }] }] })],
    ["GET", /^\/projects\/proj\/data-sources$/, () => json(200, { items: [{ id: "ds", name: "Darkhoveyn simulator (TEST DATA)", kind: "simulated", dataOrigin: "simulated", isTestData: true }] })],
    ["GET", /^\/data-sources\/[^/]+\/signals$/, () => json(200, { items: [{ path: "darkhoveyn/total/AC_POWER", name: "AC", unit: "W", lastValue: 100 }] })],
    ["POST", /^\/projects\/proj\/data-bindings$/, (c) => {
      const b = { ...(c.body as object), id: BINDING_ID };
      bindings.push(b);
      return json(201, b);
    }],
    ["GET", /^\/data-bindings\/[^/]+\/value$/, () => json(200, value())],
    ["PUT", /^\/pages\/p1\/document$/, () => opts.saveStatus === 412
      ? json(412, { type: "about:blank", title: "Resource was modified", status: 412, code: "precondition_failed", currentEtag: '"rev-7"' })
      : json(200, { revisionNo: 2 }, { ETag: '"rev-2"' })],
    ["POST", /^\/pages\/p1\/publish$/, () => json(201, { id: "pv1", versionNo: 1, sourceRevisionNo: 2, containsTestData: true })],
  ];

  const fetchMock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = new URL(input, "http://studio.test");
    const call: Call = {
      method: init.method ?? "GET",
      path: url.pathname.replace(/^\/api\/v1/, ""),
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      headers: (init.headers ?? {}) as Record<string, string>,
    };
    calls.push(call);
    const route = routes.find(([m, re]) => m === call.method && re.test(call.path));
    return route ? route[2](call) : json(404, { title: "Not found", status: 404, code: "not_found" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

const project = { id: "proj", slug: "pilot", name: "Pilot" } as never;
const page = { id: "p1", path: "/plant/overview", title: { fa: "نمای کلی" } } as never;

function click(name: RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
}

async function buildKpiPage() {
  await screen.findByRole("button", { name: "root" });
  click(/\+ section/);
  click(/\+ row/);
  click(/\+ column/);
  await waitFor(() => expect((screen.getByRole("button", { name: /\+ کارت شاخص/ }) as HTMLButtonElement).disabled).toBe(false));
  click(/\+ کارت شاخص/);

  fireEvent.change(screen.getAllByPlaceholderText("فارسی")[0]!, { target: { value: "توان AC کل" } });
  fireEvent.change(screen.getByLabelText(/^Decimals/), { target: { value: "1" } });

  const picker = within(document.querySelector<HTMLElement>('[data-binding-input="value"]')!);
  fireEvent.change(picker.getByDisplayValue("انتخاب شیء…"), { target: { value: "o1" } });
  fireEvent.change(picker.getByDisplayValue("انتخاب متغیر…"), { target: { value: "ac_power" } });
  fireEvent.change(picker.getByLabelText("واحد نمایش"), { target: { value: "kW" } });
  fireEvent.click(picker.getByRole("button", { name: "ساخت و اتصال" }));
  await waitFor(() => expect((screen.getByLabelText("اتصال داده برای value") as HTMLSelectElement).value).toBe(BINDING_ID));
}

beforeEach(() => vi.useRealTimers());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("editor-lite: build, bind, save, publish without writing code (AT-2 UI path)", () => {
  it("produces the expected document and sends it with If-Match", async () => {
    const calls = fakeApi();
    render(<Editor project={project} page={page} onBack={() => {}} />);
    await buildKpiPage();

    const create = calls.find((c) => c.method === "POST" && c.path.endsWith("/data-bindings"))!;
    expect(create.body).toMatchObject({
      source: { kind: "object_variable", objectId: "o1", variable: "ac_power" },
      transform: { toUnit: "kW", decimals: 1 },
      delivery: { mode: "live" },
    });

    const shown = new Intl.NumberFormat("fa-IR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(312.4);
    expect(await screen.findByText(shown)).toBeTruthy();
    expect(screen.getAllByText(/داده آزمایشی/).length).toBeGreaterThanOrEqual(1);

    click(/^ذخیره$/);
    await screen.findByText(/ذخیره شد — ویرایش 2/);
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.headers["If-Match"]).toBe('"rev-1"');
    const content = (put.body as { content: DocumentContent }).content;
    const section = content.root.children![0]!;
    const row = section.children![0]!;
    const column = row.children![0]!;
    const kpi = column.children![0]!;
    expect([section.type, row.type, column.type, kpi.type]).toEqual(["section", "row", "column", "component"]);
    expect(kpi.component).toEqual({ definitionId: KPI_SPEC.id, definitionKey: KPI_SPEC.key, version: "1.2.0" });
    expect(kpi.props).toMatchObject({ title: { fa: "توان AC کل" }, decimals: 1 });
    expect(kpi.bindings).toEqual({ value: { bindingId: BINDING_ID } });
    for (const n of [section, row, column, kpi]) expect(n.id).toMatch(/^[a-z][a-z0-9_-]{2,63}$/);

    click(/^انتشار$/);
    await screen.findByText(/منتشر شد — نسخهٔ 1 \(از ویرایش 2\)/);
    expect(calls.find((c) => c.path.endsWith("/publish"))!.body).toEqual({ revisionNo: 2 });
  });

  it("shows a conflict instead of overwriting when someone else saved (412)", async () => {
    fakeApi({ saveStatus: 412 });
    render(<Editor project={project} page={page} onBack={() => {}} />);
    await screen.findByRole("button", { name: "root" });
    click(/\+ section/);
    click(/^ذخیره$/);
    const alert = (await screen.findByText(/تغییرات شما ذخیره نشد/)).closest('[role="alert"]')!;
    expect(alert.textContent).toContain('"rev-7"');
    expect((screen.getByRole("button", { name: /^ذخیره$/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("allows dragging and dropping elements directly on the canvas", async () => {
    fakeApi();
    const { container } = render(<Editor project={project} page={page} onBack={() => {}} />);
    await screen.findByRole("button", { name: "root" });

    // Add first section
    click(/\+ section/);
    await screen.findByRole("button", { name: "section" });

    // Add second section
    click(/\+ section/);
    const sections = await screen.findAllByRole("button", { name: "section" });
    expect(sections.length).toBe(2);

    // Canvas elements have data-node-id and are draggable
    const firstCanvasNode = container.querySelector('.selectable[draggable="true"]') as HTMLElement;
    expect(firstCanvasNode).toBeTruthy();
    expect(firstCanvasNode.getAttribute("draggable")).toBe("true");

    // Test drag start on canvas element
    const dt = {
      setData: vi.fn(),
      getData: vi.fn(),
      effectAllowed: "move",
      dropEffect: "move",
    };
    fireEvent.dragStart(firstCanvasNode, { dataTransfer: dt });
    expect(dt.setData).toHaveBeenCalled();
  });
});
