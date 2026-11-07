# ADR-0004 — PostgreSQL: JSONB برای اسناد، ستون برای metadata

**وضعیت:** Superseded by [ADR-0015](0015-mongodb-single-datastore.md) (2026-11-01) · **تاریخ:** 2026-10-27

> این ADR فقط برای سابقه نگه داشته شده است. پروژه دیگر از PostgreSQL استفاده نمی‌کند.

## Context
اسناد طراحی درختی، متغیر و تو در تو هستند؛ ولی مالکیت، وضعیت انتشار، نسخه، مسیر URL و ارجاع‌ها باید integrity و query کارا داشته باشند.

## Decision
- **PostgreSQL 18**.
- محتوای سند (`document_revisions.content`)، spec کامپوننت/نوع شیء/مدل، tokens تم و bundle انتشار در **JSONB**.
- همهٔ داده‌هایی که روی آن‌ها filter/join/unique/FK/authz داریم **ستون** هستند؛ ارجاع‌های مهم داخل JSON به ستون/جدول مشتق استخراج می‌شوند (`component_usages`, `data_bindings.object_id/model_id`, `published_version_pins`).
- اعتبارسنجی JSONB در لایهٔ اپلیکیشن با JSON Schema قبل از write؛ DB فقط `CHECK (jsonb_typeof(content) = 'object')` و `schema_version`.
- ایندکس GIN روی JSONB **فقط در صورت نیاز اثبات‌شده**؛ در v1 لازم نیست چون ارجاع‌ها استخراج شده‌اند.
- Class-table inheritance برای اسناد (`documents` + `pages`/`templates`/`template_parts`).

## Alternatives
- همه‌چیز رابطه‌ای (جدول node): هر save = صدها ردیف، بازسازی درخت پرهزینه، migration سخت.
- Document DB (MongoDB): integrity رابطه‌ای و تراکنش publish ضعیف‌تر؛ دو پایگاه داده.

## Consequences
- + save/load سند یک ردیف؛ snapshot ساده؛ revision ارزان.
- + FK واقعی برای چیزهای مهم.
- − همگام نگه‌داشتن جداول مشتق با JSON در همان تراکنش الزامی است (تست‌های قراردادی).
