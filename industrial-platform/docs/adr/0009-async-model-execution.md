# ADR-0009 — اجرای async مدل: صف مبتنی بر PostgreSQL (بدون Celery/Redis در v1)

**وضعیت:** Accepted (2026-10-27); صف PostgreSQL (`FOR UPDATE SKIP LOCKED`، `LISTEN/NOTIFY`، advisory lock) Superseded by [ADR-0015 §8](0015-mongodb-single-datastore.md) — collection `model_runs` با claim اتمیک `find_one_and_update` + lease/heartbeat و change stream. subprocess، timeout، heartbeat/reaper و «بدون Celery/Redis در v1» بدون تغییر. (هنوز پیاده نشده.) · **تاریخ:** 2026-10-27

## Context
اجرای مدل باید غیرهم‌زمان، با timeout، محدودیت منابع، قابل لغو و با ذخیرهٔ نتایج باشد. حجم v1: اجرای دستی، چند اجرا در دقیقه، هر اجرا میلی‌ثانیه تا چند ثانیه. Batch/schedule/event بعداً.

## Decision
- **صف = جدول `model_runs`**. API ردیف `queued` درج می‌کند (در همان تراکنش با audit؛ idempotency با `UQ(project_id, idempotency_key)`) و `NOTIFY model_runs` می‌زند.
- **Worker** (پروسهٔ جدا، همان image): `LISTEN` + polling پشتیبان هر ۲ ثانیه؛ claim با
  `UPDATE model_runs SET status='running', worker_id=$1, started_at=now(), heartbeat_at=now() WHERE id = (SELECT id FROM model_runs WHERE status='queued' ORDER BY queued_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`.
- اجرا در **subprocess** (`multiprocessing` با `spawn`) با: timeout سخت (`execution.timeoutMs` ≤ 60s، kill پس از آن → `timed_out`)، `resource.setrlimit` برای حافظه/CPU روی Linux، شمارندهٔ گام evaluator، بدون دسترسی شبکه/DB در فرزند (ورودی‌ها قبلاً resolve و serialize شده‌اند).
- Heartbeat هر ۵ ثانیه؛ reaper اجراهای `running` با heartbeat قدیمی‌تر از ۳۰ ثانیه را `failed(code=internal, worker_lost)` یا retry (حداکثر ۱ بار؛ فقط مدل‌های قطعی) می‌کند.
- همزمانی: `WORKER_CONCURRENCY` (پیش‌فرض ۲)؛ rate limit per-project در API (429).
- Schedule (فاز ۷): جدول `model_schedules` + همان worker به‌عنوان scheduler (با advisory lock تا فقط یک instance زمان‌بندی کند).

## چرا Celery/Redis نه (در v1)
- یک جزء زیرساختی اضافه (Redis) برای بار کم؛ تراکنش «درج اجرا + audit» با صف خارجی اتمیک نیست (outbox لازم می‌شد).
- وضعیت اجرا به هر حال باید در PostgreSQL باشد (نتایج، تاریخچه، UI).
- **معیار بازنگری** (هر کدام): > ۵۰ اجرا/ثانیه پایدار، نیاز به fan-out صدها کار موازی، چند instance api با WS که pub/sub لازم دارد، یا اجرای طولانی (> ۱ دقیقه) با توزیع روی چند ماشین. آن‌گاه: Redis + (Dramatiq یا Celery) با الگوی outbox.

## Consequences
- + زیرساخت کمتر؛ تراکنش‌پذیری؛ قابل مشاهده با SQL.
- − polling/LISTEN باید درست پیاده شود؛ روی Windows، `setrlimit` موجود نیست (توسعه روی Docker/Linux).
