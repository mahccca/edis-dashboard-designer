# ADR-0015 — MongoDB به‌عنوان تنها datastore (جایگزین PostgreSQL)

**وضعیت:** Accepted (2026-11-01) · **تاریخ:** 2026-11-01
**جایگزین:** ADR-0004 (کامل)، بخش DB از ADR-0003 (SQLAlchemy/Alembic/psycopg)، بند trigger در ADR-0006، صف PostgreSQL در ADR-0009.

## Context
تصمیم کاربر (2026-11-01): PostgreSQL استفاده نشود؛ اگر پایگاه داده لازم است باید MongoDB باشد. قرارداد عمومی HTTP/WebSocket (`contracts/openapi/openapi.yaml`) و در نتیجه فرانت‌اند **بدون تغییر** می‌ماند. ضمانت‌هایی که PostgreSQL می‌داد (FK، UNIQUE جزئی، trigger تغییرناپذیری، `SELECT … FOR UPDATE`، تراکنش چندجدولی، Alembic) باید صریحاً جایگزین یا محدودیتشان مستند شود.

## Decision

### 1. موتور و driver
- **MongoDB Community 9.0** به‌صورت **replica set** (در dev: تک‌عضوی `rs0` روی `127.0.0.1:27018`؛ تراکنش چندسندی فقط روی replica set کار می‌کند).
- **PyMongo همگام (sync)**. دلیل: لایهٔ API از قبل sync است (ADR-0003 یادداشت VS-1: endpointها در threadpool، WS با `run_in_threadpool`)؛ API `ClientSession`/تراکنش PyMongo sync ساده و قطعی است؛ Motor/async فقط وقتی ارزش دارد که I/O پایگاه داده گلوگاه شود (A-06: بار v1 کم). بازنگری با همان معیار ADR-0003.
- لایه‌بندی API → Service → Repository حفظ شد: `app/core/db.py` (`Db`, `Entity`, `Repo`, `AppendOnlyRepo`)؛ هر ماژول در `models.py` dataclassها و repositoryهایش را تعریف می‌کند.

### 2. طراحی collectionها (embed در برابر reference)
| collection | توضیح | embed / reference |
|---|---|---|
| `users`, `sessions`, `projects`, `project_members` | مثل قبل | عضویت reference (پرس‌وجو در دو جهت user↔project) |
| `roles` | `{_id: roleKey, permissions: [...]}` | **embed** `role_permissions` (همیشه با هم خوانده می‌شوند) |
| `permissions` | کاتالوگ | — |
| `component_definitions`, `component_versions` | | reference (نسخه‌ها مستقل pin می‌شوند) |
| `industrial_object_types`, `industrial_object_type_versions` | | reference |
| `industrial_objects` | `relations: [{relation_key, target_object_id}]` | **embed** `object_relations` (multikey index روی target) |
| `data_sources`, `data_bindings` | | reference |
| `documents` | سرآیند سند + `head_revision_no` + `live_published_version_id` + `component_usages: [...]` | **embed** `component_usages` (مشتق از head؛ با همان update شرطی بازنویسی می‌شود) |
| `pages` | `_id` = id سند؛ slug/path/`archived` | reference 1:1 (ایندکس‌های یکتای مسیر فقط اینجا) |
| `document_revisions` | محتوای کامل هر revision | جدا (رشد نامحدود؛ سقف ۱۶MB سند Mongo) |
| `published_versions` | bundle + `pin_component_version_ids` | **embed** `published_version_pins` (همراه bundle تغییرناپذیرند) |
| `audit_logs` | | جدا، فقط append |
| `schema_migrations` | migrationهای اعمال‌شده + lease قفل | — |

محتوای JSON کاربر (سند، bundle، spec) همان‌طور ذخیره می‌شود؛ روی سرور 9.0 کلیدهای تو در توی `$schema` و نقطه‌دار در insert و `$set` آزموده و پذیرفته شدند.

### 3. شناسه‌ها
- `_id` و همهٔ فیلدهای `*_id` = **UUIDv7 به‌صورت رشتهٔ canonical** (`uuid7()` قبلی حفظ شد) ⇒ شناسه‌های API تغییر نکرد. نه ObjectId، نه BSON Binary UUID (خوانایی، و برابری مستقیم با مقادیر داخل JSON اسناد). استثنا: `roles`/`permissions` با کلید متنی.
- تبدیل `uuid.UUID` ↔ رشته فقط در `core/db.py` (`encode`, `Entity.from_doc`).

### 4. تغییرناپذیری بدون trigger
دو لایه:
1. **اپلیکیشن:** `AppendOnlyRepo` فقط `insert/get/find/count` دارد (هیچ متد update/delete). `document_revisions`، `published_versions`، `audit_logs` و `component_versions` فقط از این نوع در دسترس‌اند.
2. **سرور (نقش محدود):** API با کاربر `ip_app` با نقش سفارشی `ipApp` وصل می‌شود (`app/core/mongo_roles.py`، `python -m app.cli provision-app-user`):
   - تاریخچه (`document_revisions`, `published_versions`, `audit_logs`, `component_versions`): فقط `find` + `insert`.
   - کاتالوگ (`roles`, `permissions`, `component_definitions`, `schema_migrations`): فقط `find`.
   - بقیه: `find/insert/update/remove`. بدون هیچ اقدام DDL (drop، index، collMod، createCollection).
   - تست‌ها با همین کاربر اجرا می‌شوند و update/delete/replace روی تاریخچه، تغییر نقش‌ها، drop collection/index را با خطای `13 Unauthorized` ثابت می‌کنند.

**چه تضمین می‌شود:** با هویت اپلیکیشن، هیچ سند تاریخچه/audit/نسخهٔ کامپوننت قابل تغییر یا حذف نیست، حتی با باگ یا تزریق در کد.
**چه تضمین نمی‌شود:** (الف) هویت admin/migration می‌تواند تغییر دهد (معادل superuser در PG که trigger را غیرفعال می‌کند) — باید در production جدا و محدود نگه‌داری شود؛ (ب) کنترل سطح فیلد وجود ندارد: وقتی ویرایش draft کامپوننت‌ها بیاید، `update` روی `component_versions` لازم می‌شود و آنگاه «spec نسخهٔ published تغییر نکند» فقط با filter `{status: "draft"}` در repository تضمین می‌شود (guard trigger قبلی PG حذف شد)؛ (ج) insert سند جعلی با شمارهٔ جدید ممکن است (در PG هم بود)؛ unique index تکرار شماره را رد می‌کند.

### 5. هم‌روندی خوش‌بینانه (جایگزین `SELECT … FOR UPDATE`)
- هر درخواست = یک **تراکنش** (`readConcern: snapshot`, `writeConcern: majority`)؛ `db.commit()` کامیت و تراکنش بعدی را شروع می‌کند؛ هر چیز کامیت‌نشده در `close()` abort می‌شود. پس publish (نسخه + pointer زنده + audit)، archive (سند + صفحه + audit) و ساخت صفحه (سند + صفحه + revision + audit) اتمیک‌اند.
- API ابتدا `If-Match` را با مقدار خوانده‌شده چک می‌کند (428/412 مثل قبل)؛ سپس write **شرطی** است: `update_one({_id, head_revision_no: expected, status: {$ne: archived}}, …)` و برای data source `{lock_version: expected}`؛ اگر `matchedCount == 0` ⇒ **412** با `currentEtag` تازه.
- دو نویسندهٔ هم‌زمان در حال پرواز: Mongo به دومی `WriteConflict` (برچسب `TransientTransactionError`) می‌دهد؛ handler سراسری آن را برای درخواست‌های دارای `If-Match` به **412** و در غیر این صورت به **409 `write_conflict`** نگاشت می‌کند.
- publish هم‌زمان: unique `(document_id, version_no)` + update شرطی روی `live_published_version_id`.

### 6. Migration (جایگزین Alembic)
- `app/migrations/mNNNN_*.py` با `ID`, `DESCRIPTION`, `up(db)`؛ **forward-only** و **idempotent** (create-if-missing، upsert seed)؛ ثبت در `schema_migrations`؛ قفل lease (`_id: "~lock"`, ۱۰ دقیقه) برای جلوگیری از اجرای هم‌زمان.
- collectionها، **`$jsonSchema` validator** (strict/error: فیلدهای اجباری، الگوی UUID، enum وضعیت، و جایگزین CHECK قدیمی `data_bindings`) و همهٔ ایندکس‌ها در migration ساخته می‌شوند؛ seed نقش‌ها/مجوزها و `kpi-card@1.2.0` در `0001`.
- `python -m app.cli migrate` (با `IP_MONGODB_ADMIN_URL`) و `migrate --check` (جایگزین `alembic check`: migration معلق یا اختلاف ایندکس ⇒ exit 1).
- migrationِ اعمال‌شده ویرایش نمی‌شود؛ downgrade وجود ندارد (جبران با migration جدید؛ بازیابی با backup).

### 7. ایندکس‌ها (migration 0001)
- یکتا: `users.username`؛ `sessions.token_hash`؛ `project_members(project_id,user_id)`؛ `projects.slug`؛ `component_definitions(project_id,key)` (null = کتابخانهٔ سراسری و در ایندکس یکتا شرکت می‌کند ⇒ جایگزین دو ایندکس جزئی PG)؛ `component_versions(definition_id,major,minor,patch)`؛ `industrial_object_types(project_id,key)`؛ `…_type_versions(type_id,major,minor,patch)`؛ `industrial_objects(project_id,key)`؛ `data_sources(project_id,name)`؛ `document_revisions(document_id,revision_no)`؛ `published_versions(document_id,version_no)`.
- **یکتای جزئی** برای صفحات غیرآرشیو: `pages(project_id,path)` و `pages(project_id,slug)` با `partialFilterExpression: {archived: false}` — فیلد بولی صریح چون partial index برابری با `null` را پشتیبانی نمی‌کند.
- TTL: `sessions.expires_at` (حذف ۷ روز پس از انقضا). بقیه: ایندکس‌های جست‌وجو/ارجاع (`documents.component_usages.component_version_id`, `published_versions.pin_component_version_ids`, `industrial_objects.relations.target_object_id`, audit).

### 8. صف کار (برای ADR-0009)
اکنون صفی پیاده نشده است. وقتی اجرای مدل بیاید: collection `model_runs` با claim اتمیک
`find_one_and_update({status: "queued"} یا {status: "running", lease_until < now}, {$set: {status: "running", worker_id, lease_until: now+30s}}, sort: queued_at)`، تمدید lease با heartbeat، `UQ(project_id, idempotency_key)`، و درج اجرا + audit در یک تراکنش. بیدارباش با change stream روی `model_runs` (به‌جای LISTEN/NOTIFY) + polling پشتیبان. Celery/Redis همچنان کنار گذاشته شده‌اند (همان معیار بازنگری ADR-0009).

## جدول جایگزینی ضمانت‌های PostgreSQL
| PostgreSQL | MongoDB |
|---|---|
| FK + `ON DELETE RESTRICT` | ارجاع با id؛ وجود و هم‌پروژه بودن در Service بررسی می‌شود؛ هیچ مسیر حذفی برای موجودیت‌های ارجاع‌شده وجود ندارد (حذف صفحه = archive؛ تاریخچه فقط insert). **FK سمت سرور وجود ندارد.** |
| UNIQUE / UNIQUE جزئی | unique index / partial unique index |
| CHECK, NOT NULL, نوع ستون | `$jsonSchema` validator |
| trigger تغییرناپذیری | `AppendOnlyRepo` + نقش `ipApp` (find+insert) |
| trigger guard نسخهٔ کامپوننت | نقش (فعلاً بدون update)؛ در آینده filter `status: draft` در repository |
| `SELECT … FOR UPDATE` | تراکنش snapshot + update شرطی (412) + WriteConflict (412/409) |
| تراکنش چندجدولی | تراکنش چندسندی replica set |
| Alembic + `alembic check` | `app/migrations` + `schema_migrations` + `migrate --check` |
| `ILIKE` | `$regex` با `re.escape` و گزینهٔ `i` |
| صف `FOR UPDATE SKIP LOCKED` + LISTEN | `find_one_and_update` + lease + change stream (طراحی) |

## Alternatives
- **PostgreSQL** (وضع قبلی): رد شده به تصمیم کاربر.
- **Motor/async PyMongo:** فعلاً لازم نیست (بالا).
- **ObjectId یا BSON UUID برای `_id`:** شناسه‌های API تغییر می‌کرد یا مقایسه با idهای درون JSON اسناد نیازمند تبدیل بود.
- **همهٔ صفحه/revisionها embed در یک سند:** سقف ۱۶MB و write amplification؛ تاریخچه قابل محدودسازی دسترسی جدا نبود.
- **mongomock در تست‌ها:** رد شد — تراکنش، validator، partial index و نقش‌ها را واقعی شبیه‌سازی نمی‌کند.

## Consequences
- + یک datastore؛ اسناد JSON طبیعی ذخیره می‌شوند؛ نقش محدود سرور، تغییرناپذیری را حتی در برابر باگ اپلیکیشن تضمین می‌کند.
- − یکپارچگی ارجاعی (FK) فقط در اپلیکیشن است؛ هر مسیر حذف آینده باید ارجاع‌ها را صریحاً بررسی کند.
- − replica set (حتی تک‌عضوی) و keyFile الزامی است؛ اتصال API و migration با دو هویت جدا.
- − دقت زمان به میلی‌ثانیه محدود است (`utcnow()` همین را برمی‌گرداند).
- تست‌ها: `IP_TEST_MONGODB_URL` (هویت admin) ⇒ DB یکبارمصرف `ip_test_<hex>` با migration واقعی، نقش و کاربر محدود؛ API زیر تست با کاربر محدود اجرا می‌شود؛ در پایان کاربر/نقش/DB حذف می‌شوند.
