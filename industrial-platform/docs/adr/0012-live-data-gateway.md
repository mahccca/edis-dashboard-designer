# ADR-0012 — Gateway دادهٔ زنده سمت سرور و adapter منبع داده

**وضعیت:** Accepted (2026-10-27) · **تاریخ:** 2026-10-27

## Context
اپ موجود مرورگر را مستقیم به SCADA (`ws://10.8.0.8:4000`) وصل می‌کند و credential را در env فرانت نگه می‌دارد. پلتفرم باید authz سمت سرور، عدم افشای secret و «بدون دادهٔ ساختگی» را تضمین کند.

## Decision
- ماژول `data_sources` یک **Adapter interface** دارد: `test()`, `search_signals(q)`, `read_latest(signals)`, `subscribe(signals) -> async iterator`, `read_history(signal, window)` (اختیاری؛ فاز ۷).
- پیاده‌سازی v1: **`scada_http_ws`** مطابق رفتار مشاهده‌شده در اپ موجود: login `POST /api/v1/auth/login`، REST `/api/v1/...`، WS با پیام `{"type":"subscribe","subscriptionId","signals":[...],"immediate":true}` و پاسخ‌های `subscription.snapshot` / پیام‌های دارای `path`. **قرارداد دقیق باید با مستندات/صاحب SCADA تأیید شود (D-05).**
- **یک اتصال upstream مشترک** per data source در پروسهٔ api؛ multiplex به مشترکین مرورگر.
- مرورگر فقط به `GET /api/v1/runtime/ws` (هم‌origin، کوکی session) وصل می‌شود. پیام‌ها:
  - client → `{"type":"subscribe","topics":["binding:<uuid>", "model-run:<uuid>"],"publishedVersionId":"<uuid>"}`
  - server → `{"type":"value","topic":"binding:<uuid>","value":12.3,"unit":"kW","quality":"good","ts":"..."}` / `{"type":"run","topic":"model-run:<uuid>","status":"succeeded"}` / `{"type":"error","code":"forbidden_topic"}`
  - سرور فقط topicهایی را می‌پذیرد که در bundle نسخهٔ منتشرشده (یا preview کاربر) وجود دارند.
- تبدیل واحد (`sourceUnit` → واحد متغیر → `toUnit` binding) سمت سرور با کاتالوگ `units`.
- کیفیت: `good | uncertain | bad | stale | no_data`؛ `stale` پس از `staleAfterMs`. در نبود داده، **مقدار null با quality=no_data** — renderer حالت «بدون داده» نشان می‌دهد.
- محیط توسعه بدون دسترسی به SCADA: adapter `manual` (مقادیر واردشده توسط کاربر با برچسب «دستی» و زمان ورود) یا SCADA replay در تست‌ها. **هیچ generator تصادفی در کد production نیست.**
- مقیاس: یک instance api کافی (A-06). برای چند instance → Redis pub/sub (بازنگری ADR-0009).

## اصلاحیه 2026-10-27 — منبع simulated و SCADA پشت feature flag (D-05)
قرارداد واقعی SCADA قابل تأیید نیست. بنابراین:
- **`simulated`** (پیاده‌سازی‌شده، `backend/app/modules/data_sources/adapters/simulated.py`): همان interface (`validate_config`, `test`, `search_signals`, `read_latest`). منحنی **قطعی** PV بین ۰۶ تا ۱۸ به وقت محلی (`utcOffsetMinutes`، پیش‌فرض 210) با ریپل ±۵٪ که فاز آن از crc32 مسیر سیگنال می‌آید؛ `energy_today` با فرم بسته؛ پرچم `offline` برای شبیه‌سازی قطعی (→ `no_data`). تصادفی نیست، پس تکرارپذیر و قابل‌آزمون است (AT-6).
- **برچسب دادهٔ آزمایشی همه‌جا:** data source: `dataOrigin=simulated`, `isTestData=true`؛ هر `VariableValue`/`BindingValue`/پیام WS: `dataOrigin` + `isTestData`؛ bundle: `bindingOrigins` + `containsTestData` (در زمان publish ثبت می‌شود، پس برچسب حتی قبل از رسیدن اولین مقدار نمایش داده می‌شود)؛ UI: نشان «داده آزمایشی / Test data» روی هر KPI و بنر صفحه در runtime و studio (AT-13).
- **`scada_http_ws`**: مستند، **پیاده‌نشده**. ساخت data source از این نوع بدون `IP_FEATURE_SCADA_ADAPTER=true` → 422 `adapter_not_available`؛ با flag هم هر فراخوانی → 501 `adapter_not_implemented`. هیچ‌جا ادعای اتصال به دادهٔ واقعی نمی‌شود.
- **پیام‌های WS پیاده‌شده (به‌جای پیام per-topic بالا):** client → `subscribe{site, publishedVersionId, topics}` / `unsubscribe` / `ping`؛ server → `subscribed{publishedVersionId, topics}`، `values{publishedVersionId, sentAt, items:[BindingValue]}` هر `IP_WS_PUSH_INTERVAL_SECONDS`، `pong`، `error{code}` (`forbidden_topic`، `not_found`، `unauthenticated` + close 4401). دسترسی در هر push دوباره بررسی می‌شود. «یک اتصال upstream مشترک» تا پیاده‌سازی adapter واقعی موضوعیت ندارد (simulated محاسبه‌ای است).

## Consequences
- + secret هرگز به مرورگر نمی‌رسد؛ authz per-topic؛ بار کمتر روی SCADA.
- − api state‌دار می‌شود (اتصال‌های WS)؛ restart = reconnect کلاینت‌ها (backoff در کلاینت).
