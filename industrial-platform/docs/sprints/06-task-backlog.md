# ۰۶ — جدول کارها (Backlog اولیه)

اولویت: **P0** = لازم برای VS-1/MVP و مسدودکننده · **P1** = لازم برای MVP · **P2** = پس از MVP.
نقش‌ها: BE (backend)، FE (frontend)، DB، MOD (مدل‌سازی/صنعتی)، QA، OPS (DevOps).

## فاز ۰ (انجام‌شده در این اسپرینت)
| ID | عنوان | فاز/اسپرینت | اولویت | وابستگی | معیار پذیرش |
|---|---|---|---|---|---|
| T-000 | تحلیل نیازمندی، معماری، ERD، ADRها | P0/S0 | P0 | — | اسناد `docs/` موجود و بازبینی‌شده |
| T-001 | JSON Schemaها + مثال‌ها + validator معنایی | P0/S0 | P0 | — | `pytest` در `contracts/` سبز (۴۹ تست schema/معنایی) |
| T-002 | OpenAPI 3.1 + تست‌ها | P0/S0 | P0 | T-001 | `openapi-spec-validator` و ۶ تست OpenAPI سبز |
| T-003 | تأیید تصمیم‌های D-01…D-16 توسط کاربر | P0/S0 | P0 | T-000 | پاسخ کاربر ثبت و ADRها Accepted/اصلاح |

## فاز ۱ — Foundations (S1)
| ID | عنوان | فاز/اسپرینت | اولویت | وابستگی | معیار پذیرش |
|---|---|---|---|---|---|
| T-101 | Scaffold backend (FastAPI app factory, config, logging, problem+json handler) | P1/S1 | P0 | T-003 | `GET /api/v1/health` 200؛ خطای ناشناخته → problem+json بدون stack trace |
| T-102 | Scaffold frontend (Vite multi-entry studio/runtime، TS strict، ESLint boundaries، Vitest) | P1/S1 | P0 | T-003 | `npm run build` دو bundle؛ bundle runtime فاقد dnd-kit (بررسی با rollup-plugin-visualizer) |
| T-103 | Docker Compose (mongo replica set, api, worker, web/nginx) + `.env.example` بدون secret | P1/S1 | P0 | T-101, T-102 | `docker compose up` روی ماشین تمیز کار می‌کند؛ secret scanner (gitleaks) در CI سبز |
| T-104 | CI: lint, type, unit, contract tests, `migrate` + `migrate --check`, gitleaks | P1/S1 | P0 | T-101, T-102 | PR بدون همهٔ checkها merge نمی‌شود |
| T-105 | DB baseline (MongoDB migration 0001): iam, projects, audit + seed roles/permissions/units | P1/S1 | P0 | T-101 | `migrate` روی DB خالی + اجرای دوباره no-op + `migrate --check` سبز؛ seed idempotent |
| T-106 | iam: login/logout/me، session cookie، CSRF، Argon2id، rate limit | P1/S1 | P0 | T-105 | تست‌های integration: کوکی HttpOnly/SameSite، CSRF گم‌شده → 403، ۱۰ تلاش ناموفق → 429 |
| T-107 | authz dependency `require(permission)` + تست «هر route permission دارد» | P1/S1 | P0 | T-106 | تست خودکار route بدون dependency را fail می‌کند |
| T-108 | projects CRUD + members + ETag/If-Match helper مشترک | P1/S1 | P0 | T-107 | 428 بدون If-Match، 412 با ETag کهنه؛ کاربر غیرعضو → 404 |
| T-109 | OpenAPI drift test (FastAPI ↔ contracts) | P1/S1 | P1 | T-101, T-002 | تفاوت path/operationId → CI fail |
| T-110 | تأیید قرارداد SCADA و دسترسی سرویس (حساب، host مجاز) | P1/S1 | P0 | — | سند قرارداد SCADA در `docs/api/`؛ اتصال آزمایشی از سرور dev موفق |
| T-111 | Frontend: login + لیست/ساخت پروژه + api client تولیدی | P1/S1 | P0 | T-102, T-108 | e2e: login → ساخت پروژه → نمایش در لیست |

## VS-1 (S2–S3) — جزئیات در [08-vertical-slice-01.md](08-vertical-slice-01.md)
| ID | عنوان | فاز/اسپرینت | اولویت | وابستگی | معیار پذیرش |
|---|---|---|---|---|---|
| T-201 | design: documents/pages/revisions جداول + `PUT /document` با If-Match | P2/S2 | P0 | T-108 | دو save هم‌زمان: یکی 200، دیگری 412؛ revision append-only (UPDATE → exception) |
| T-202 | document validation سرور (JSON Schema + semantic) | P2/S2 | P0 | T-201, T-001 | همهٔ مثال‌های invalid با 422 و `code` درست رد می‌شوند |
| T-203 | components: جداول + seed کامپوننت سراسری `industrial.kpi-card@1.2.0` + `GET /renderers` | P3/S2 | P0 | T-105 | instance با نسخهٔ ناموجود → 422 `unknown_component_version` |
| T-204 | industrial_objects (حداقل): type version + object + API | P4/S2 | P0 | T-105 | ساخت `solar.inverter` و `jb-01.inv-01` با مثال‌های contracts |
| T-205 | data_sources: adapter `scada_http_ws` (login, read_latest, subscribe) + credentials رمزگذاری‌شده | P4/S2 | P0 | T-110 | تست integration با SCADA stub ضبط‌شده؛ GET data source هرگز credential برنمی‌گرداند |
| T-206 | data_bindings (object_variable) + `GET /data-bindings/{id}/value` | P4/S2 | P0 | T-204, T-205 | قطع SCADA → `quality=no_data, value=null` |
| T-207 | publishing: bundle builder + pins + `POST /publish` + `activate` | P5/S2 | P0 | T-201, T-203, T-206 | publish دوم bundle اول را تغییر نمی‌دهد (hash ثابت)؛ حذف نسخهٔ pin‌شده → FK error |
| T-208 | runtime: `resolve` + `/runtime/ws` gateway (binding topics) | P5/S2 | P0 | T-207 | topic خارج از bundle → `forbidden_topic`؛ مقدار زنده < ۲ ثانیه تأخیر از SCADA |
| T-209 | Editor-lite: درخت سند، افزودن section/row/column/KPI، inspector تولیدشده از propertySpec، binding picker | P2/S3 | P0 | T-111, T-201, T-203 | کاربر بدون کد یک KPI می‌سازد و bind می‌کند؛ undo/redo برای ۳ عمل |
| T-210 | shared/rendering + renderer `builtin.kpi-card@1` + style engine حداقل (tokens → CSS vars) | P2/S3 | P0 | T-102 | همان renderer در preview و runtime؛ snapshot test |
| T-211 | Runtime app: resolve path → render bundle → WS live values + نمایش stale/no-data | P5/S3 | P0 | T-208, T-210 | e2e VS-1 سبز |
| T-212 | Save/Publish UI + نمایش 412 conflict | P5/S3 | P0 | T-209, T-207 | conflict پیام قابل فهم + گزینهٔ reload |
| T-213 | e2e VS-1 (Playwright) + SCADA stub در CI | QA/S3 | P0 | T-211 | سناریوی VS-1 در CI پایدار (۳ اجرای پیاپی سبز) |

## فاز ۲–۷ (S4–S8) تا MVP
| ID | عنوان | فاز/اسپرینت | اولویت | وابستگی | معیار پذیرش |
|---|---|---|---|---|---|
| T-301 | DnD با dnd-kit (palette→canvas، reorder، move بین containerها، کیبورد) | P2/S4 | P1 | T-209 | قیود child-type در هنگام drop اعمال می‌شوند (column فقط در row)؛ a11y keyboard |
| T-302 | Layout engine: flow + grid داشبورد + responsive overrides | P2/S4 | P1 | T-210 | پیش‌نمایش در ۳ breakpoint؛ overrides mobile اعمال می‌شود |
| T-303 | Theme Builder + theme versions + publish | P2/S4 | P1 | T-210 | تغییر token → preview بی‌درنگ؛ صفحهٔ منتشرشده تا publish بعدی تغییر نمی‌کند |
| T-304 | Undo/redo کامل (command log، coalescing ویرایش‌های inspector) | P2/S4 | P1 | T-209 | ۵۰ گام undo؛ تست واحد برای هر command |
| T-305 | Preview sessions (API + runtime mode=preview) | P5/S4 | P1 | T-211 | preview منقضی → 410؛ draft کامپوننت فقط در preview |
| T-306 | Revisions UI + restore (draft rollback) | P5/S4 | P1 | T-201 | restore → revision جدید با `restoredFrom` |
| T-401 | Component Studio UI: تعریف، propertySpec editor، validationRules، نسخه‌سازی semver، publish/deprecate | P3/S5 | P1 | T-203, T-301 | کاربر کامپوننت جدید (بر پایهٔ renderer موجود) تعریف و در palette می‌بیند؛ bump minor با حذف prop → 422 |
| T-402 | Rendererهای gauge، line-chart (ECharts ماژولار)، table، status-indicator | P3/S5 | P1 | T-210 | حجم chunk ECharts < 350KB gzip؛ تست snapshot |
| T-403 | svg-symbol + آپلود media + sanitize SVG سمت سرور | P3/S5 | P1 | T-401 | SVG حاوی `<script>`/`onload`/`foreignObject`/href خارجی پاک‌سازی یا رد می‌شود (تست fuzz) |
| T-404 | Component usages + هشدار ارتقا | P3/S5 | P2 | T-401 | where-used صحیح برای draft و published |
| T-501 | Object Studio UI: types (variables/params/status/alarms)، objects tree، relations | P4/S5 | P1 | T-204 | ساخت INV-01..04 از UI بدون کد |
| T-502 | Signal browser + mapping متغیر به سیگنال + units catalog/conversion | P4/S5 | P1 | T-205 | W → kW صحیح؛ سیگنال ناموجود → هشدار |
| T-503 | Binding UI (انتخاب شیء/متغیر/خروجی مدل، transform، delivery) | P4/S5 | P1 | T-206, T-209 | binding جدید بدون خروج از editor |
| T-601 | modeling/engine: parser، AST، DAG، evaluator (پورت از `contracts/tools/semantic.py`) + mypy strict | P7/S2–S4 (موازی) | P1 | T-001 | تمام تست‌های contracts + property-based tests (hypothesis) سبز |
| T-602 | models/model_versions API + validate + publish | P7/S7 | P1 | T-601 | خطاهای cycle/undeclared با pointer دقیق |
| T-603 | Worker: صف collection با lease (`find_one_and_update`)، subprocess، timeout، heartbeat، reaper، cancel | P7/S7 | P1 | T-602 | مدل حلقهٔ بی‌نهایت ممکن نیست؛ مدل سنگین مصنوعی > timeout → `timed_out`؛ kill worker → reaper |
| T-604 | Resolve ورودی‌ها (object_variable last/today + run_argument) + snapshot | P7/S7 | P1 | T-603, T-205 | `resolved_inputs` منبع و زمان هر مقدار را دارد |
| T-605 | Model editor UI + اجرای دستی + تاریخچهٔ اجرا | P7/S7 | P1 | T-602 | کاربر PR را تعریف، اجرا و نتیجه را می‌بیند |
| T-606 | Binding `model_output` + KPI برچسب «نتیجهٔ مدل» + WS topic `model-run` | P7/S7 | P1 | T-603, T-503 | KPI PR پس از اجرای موفق بدون refresh به‌روز می‌شود |
| T-701 | Templates + slot | P6/S8 | P1 | T-301 | صفحه با template رندر می‌شود؛ slot در page → 422 |
| T-702 | Header/Footer + display conditions + publish | P6/S8 | P1 | T-701 | resolve با include/exclude و priority طبق تست‌های جدول‌محور |
| T-703 | Menus + لینک شکسته | P6/S8 | P1 | T-702 | حذف صفحه → آیتم `broken` |
| T-704 | e2e پذیرش MVP (۱۳ گام) | QA/S8 | P0 | همه | سناریوی کامل MVP در CI سبز |
| T-705 | تست امنیتی پایه: XSS (props/style/SVG)، SQLi (filters/sort)، IDOR بین پروژه‌ها، CSRF | QA/S8 | P0 | T-704 | گزارش بدون یافتهٔ High |

## پس از MVP (نمونه)
| ID | عنوان | فاز/اسپرینت | اولویت | وابستگی | معیار پذیرش |
|---|---|---|---|---|---|
| T-801 | Schedule triggers (cron) + event triggers | P7b/S9 | P2 | T-603 | اجرای زمان‌بندی‌شده فقط یک‌بار در چند instance (lease document در MongoDB) |
| T-802 | ورودی تاریخچه‌ای (`read_history`) از SCADA | P7b/S9 | P2 | T-110 | aggregation avg/sum روی window صحیح در برابر داده‌های ضبط‌شده |
| T-803 | Reports (قرارداد، builder، PDF) | P8/S10 | P2 | T-704 | گزارش روزانهٔ نیروگاه با داده‌های واقعی |
| T-901 | OIDC + bearer tokens | P9/S11 | P2 | T-106 | login با IdP سازمانی |
| T-902 | Backup/restore + observability (metrics, traces) | P9/S11 | P2 | T-103 | restore آزمایشی موفق؛ داشبورد سلامت |
| T-903 | ارزیابی RLS | P9/S12 | P2 | T-705 | ADR تصمیم |
