# ADR-0005 — نسخه‌بندی schema اسناد و migration

**وضعیت:** Accepted (2026-10-27) · **تاریخ:** 2026-10-27

## Context
قالب سند در طول پروژه تغییر خواهد کرد. revisionهای قدیمی و bundleهای منتشرشده باید خوانا بمانند، و bundleها نباید بازنویسی شوند (ADR-0006).

## Decision
- هر JSON قراردادی فیلد `schemaVersion` (عدد صحیح) دارد؛ JSON Schemaها در `contracts/schemas` با `$id` نسخه‌دار (`.../schemas/v1/...`). نسخهٔ جدید = پوشهٔ `v2` + migrator.
- **Migrator** = تابع خالص و قطعی `migrate_vN_to_vN1(doc) -> doc` در backend (`document_engine/migrations`) و آینهٔ TypeScript در `shared/document-engine/migrations`؛ تست‌های مشترک با fixtureهای `contracts/examples` (هر دو پیاده‌سازی باید خروجی یکسان بدهند).
- **خواندن**: migrate-on-read تا نسخهٔ جاری؛ پاسخ API `migratedFrom` را گزارش می‌دهد. **نوشتن**: همیشه نسخهٔ جاری؛ نسخهٔ قدیمی‌تر از جاری با 422 رد می‌شود مگر از مسیر migrate.
- **Backfill**: job اختیاری که revisionهای head را به‌روز کند (revision جدید نمی‌سازد؛ head را به‌عنوان revision جدید `autosave=false, message="schema migration vN→vN+1"` ذخیره می‌کند تا تاریخچه دست نخورد).
- **Bundleهای منتشرشده** بازنویسی نمی‌شوند؛ runtime renderer حداقل نسخهٔ جاری و نسخهٔ قبلی را پشتیبانی می‌کند و برای قدیمی‌ترها upgrade درون‌حافظه‌ای انجام می‌دهد. حذف پشتیبانی یک نسخه = ADR جدید + «republish» خودکار بانظارت.
- تغییرات افزایشی سازگار (فیلد اختیاری جدید) نسخه را بالا نمی‌برند ولی باید در schema ثبت شوند؛ `additionalProperties: false` باعث می‌شود فیلد ثبت‌نشده رد شود.

## Consequences
- + تاریخچهٔ کامل و قابل اعتماد.
- − دو پیاده‌سازی migrator (Py/TS) → نیاز به تست‌های مشترک. جایگزین: فقط سرور migrate کند و editor همیشه نسخهٔ جاری دریافت کند — **پیشنهاد v1 همین است**؛ آینهٔ TS فقط وقتی لازم شد (import آفلاین).
