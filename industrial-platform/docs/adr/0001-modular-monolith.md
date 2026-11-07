# ADR-0001 — Modular Monolith

**وضعیت:** Accepted (2026-10-27) · **تاریخ:** 2026-10-27

## Context
دامنه گسترده است (طراحی، اشیاء صنعتی، داده، مدل‌سازی، انتشار، runtime) ولی تیم کوچک، استقرار on-prem و بار پیش‌بینی‌شده متوسط است (A-06). الزام صریح: بدون microservice. عملیات انتشار باید اتمیک بین چند حوزه باشد (سند + pin کامپوننت + snapshot binding).

## Decision
- یک backend (FastAPI) با ماژول‌های دامنه‌ای: `iam, projects, design, components, industrial_objects, data_sources, data_bindings, modeling, model_runs, publishing, runtime, audit`.
- یک پایگاه داده؛ هر ماژول مالک جدول‌های خودش است (prefix منطقی، نه schema جدا در v1).
- ماژول‌ها فقط از طریق `service.py` عمومی همدیگر را صدا می‌زنند؛ import مستقیم `models/repository` ماژول دیگر ممنوع و با **import-linter** در CI بررسی می‌شود.
- دو پروسه از یک image: `api` و `worker` (اجرای مدل). این تقسیم «deployment unit» است، نه سرویس مستقل.
- رویدادهای داخلی با event bus درون‌پروسه‌ای و `LISTEN/NOTIFY` برای اطلاع‌رسانی بین پروسه‌ها.

## Alternatives
- **Microservices**: هزینهٔ عملیاتی، تراکنش توزیع‌شده برای publish، ممنوع طبق الزام.
- **Monolith بدون مرز**: سریع در ابتدا ولی coupling بین editor و runtime و موتور مدل که باید جدا بمانند.

## Consequences
- + تراکنش ACID برای publish و save؛ یک استقرار؛ debug ساده.
- + مرزهای صریح امکان استخراج بعدی (مثلاً worker مدل‌سازی) را حفظ می‌کند.
- − نیاز به انضباط (lint قواعد import، بازبینی کد).
- − مقیاس افقی api ممکن است ولی WS gateway در چند instance به pub/sub نیاز دارد (آن‌موقع Redis — ADR-0012).
