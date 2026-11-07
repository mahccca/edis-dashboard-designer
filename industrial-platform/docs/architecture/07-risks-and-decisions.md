# ۰۷ — ثبت ریسک‌های معماری و تصمیم‌های نیازمند تأیید

## ۱. ثبت ریسک‌ها
احتمال/اثر: L/M/H.

| ID | ریسک | احتمال | اثر | کاهش | مالک |
|---|---|---|---|---|---|
| R-01 | قرارداد و دسترسی SCADA مبهم است (فقط از کد اپ موجود استنتاج شده)؛ irradiation/تاریخچه شاید در دسترس نباشد | H | H | T-110 در S1؛ adapter پشت interface؛ ورودی `run_argument` برای irradiation؛ stub ضبط‌شده برای CI | BE + MOD |
| R-02 | پیچیدگی design core (DnD + درخت + responsive + undo) و لغزش زمان‌بندی | H | H | VS-1 با editor-lite بدون DnD؛ command pattern از روز اول؛ دامنهٔ styleBlock محدود | FE |
| R-03 | ناهماهنگی validation فرانت (ajv) و سرور (jsonschema) | M | M | یک مجموعه schema؛ مثال‌های مشترک در هر دو CI؛ سرور مرجع نهایی | QA |
| R-04 | رشد اندازهٔ bundleها و revisionها (هر save یک revision) | M | M | throttle autosave، pruning طبق A-09، سقف 2 MiB؛ مانیتور اندازهٔ جدول | DB |
| R-05 | XSS از طریق props/style/SVG/menu URL | M | H | بدون HTML خام، whitelist style، sanitize SVG، الگوی URL، CSP سخت، تست امنیتی T-705 | BE + FE |
| R-06 | فرمول‌های پرهزینه یا مخرب | L | H | گرامر بسته، گام/عمق محدود، subprocess + timeout + rlimit (ADR-0008/0009) | MOD |
| R-07 | تغییر بی‌صدای صفحات منتشرشده (ارتقای کامپوننت/تم) | L | H | snapshot کامل + pins + نقش MongoDB فقط find+insert و repository بدون update (ADR-0006/0015) | BE |
| R-08 | Migration محتوای JSON ناقص یا ناسازگار | M | H | migratorهای خالص + fixtureهای مثال در CI؛ bundle‌ها بازنویسی نمی‌شوند | BE |
| R-09 | gateway WS گلوگاه یا نقطهٔ شکست (state در پروسهٔ api) | M | M | یک اتصال upstream مشترک، backpressure/throttle، reconnect با backoff؛ آستانهٔ مهاجرت به Redis pub/sub تعریف‌شده | BE + OPS |
| R-10 | نمایش «عدد» بدون داده واقعی (نقض no-fake-data) | M | H | quality در همهٔ مسیرها، UI حالت no-data/stale، تست قطع SCADA، ممنوعیت generator تصادفی (lint rule روی `Math.random`/`random` در کد production داده) | QA |
| R-11 | coupling بین ماژول‌ها در monolith | M | M | import-linter + eslint-boundaries در CI | Architect |
| R-12 | MongoDB replica set (حتی تک‌عضوی + keyFile) در محیط مشتری راه‌اندازی/پشتیبان‌گیری نشود | M | H | compose با initiate خودکار؛ runbook backup (`mongodump`/snapshot)؛ بدون replica set تراکنش و در نتیجه اتمیک بودن publish/archive از دست می‌رود — API بدون آن کار نمی‌کند | OPS |
| R-17 | نبود FK سمت سرور در MongoDB ⇒ ارجاع معلق | M | M | هیچ مسیر حذف برای موجودیت‌های ارجاع‌شده (archive به‌جای delete، تاریخچه insert-only)؛ بررسی وجود/هم‌پروژه بودن در Service؛ هر حذف آینده باید ارجاع‌ها را چک کند (ADR-0015) | BE |
| R-18 | تغییر تاریخچه با هویت admin/migration (نقش محدود فقط هویت اپ را می‌بندد) | L | H | هویت admin جدا، فقط برای migrate/provision؛ در production خارج از دسترس API؛ audit عملیات DBA | OPS |
| R-13 | عملکرد editor در اسناد بزرگ (هزاران node) | M | M | سقف A-19، memoization بر اساس node id، virtualized layers tree | FE |
| R-14 | مدل PR ساده‌شده (بدون تصحیح دما) به‌عنوان KPI رسمی تفسیر شود | M | M | برچسب «مدل ساده‌شده v1» در توضیح مدل و tooltip KPI؛ تأیید کاربر (D-02) | MOD |
| R-15 | اپ قدیمی و پلتفرم جدید دو منبع حقیقت برای کاربران نهایی شوند | M | L | D-01: برنامهٔ بازنشستگی اپ قدیمی پس از MVP | PO |
| R-16 | دادهٔ آزمایشی (منبع simulated) با دادهٔ واقعی نیروگاه اشتباه گرفته شود | M | H | `dataOrigin=simulated` + `isTestData=true` در metadata منبع، هر پاسخ API، bundle (`containsTestData`/`bindingOrigins`) و برچسب «داده آزمایشی / Test data» در runtime و studio؛ AT-13 | QA + FE |

> R-01 (به‌روزرسانی ۱۴۰۵/۰۸/۰۵): قرارداد SCADA هنوز تأیید نشده است. VS-1 روی منبع `simulated` اجرا می‌شود (ADR-0012 §اصلاحیه). R-10: منبع simulated تصادفی نیست (منحنی قطعی با seed ثابت از مسیر سیگنال) و همیشه برچسب دادهٔ آزمایشی دارد؛ بنابراین ممنوعیت generator تصادفی نقض نمی‌شود.

## ۲. تصمیم‌ها

همهٔ تصمیم‌های D-01..D-17 در ۲۰۲۶-۱۰-۲۷ با گزینهٔ پیشنهادی **Accepted** شدند. اصلاحیه‌ها و انحراف‌های پیاده‌سازی VS-1 در ستون «یادداشت» آمده است.

| ID | تصمیم | وضعیت | گزینه‌های جایگزین (رد شده) | ارجاع | یادداشت |
|---|---|---|---|---|---|
| D-01 | اپ موجود `darkhoveyn-scada` دست نخورده بماند؛ پلتفرم در `industrial-platform/`؛ پس از MVP بازنشسته شود | Accepted | مهاجرت تدریجی اپ موجود به پلتفرم | 01, 04 | |
| D-02 | پایلوت = نیروگاه دارخوین؛ مدل PR ساده \(PR = (E_{ac}/P_{stc})/(H_{poa}/G_{stc})\) بدون تصحیح دما؛ irradiation به‌صورت ورودی دستی اجرا تا منبع واقعی تأیید شود | Accepted | سناریوی دیگر؛ مدل راندمان اینورتر به‌عنوان مدل اول | 01 §4 | VS-1 روی دادهٔ simulated |
| D-03 | DataBinding موجودیت مستقل؛ node فقط `bindingId` دارد | Accepted | binding inline در سند | ADR-0014 | |
| D-04 | انتشار header/footer/template روی صفحات منتشرشده اثر ندارد تا republish | Accepted | propagate خودکار | ADR-0006 | |
| D-05 | Data source v1: `scada_http_ws` (+ `manual`)؛ نیاز به حساب سرویس SCADA و host مجاز | Accepted، **اصلاح‌شده** | MQTT/OPC UA زودتر | ADR-0012 | تا تأیید قرارداد SCADA: نوع `simulated` (دادهٔ آزمایشی، برچسب‌خورده) پشت همان interface؛ `scada_http_ws` مستند، پیاده‌نشده و پشت `IP_FEATURE_SCADA_ADAPTER` (پیش‌فرض false) |
| D-06 | ~~PostgreSQL 18~~ → **MongoDB 9 (replica set)** (D-18)، Python 3.13، Node 22 LTS | Accepted (DB: Superseded 2026-11-01) | PG 16/17 | ADR-0003/0004 | محیط توسعهٔ فعلی: PG 17.6 portable و Python 3.14.2؛ کد به ویژگی اختصاصی 18 وابسته نیست (UUIDv7 در اپ) |
| D-07 | authz در اپ؛ RLS فقط در فاز ۹ ارزیابی شود | Accepted | RLS از ابتدا | 03 §6 | |
| D-08 | بدون Redis/Celery در v1؛ صف ~~PostgreSQL~~ → collection MongoDB با lease | Accepted | Celery + Redis از ابتدا | ADR-0009، ADR-0015 §8 | |
| D-18 | MongoDB تنها datastore؛ PostgreSQL حذف شد | Accepted (تصمیم کاربر 2026-11-01) | PostgreSQL | ADR-0015 | dev: portable 9.0.4 روی 127.0.0.1:27018، rs0 |
| D-09 | کاربران محلی + session cookie؛ OIDC در فاز ۹ | Accepted | OIDC از ابتدا | ADR-0010 | |
| D-10 | افزودن Zustand و TanStack Query به stack فرانت | Accepted، **به تعویق** | فقط React state/context | ADR-0002 | VS-1 با state محلی React + hookهای کوچک ساخته شد (یک صفحه، یک editor)؛ افزودن در اسپرینت ۴ همراه با DnD |
| D-11 | React Flow تا فاز ۷+/۱۰ اضافه نشود | Accepted | از MVP | ADR-0002 | |
| D-12 | تک‌سازمانی؛ پروژه = مرز دسترسی | Accepted | multi-tenant | A-01 | |
| D-13 | v1 فقط خواندنی (بدون فرمان به تجهیزات) | Accepted | نوشتن setpoint با تأیید دومرحله‌ای | A-05 | |
| D-14 | runtime پیش‌فرض فقط برای اعضای پروژه؛ public با پرچم پروژه | Accepted | runtime همیشه عمومی در شبکهٔ داخلی | A-03 | |
| D-15 | pin نسخهٔ دقیق کامپوننت حتی در draft؛ ارتقا فقط صریح | Accepted | range semver در draft | ADR-0006 | |
| D-16 | یک پروژهٔ frontend با دو entry (studio/runtime) | Accepted | دو repo/package جدا | ADR-0002 | |
| D-17 | هر save یک revision (append-only) + pruning autosave بعد از ۹۰ روز | Accepted | draft قابل تغییر + revision فقط با «ذخیرهٔ نسخه» | 03, A-09 | pruning هنوز پیاده نشده (خارج از VS-1) |
