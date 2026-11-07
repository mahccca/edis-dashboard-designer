# قراردادهای API (REST + WebSocket)

منبع حقیقت: [`contracts/openapi/openapi.yaml`](../../contracts/openapi/openapi.yaml) · تصمیم: [ADR-0013](../adr/0013-api-conventions.md)

## خلاصهٔ منابع (v1)
| حوزه | مسیرها |
|---|---|
| auth | `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` |
| projects | `/projects` · `/projects/{id}` · `/projects/{id}/members[/{userId}]` |
| pages | `/projects/{id}/pages` · `/pages/{id}` · `/pages/{id}/document` (GET/PUT + If-Match) · `/revisions[/{n}[/restore]]` · `/publish` · `/published-versions[/{n}/activate]` |
| templates / parts | `/projects/{id}/templates` · `/templates/{id}/document|publish` · `/projects/{id}/template-parts` · `/template-parts/{id}[/document|/display-conditions|/revisions|/publish]` |
| themes / menus | `/projects/{id}/themes` · `/themes/{id}/tokens|publish` · `/projects/{id}/menus` · `/menus/{id}` |
| components | `/renderers` · `/projects/{id}/components` · `/components/{id}/versions[/{v}[/publish|/deprecate]]` · `/components/{id}/usages` |
| objects | `/projects/{id}/object-types` · `/object-types/{id}/versions/{v}[/publish]` · `/projects/{id}/objects` · `/objects/{id}[/values]` |
| data | `/projects/{id}/data-sources` · `/data-sources/{id}[/test|/signals]` · `/projects/{id}/data-bindings` · `/data-bindings/{id}[/value]` |
| models | `/projects/{id}/models` · `/models/{id}/versions/{v}[/validate|/publish]` · `/models/{id}/runs` · `/model-runs/{id}[/cancel|/results]` |
| preview / runtime | `POST /projects/{id}/previews` · `GET /previews/{id}` · `GET /runtime/sites/{slug}/resolve?path=` · `GET /runtime/sites/{slug}/values` · `GET /runtime/ws` |
| audit | `/projects/{id}/audit-logs` |

## نکات کلیدی
- **ETag**: اسناد `"rev-<n>"`، سایر منابع `"v-<lockVersion>"`، runtime bundle = id نسخهٔ منتشرشده.
- **خطای 412** همیشه `currentEtag` دارد تا editor بتواند «بارگذاری مجدد / مقایسه» پیشنهاد دهد.
- **422** برای خطاهای schema و معنایی؛ `errors[].pointer` مسیر JSON Pointer در body است (مثلاً `/content/root/children/0/children/0/type`)، `code` همان کدهای validator معنایی (`duplicate_node_id`, `undeclared_identifier`, `dependency_cycle`, …).
- **امنیت**: کوکی `ipsid` + `X-CSRF-Token`؛ هیچ endpointی secret برنمی‌گرداند (`credentials` فقط writeOnly).

## WebSocket `GET /api/v1/runtime/ws`
احراز هویت با همان کوکی؛ Origin با `IP_ALLOWED_ORIGINS` بررسی می‌شود (نامجاز → close 4403). پیام‌ها JSON. جدول زیر پروتکل **پیاده‌شده در VS-1** است (`backend/app/modules/runtime/api.py`، کلاینت `frontend/src/shared/live-data`):

| جهت | نوع | بدنه |
|---|---|---|
| C→S | `subscribe` | `{ "type":"subscribe", "publishedVersionId":"<uuid>", "topics":["binding:<uuid>", ...] }` — subscribe جدید جایگزین قبلی می‌شود |
| C→S | `unsubscribe` | `{ "type":"unsubscribe" }` — همهٔ topicها را لغو می‌کند |
| C→S | `ping` | `{ "type":"ping" }` → S→C `{ "type":"pong" }` |
| S→C | `subscribed` | `{ "type":"subscribed", "publishedVersionId":"<uuid>", "topics":[...] }` |
| S→C | `values` | `{ "type":"values", "publishedVersionId":"<uuid>", "sentAt":"<iso>", "items":[BindingValue...] }` — بلافاصله پس از subscribe و سپس هر `IP_WS_PUSH_INTERVAL_SECONDS` (پیش‌فرض ۱ ثانیه) |
| S→C | `error` | `{ "type":"error", "code":"forbidden_topic" \| "not_found" \| "bad_request" \| "unauthenticated", "message":"...", "topics":[...]? }` |

هر `BindingValue` شامل `value` (یا `null`)، `unit`، `quality` (`good|uncertain|bad|stale|no_data`)، `sourceTimestamp`، `dataOrigin` (`live|simulated|manual|model|static`) و **`isTestData`** است. کلاینت باید برای `isTestData=true` برچسب «داده آزمایشی / Test data» نشان دهد؛ bundle با `containsTestData`/`bindingOrigins` این را پیش از اولین پیام مشخص می‌کند.

قواعد:
- topicها فقط اگر در bundle نسخهٔ منتشرشده باشند پذیرفته می‌شوند (وگرنه `forbidden_topic` و subscription قبلی دست‌نخورده می‌ماند).
- دسترسی (`runtime.view` یا پروژهٔ public) در **هر push** دوباره بررسی می‌شود؛ پایان session → `error` و close 4401، از دست رفتن دسترسی → close 4403.
- کلاینت در قطع اتصال با backoff دوباره وصل می‌شود و در این فاصله از `GET /runtime/sites/{slug}/values` polling می‌کند.
- برنامه‌ریزی‌شده، هنوز پیاده‌نشده: `previewId`، topic `model-run:<uuid>` و پیام `run`، سقف ۵۰۰ topic در اتصال، throttle per-topic، پیام‌های delta به‌جای snapshot کامل.
