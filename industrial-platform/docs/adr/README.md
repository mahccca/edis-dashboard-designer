# Architecture Decision Records

قالب: Context → Decision → Alternatives → Consequences. وضعیت‌ها: `Proposed` (منتظر تأیید کاربر)، `Accepted`، `Superseded by ADR-xxxx`.

| ADR | عنوان | وضعیت |
|---|---|---|
| [0001](0001-modular-monolith.md) | Modular Monolith | Accepted |
| [0002](0002-frontend-react-vite-ts.md) | Frontend: React + TypeScript + Vite (+ dnd-kit, ECharts) | Accepted |
| [0003](0003-backend-fastapi-sqlalchemy-alembic.md) | Backend: FastAPI + Pydantic v2 + SQLAlchemy 2 + Alembic | لایهٔ داده Superseded by 0015؛ بقیه Accepted |
| [0004](0004-postgres-jsonb-documents.md) | PostgreSQL: JSONB برای اسناد + ستون‌های رابطه‌ای برای metadata | Superseded by 0015 |
| [0005](0005-document-schema-versioning.md) | نسخه‌بندی schema اسناد و migration | Accepted |
| [0006](0006-immutable-published-versions.md) | نسخه‌های منتشرشدهٔ تغییرناپذیر و pin‌شده | Accepted (سازوکار trigger → 0015) |
| [0007](0007-schema-driven-components.md) | کامپوننت‌های schema-driven، بدون کد کاربر | Accepted |
| [0008](0008-safe-formula-evaluation.md) | ارزیابی امن فرمول (parser + AST + whitelist) | Accepted |
| [0009](0009-async-model-execution.md) | اجرای async مدل: صف مبتنی بر PostgreSQL، بدون Celery/Redis در v1 | Accepted (صف → collection MongoDB، 0015 §8) |
| [0010](0010-authentication-authorization.md) | احراز هویت (session cookie) و RBAC سطح پروژه | Accepted |
| [0011](0011-css-modules-design-tokens.md) | CSS Modules + design tokens به‌صورت CSS custom properties | Accepted |
| [0012](0012-live-data-gateway.md) | Gateway دادهٔ زنده سمت سرور (WebSocket) و adapter منبع داده | Accepted (اصلاحیه: منبع simulated) |
| [0013](0013-api-conventions.md) | قراردادهای API: OpenAPI 3.1 contract-first، problem+json، ETag/If-Match، cursor pagination | Accepted |
| [0014](0014-data-bindings-as-entities.md) | DataBinding به‌عنوان موجودیت مستقل، ارجاع با id از سند | Accepted |
| [0015](0015-mongodb-single-datastore.md) | MongoDB (replica set) به‌عنوان تنها datastore؛ تغییرناپذیری با نقش محدود، update شرطی، migrationهای Python | Accepted |
| [0016](0016-dynamic-api-binding-engine.md) | موتور مدیریت API پویا، schema discovery، fieldPath، repeater | Accepted |
