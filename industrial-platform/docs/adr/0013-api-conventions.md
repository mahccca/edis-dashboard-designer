# ADR-0013 — قراردادهای API

**وضعیت:** Accepted (2026-10-27) · **تاریخ:** 2026-10-27

## Decision
- **Contract-first**: `contracts/openapi/openapi.yaml` (OpenAPI 3.1، dialect JSON Schema 2020-12) که برای اسناد مستقیماً به `contracts/schemas/*.json` ارجاع می‌دهد (یک منبع حقیقت). CI: `openapi-spec-validator` + تست‌های `contracts/tests/test_openapi.py` + drift test با OpenAPI تولیدی FastAPI (از فاز ۱).
- **نسخه‌بندی**: `/api/v1`؛ فقط تغییرات افزایشی در v1؛ breaking = `/api/v2` با دورهٔ هم‌زیستی. نسخهٔ محتوای JSON مستقل (`schemaVersion`).
- **خطا**: RFC 9457 `application/problem+json` با `code` پایدار و `errors[].pointer` (JSON Pointer).
- **Concurrency**: ETag قوی؛ `If-Match` الزامی برای PUT/PATCH/DELETE منابع mutable (428 اگر نباشد، 412 + `currentEtag` اگر کهنه باشد).
- **Pagination**: cursor مبهم (base64 از `(sort_key, id)`)، `limit ≤ 200`؛ پاسخ `{items, nextCursor}`. بدون offset (پایداری در درج هم‌زمان).
- **Filtering/sorting**: پارامترهای صریح per-endpoint؛ `sort` از whitelist.
- **Idempotency**: `Idempotency-Key` برای publish و model run (۲۴ ساعت).
- **PATCH**: `application/merge-patch+json` (RFC 7396) فقط برای metadata؛ محتوای سند با PUT کامل.
- **Permissions**: افزونهٔ `x-permission` روی هر operation (مستندسازی + تست).
- **Async**: `202 Accepted` + `Location` برای کارهای طولانی.
- **WebSocket**: مستند در ADR-0012 / `docs/api/api-conventions.md`؛ AsyncAPI در فاز ۵ در صورت رشد پیام‌ها.
