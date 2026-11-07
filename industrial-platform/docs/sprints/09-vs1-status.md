# ۰۹ — وضعیت اجرای اسپرینت ۱ تا ۳ (Foundations + VS-1)

تاریخ: 2026-10-28 · دامنه: [08-vertical-slice-01.md](08-vertical-slice-01.md) با اصلاحیهٔ منبع `simulated` (D-05، ADR-0012).
تغییرات commit نشده‌اند (طبق درخواست).

## به‌روزرسانی 2026-11-01 — مهاجرت به MongoDB (ADR-0015)
- PostgreSQL به تصمیم کاربر کامل حذف شد؛ datastore = **MongoDB 9.0.4** (portable، replica set `rs0`، `127.0.0.1:27018`، auth + keyFile). API عمومی و فرانت‌اند بدون تغییر.
- SQLAlchemy/Alembic/psycopg حذف؛ PyMongo همگام، `app/core/db.py` (تراکنش per-request، `Repo`/`AppendOnlyRepo`)، migrationها در `app/migrations` (`python -m app.cli migrate [--check]`)، نقش محدود `ipApp` (`provision-app-user`).
- آرشیو صفحه (DELETE = archive)، If-Match/412/428، 422، CSRF، rate limit، session، audit، مجوز topic در WS — همه حفظ و با تست پوشش داده شده‌اند.
- تست‌ها: `IP_TEST_MONGODB_URL` ⇒ DB یکبارمصرف + کاربر محدود؛ backend **79 passed، 0 skipped** (پوشش ۸۵٪)، شامل `test_mongo_guarantees.py` (تغییرناپذیری با خطای 13 سرور، validator، migration idempotent/drift، update شرطی 412، WriteConflict → 412، یکتایی جزئی slug/path). contracts 55 passed؛ OpenAPI معتبر؛ Vitest 53 passed؛ typecheck و build سبز.
- T-103: `infra/compose.yaml` اکنون mongo (replica set با initiate در healthcheck) است — **اجرا نشده** چون Docker روی این ماشین نصب نیست.
- بخش‌های زیر (تاریخ 2026-10-28) سابقهٔ اجرای روی PostgreSQL هستند.

## خلاصه
- **VS-1 در دامنهٔ اصلاح‌شده (منبع simulated): پذیرفته.** AT-1…AT-13 به‌صورت خودکار روی **PostgreSQL 17.6 واقعی** و Vitest سبز هستند. migrationها up/down سبزند، drift با OpenAPI صفر است و پوشش ماژول‌های design/publishing بین ۸۳ تا ۹۱٪ است.
- **چیزهایی که این وضعیت ادعا نمی‌کند:**
  - اتصال به SCADA واقعی؛ T-205 و AT-6/AT-7 اصلی **Blocked** هستند.
  - اجرای CI؛ T-104 شروع نشده است.
  - Docker compose؛ نوشته شده ولی روی این ماشین Docker نصب نیست.
  - e2e در مرورگر واقعی (Playwright)؛ به‌جای آن تست flow ویرایشگر در Vitest (jsdom) و smoke واقعی HTTP+WS از طریق proxy Vite انجام شد.

## اسپرینت ۱ — Foundations
| ID | کار | وضعیت | شواهد / توضیح |
|---|---|---|---|
| T-101 | Scaffold backend | Done | `backend/app/main.py`: health، problem+json، request id، هدرهای امنیتی |
| T-102 | Scaffold frontend (multi-entry، TS strict، Vitest) | Done (با جایگزین) | `index.html` + `runtime.html`. به‌جای ESLint boundaries: `src/architecture.test.ts` (گراف import). به‌جای visualizer: `scripts/check-runtime-bundle.mjs` در `npm run build`. ESLint هنوز پیکربندی نشده است |
| T-103 | Docker Compose + `.env.example` | **Blocked** (بخشی) | `infra/compose.yaml` فقط postgres دارد و `.env.example` با placeholder ساخته شد. Docker روی این ماشین نصب نیست، پس `docker compose up` **اجرا نشد**. سرویس‌های api/web و gitleaks هنوز نیستند |
| T-104 | CI | Not started | پیکربندی CI وجود ندارد؛ push هم انجام نشد |
| T-105 | Alembic baseline + seed | Done | `0001_initial_schema` (همهٔ جداول VS-1، triggerهای تغییرناپذیری، seed مجوزها و KPI). upgrade→downgrade→upgrade سبز؛ `alembic check` بدون اختلاف |
| T-106 | iam: login/logout/me، cookie، CSRF، Argon2id، rate limit | Done | تست‌های `test_at1`، `test_at9` (CSRF گم‌شده → 403) و `test_t106_login_rate_limit` (۱۰ شکست → 429) |
| T-107 | authz و تست «هر route مجوز دارد» | Done | `tests/unit/test_route_security.py` |
| T-108 | projects + ETag/If-Match helper | In Progress | ساخت/لیست پروژه، 428/412، و 404 برای غیرعضو انجام شده است. **API مدیریت اعضا پیاده نشده** (اعضا فقط از CLI/seed) |
| T-109 | OpenAPI drift test | Done | `tests/unit/test_contract_drift.py`: مسیرهای سرو‌شده ⊆ قرارداد. دو مسیر جاافتاده (`GET /health`، `GET /data-bindings/{id}`) به قرارداد اضافه شد. مقایسهٔ operationId هنوز انجام نمی‌شود |
| T-110 | تأیید قرارداد SCADA | **Blocked** | منتظر مستندات/حساب سرویس SCADA (R-01) |
| T-111 | Frontend: login + پروژه‌ها | Done (با انحراف) | `src/modules/platform/*`. API client دستی است (`src/shared/api`)؛ تولید با openapi-typescript به تعویق افتاد |

## اسپرینت ۲ و ۳ — VS-1
| ID | کار | وضعیت | شواهد / توضیح |
|---|---|---|---|
| T-201 | pages/documents/revisions + If-Match | Done | `modules/design`؛ AT-3، AT-8 (تغییرناپذیری revision در DB) |
| T-202 | validation سند سرور | Done | `document_engine.py`؛ AT-4 (×5)، `test_document_engine.py`، تست مثال قرارداد |
| T-203 | components + seed KPI + `/renderers` | Done | `modules/components`؛ `kpi-card@1.2.0` در migration |
| T-204 | object types/objects | Done | `modules/industrial_objects`؛ seed پایلوت `app.cli seed-pilot` |
| T-205 | adapter `scada_http_ws` | **Blocked** | به T-110 وابسته است. stub مستند پشت `IP_FEATURE_SCADA_ADAPTER` (پیش‌فرض false) → 422 `adapter_not_available` / 501 `adapter_not_implemented` |
| T-205a | adapter `simulated` + برچسب دادهٔ آزمایشی | Done | `adapters/simulated.py`؛ `test_adapters.py`، AT-6، AT-7، AT-13 |
| T-206 | data_bindings + value | Done | `modules/data_bindings`، `modules/live_values`؛ AT-7 |
| T-207 | publishing (bundle، pins، activate) | Done | AT-5، AT-8 (hash ثابت، UPDATE روی `published_versions` → خطای DB) |
| T-208 | runtime resolve + WS | Done | AT-10. معیار «تأخیر < ۲ ثانیه از SCADA» برای منبع simulated موضوعیت ندارد (push هر ۱ ثانیه) |
| T-209 | editor-lite | Done | `modules/page-builder`؛ `Editor.test.tsx` (ساخت section › row › column › KPI، تنظیم props، ساخت binding، save، publish)، undo/redo در `document-engine.test.ts`. **DnD عمداً نیست (S4)** |
| T-210 | shared/rendering + KPI renderer + style engine | Done | `shared/rendering`، `shared/renderers/KpiCard.tsx`، `shared/style-engine`؛ تست‌های Vitest |
| T-211 | runtime app | Done | `apps/runtime`؛ `RuntimePage.test.tsx`؛ smoke واقعی HTTP+WS از طریق proxy Vite |
| T-212 | Save/Publish UI + 412 | Done | `Editor.test.tsx` (پیام conflict، رونویسی نشدن) |
| T-213 | e2e + CI | In Progress | Playwright و CI وجود ندارند. جایگزین فعلی: integration روی PG واقعی + flow ویرایشگر در jsdom + smoke دستی |

## نتایج تست‌های پذیرش VS-1
| AT | نتیجه | تست |
|---|---|---|
| AT-1 login + ساخت پروژه | Pass | `test_at1_login_cookie_and_project` |
| AT-2 ساخت صفحه و KPI بدون کد | Pass | `test_at2_build_page_with_bound_kpi` (API) + `Editor.test.tsx` (UI در jsdom؛ در مرورگر واقعی اجرا نشد) |
| AT-3 save هم‌زمان → 412 | Pass | `test_at3_concurrent_save_gets_412` + تست conflict در `Editor.test.tsx` |
| AT-4 سند دست‌کاری‌شده → 422 | Pass | `test_at4_tampered_documents_rejected` (×5) |
| AT-5 publish + pins | Pass | `test_at5_publish_pins_and_bundle` |
| AT-6 (اصلاح‌شده) مقدار برابر منبع simulated | Pass | `test_at6_runtime_value_matches_simulated_source` |
| AT-6 (اصلی) مقدار برابر SCADA واقعی | **Blocked** | T-110/T-205 |
| AT-7 (اصلاح‌شده) قطع منبع → no_data | Pass | `test_at7_outage_shows_no_data_and_recovers` + `KpiCard.test.tsx` (هیچ عددی نمایش داده نمی‌شود) |
| AT-7 (اصلی) قطع SCADA واقعی | **Blocked** | T-110/T-205 |
| AT-8 activate نسخهٔ قبلی + تغییرناپذیری | Pass | `test_at8_activate_previous_version_and_immutability` |
| AT-9 پروژهٔ دیگر → 404؛ نقش‌ها | Pass | `test_at9_cross_project_and_role_checks` |
| AT-10 topic خارج از bundle | Pass | `test_at10_ws_topic_authorization_and_live_values` + smoke WS |
| AT-11 بدون secret / بدون کد studio در runtime | Pass | `test_at11_…` (پاسخ‌های API) + `check-runtime-bundle.mjs` + `architecture.test.ts` |
| AT-12 audit | Pass | `test_at12_audit_trail` |
| AT-13 برچسب دادهٔ آزمایشی همه‌جا | Pass | `test_at13_test_data_label_everywhere` + `KpiCard`/`RuntimePage`/`Editor` tests |

## انحراف‌ها از اسناد (ثبت‌شده)
- **SQLAlchemy همگام** به‌جای async (ADR-0003 §یادداشت پیاده‌سازی).
- **PostgreSQL 17.6 و Python 3.14.2** به‌جای 18 و 3.13 در محیط dev (D-06).
- **Zustand و TanStack Query** هنوز اضافه نشده‌اند (D-10).
- **API client دستی** به‌جای openapi-typescript.
- **پروتکل WS:** پیام‌های `values` (snapshot دوره‌ای) به‌جای `value` تکی (api-conventions، ADR-0012).
- **testcontainers استفاده نشد** (بدون Docker)؛ DB تست یکتا روی PG محلی.
