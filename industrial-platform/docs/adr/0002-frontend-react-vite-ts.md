# ADR-0002 — Frontend: React + TypeScript + Vite

**وضعیت:** Accepted (2026-10-27) · **تاریخ:** 2026-10-27

## Context
اپ موجود workspace با React 19 + Vite (JS) نوشته شده و تیم با آن آشناست. پلتفرم یک editor پیچیده (درخت سند، DnD، inspector تولیدشده از schema) و یک runtime سبک لازم دارد.

## Decision
- **React 19 + TypeScript (strict) + Vite**؛ یک پروژهٔ frontend با **دو entry/app**: `apps/studio` و `apps/runtime` (Vite multi-page build) تا bundle runtime شامل کد editor نباشد.
- **dnd-kit** برای DnD (accessible، sensorهای کیبورد، بدون وابستگی به HTML5 DnD).
- **Apache ECharts** (import ماژولار `echarts/core` برای کاهش حجم) برای نمودار؛ wrapper نازک خودمان، نه `echarts-for-react`.
- **React Flow (`@xyflow/react`)**: **نه در MVP**. فقط وقتی ویرایشگر گراف رابطهٔ اشیاء یا dependency graph مدل (فاز ۷+) ساخته شود اضافه می‌شود.
- **SVG** دستی برای نمادها و gaugeهای ساده.
- State: store سند با **Zustand** (کوچک، بدون boilerplate) + **TanStack Query** برای server state. (انحراف کوچک از stack پیشنهادی؛ هر دو سبک‌اند و جایگزین ساخت دستی cache/invalidations می‌شوند.)
- Validation در مرورگر: **ajv** (2020-12) با همان `contracts/schemas`.
- API client: تولید types از OpenAPI با `openapi-typescript` + `openapi-fetch` (بدون runtime سنگین).
- Routing: React Router.
- Test: Vitest + Testing Library؛ e2e: Playwright.
- **بدون** Bootstrap/MUI/Ant؛ کامپوننت‌های پایهٔ UI خودمان با CSS Modules (ADR-0011).

## Alternatives
- Next.js: SSR لازم نیست (on-prem، داشبورد پشت login)؛ پیچیدگی سرور Node اضافه.
- Redux Toolkit: سنگین‌تر از نیاز؛ undo/redo را با command pattern خودمان پیاده می‌کنیم.
- Konva/canvas برای editor: SEO/دسترس‌پذیری و رندر یکسان با runtime را از دست می‌دهیم؛ DOM + CSS انتخاب شد.

## Consequences
- + کد رندر مشترک بین preview و runtime.
- + TypeScript strict و types تولیدی از OpenAPI → تعارض قرارداد زود کشف می‌شود.
- − اپ JS موجود مهاجرت داده نمی‌شود؛ جداگانه باقی می‌ماند (تصمیم D-01).
