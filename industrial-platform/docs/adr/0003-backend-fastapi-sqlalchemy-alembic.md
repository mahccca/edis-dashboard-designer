# ADR-0003 — Backend: FastAPI + Pydantic v2 + SQLAlchemy 2 + Alembic

**وضعیت:** Partially superseded by [ADR-0015](0015-mongodb-single-datastore.md) (2026-11-01) — لایهٔ داده (SQLAlchemy، psycopg، Alembic، testcontainers-postgres) با PyMongo همگام، migrationهای `app/migrations` و تست روی replica set واقعی MongoDB جایگزین شد. FastAPI/Pydantic/contract-first/argon2 همچنان Accepted. · **تاریخ:** 2026-10-27

## Context
نیاز به API با OpenAPI، WebSocket برای دادهٔ زنده، validation قوی JSON، کار عددی برای مدل‌ها و ORM بالغ با migration.

## Decision
- **Python 3.13**، **FastAPI**، **Pydantic v2**، **SQLAlchemy 2.0 (async) + psycopg 3**، **Alembic**، uvicorn.
- **Contract-first**: `contracts/openapi/openapi.yaml` منبع حقیقت است؛ تست CI مقایسهٔ مسیرها/operationIdهای OpenAPI تولیدی FastAPI با فایل قرارداد (drift test). JSON Schemaهای `contracts/schemas` در runtime با `jsonschema` برای JSONBها اعمال می‌شوند و مدل‌های Pydantic برای envelopeهای API.
- Password hashing: `argon2-cffi`. Logging: ساختاریافته (JSON) با request id.
- Test: pytest + **testcontainers-postgres** (DB واقعی، نه SQLite — رفتار JSONB/قفل‌ها باید واقعی باشد).
- Lint/type: ruff + mypy (strict برای `modeling/engine`).

## Alternatives
- Django + DRF: admin و ORM خوب ولی async/WebSocket و OpenAPI 3.1 ضعیف‌تر؛ سبک ORM با الگوی ماژولار ما کمتر جور است.
- Node/NestJS: یک زبان با فرانت، ولی اکوسیستم عددی/علمی Python برای مدل‌سازی آینده مهم است.
- SQLModel: لایهٔ اضافه روی SQLAlchemy؛ جداسازی مدل DB و DTO را مبهم می‌کند.

## Consequences
- + OpenAPI خودکار، async برای WS و I/O به SCADA.
- − async SQLAlchemy نیازمند دقت (lazy loading ممنوع؛ `selectinload` صریح).

## یادداشت پیاده‌سازی VS-1 (2026-10-28)
- **Session همگام (sync) به‌جای async:** endpointهای REST تابع معمولی هستند و FastAPI آن‌ها را در threadpool اجرا می‌کند؛ فقط `/api/v1/runtime/ws` async است و کار DB را با `run_in_threadpool` + `new_session()` انجام می‌دهد. دلیل: سادگی تراکنش‌ها و قفل‌ها (`SELECT … FOR UPDATE` در save/publish) و تست‌پذیری؛ بار v1 (A-06) نیازی به async DB ندارد. بازنگری اگر تعداد اتصال WS یا I/O به SCADA گلوگاه شد.
- **تست DB واقعی بدون testcontainers:** Docker روی ماشین توسعه نصب نیست؛ `tests/conftest.py` روی `IP_TEST_DATABASE_URL` یک DB یکتا `ip_test_<hex>` می‌سازد، migration واقعی Alembic را اجرا و در پایان drop می‌کند. بدون این متغیر تست‌های integration با دلیل صریح skip می‌شوند.
- **Drift test:** `tests/unit/test_contract_drift.py` بررسی می‌کند هر مسیر سرو‌شده در `contracts/openapi/openapi.yaml` وجود داشته باشد (VS-1 زیرمجموعه‌ای از قرارداد را پیاده می‌کند).
- ruff/mypy هنوز در CI اجرا نمی‌شوند (CI راه‌اندازی نشده).
