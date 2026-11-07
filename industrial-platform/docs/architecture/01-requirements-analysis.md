# ۰۱ — تحلیل نیازمندی‌ها (Phase 0)

> وضعیت: پیش‌نویس برای تأیید کاربر · تاریخ: ۱۴۰۵/۰۸/۰۵ (2026-10-27)
> هر بندی که با برچسب **[فرض]** آمده موقت است و با تصمیم کاربر قابل تغییر است. شناسهٔ فرض‌ها (A-xx) در بقیهٔ اسناد ارجاع داده می‌شود.

## ۱. زمینه و وضعیت فعلی workspace

- در ریشهٔ workspace یک اپ کوچک React 19 + Vite (JavaScript، بدون TypeScript) به نام `darkhoveyn-scada` وجود دارد که مستقیماً به یک SCADA خورشیدی (`VITE_SCADA_BASE_URL`, پیش‌فرض `http://10.8.0.8:4000`) با REST (`/api/v1/...`) و WebSocket (پیام `subscribe` با `signals` و پاسخ `subscription.snapshot`) وصل می‌شود. مسیر سیگنال‌ها به شکل `Darkhoveyn/JB-01/INV-01/AC_POWER` است و endpointهایی مثل `/public/plant-totals`, `/public/power-history`, `/devices`, `/alarms/active`, `/public/signals/search` استفاده شده‌اند.
- این اپ به پلتفرم جدید مربوط است ولی معماری آن (اتصال مستقیم مرورگر به SCADA، credential در env فرانت) با الزامات امنیتی پلتفرم سازگار نیست؛ بنابراین **دست نخورده باقی می‌ماند** و پروژهٔ جدید در `industrial-platform/` ساخته می‌شود. از آن به‌عنوان **مرجع قرارداد دادهٔ SCADA** برای Data Source Adapter استفاده می‌کنیم.

## ۲. نیازمندی‌های قطعی (Firm)

### ۲.۱ کارکردی
| کد | نیازمندی |
|---|---|
| FR-01 | ورود کاربر، ایجاد پروژه، عضویت و نقش در سطح پروژه |
| FR-02 | Theme Builder: تعریف design tokens (رنگ، فاصله، فونت، radius، سایه، وضعیت‌ها)، breakpoints، بدون کدنویسی |
| FR-03 | ساخت Header/Footer/Menu/Page Template با **display rules** (کل سایت، صفحات خاص، پیشوند مسیر، نوع صفحه، template) |
| FR-04 | Component Studio: تعریف ComponentDefinition نسخه‌دار و schema-driven (props, inputs, outputs, bindings, style parts, validation rules, layout constraints)؛ **اجرای کد کاربر ممنوع** |
| FR-05 | Object Studio: تعریف IndustrialObjectType (متغیرها، پارامترها، واحدها، status model، alarm، relation) و Object instance با نگاشت متغیر به Data Source |
| FR-06 | Binding نمونهٔ کامپوننت به متغیر شیء / سیگنال منبع داده / خروجی مدل |
| FR-07 | Page/Dashboard Builder با drag & drop، KPI، نمودار ECharts، جدول؛ گزارش‌ها در فاز بعد |
| FR-08 | Modeling: قرارداد عمومی مدل (inputs, parameters, variables, formulas, outputs, units, dependencies, validation)، اجرای async با timeout و محدودیت منابع، ذخیرهٔ نتایج؛ batch/schedule/event بعداً |
| FR-09 | فرمول‌ها فقط با parser امن (AST + whitelist)؛ هرگز `eval` |
| FR-10 | Preview، Version، Publish، Rollback |
| FR-11 | Runtime rendering صفحات منتشرشده جدا از editor |
| FR-12 | یک **design core مشترک** برای Page/Header/Footer/Dashboard (document tree, registries, inspector, DnD, layout/style engine, tokens, responsive, undo/redo, validation, serialization, render) |

### ۲.۲ غیرکارکردی / الزامات سخت (Non-negotiables)
| کد | الزام |
|---|---|
| NFR-01 | تفکیک روشن موجودیت‌ها (Page, Template, Theme, Header, Footer, ComponentDefinition, ComponentInstance, IndustrialObject, DataSource, DataBinding, Model, ModelRun, Dashboard, Report, PublishedVersion) با id، lifecycle و data contract |
| NFR-02 | Modular Monolith؛ بدون microservice |
| NFR-03 | PublishedVersion تغییرناپذیر و pinned به نسخه‌های مشخص ComponentDefinition |
| NFR-04 | دادهٔ مهم (مالکیت، وضعیت انتشار، نسخه) در فیلدهای سطح بالا با ایندکس/validator؛ سند طراحی به‌صورت زیرسند JSON (MongoDB، ADR-0015) |
| NFR-05 | Migration برای schema اسناد |
| NFR-06 | هیچ secret در repo |
| NFR-07 | Authorization سمت سرور؛ محافظت XSS/SQLi |
| NFR-08 | Optimistic concurrency برای اسناد |
| NFR-09 | **دادهٔ ساختگی ممنوع** در بخش‌هایی که ادعای اتصال واقعی دارند |

### ۲.۳ معیار پذیرش MVP
ورود و ساخت پروژه → تعریف کامپوننت صنعتی → ذخیره در کتابخانه → ساخت شیء صنعتی → bind کامپوننت به دادهٔ شیء → ساخت صفحه → چیدمان با DnD → شخصی‌سازی ظاهر/چیدمان → اجرای مدل محاسباتی ساده → نمایش خروجی مدل روی داشبورد → ذخیره، preview، publish → مشاهدهٔ نسخهٔ منتشرشده در runtime → بازگشت به revision قبلی؛ **همه بدون تغییر کد برای هر صفحه/کامپوننت**.

## ۳. ابهام‌ها و پرسش‌های باز

| کد | ابهام | اثر | پیشنهاد موقت |
|---|---|---|---|
| Q-01 | Multi-tenancy: چند سازمان مستقل روی یک نصب؟ | مدل داده، authz | **[فرض A-01]** یک سازمان در هر استقرار؛ «پروژه» مرز دسترسی است. ستون `tenant_id` اضافه نمی‌شود ولی طراحی مانع افزودنش نیست |
| Q-02 | منبع احراز هویت: کاربران محلی یا LDAP/AD/OIDC سازمانی؟ | auth | **[فرض A-02]** کاربران محلی با Argon2id + session cookie؛ OIDC در فاز ۹ (ADR-0010) |
| Q-03 | Runtime عمومی (بدون login) لازم است؟ | امنیت، caching | **[فرض A-03]** پیش‌فرض فقط اعضای پروژه؛ پرچم `runtimeVisibility=public` در سطح پروژه |
| Q-04 | SCADA مرجع: آیا تاریخچه (historian) و تابش (irradiance/irradiation) را ارائه می‌دهد؟ | مدل PR | **[فرض A-04]** فقط مقدار لحظه‌ای + `energy_today` + `power-history` روز جاری قابل اتکاست؛ irradiation در v1 به‌صورت **ورودی دستی اجرا** (`run_argument`) گرفته می‌شود تا عدد ساختگی تولید نشود |
| Q-05 | آیا پلتفرم باید فرمان (write/setpoint) به تجهیزات بفرستد؟ | ایمنی، قانونی | **[فرض A-05]** v1 فقط خواندنی. متغیرهای `read_write` در قرارداد رزرو شده ولی endpoint نوشتن وجود ندارد |
| Q-06 | حجم: تعداد سیگنال، کاربر هم‌زمان runtime، نرخ به‌روزرسانی | WS gateway، کش | **[فرض A-06]** ≤ ۵٬۰۰۰ سیگنال، ≤ ۲۰۰ بیننده هم‌زمان، به‌روزرسانی ≥ ۱ ثانیه؛ یک instance backend کافی است |
| Q-07 | زبان رابط: فارسی RTL، انگلیسی یا هر دو؟ | i18n، layout | **[فرض A-07]** دوزبانه fa/en؛ متن‌ها `localizedText`؛ پیش‌فرض RTL |
| Q-08 | گزارش‌ها: PDF؟ زمان‌بندی؟ ایمیل؟ | فاز ۸ | خارج از MVP؛ قرارداد Report در فاز ۸ |
| Q-09 | استقرار: on-prem ایزوله (بدون اینترنت)؟ | Docker، فونت، CDN | **[فرض A-08]** on-prem با Docker Compose؛ هیچ وابستگی runtime به CDN (فونت Vazirmatn self-hosted) |
| Q-10 | نگهداری داده: مدت نگهداری revisionها، audit و نتایج مدل | storage | **[فرض A-09]** revisionهای autosave بعد از ۹۰ روز قابل pruning (مگر pinned به publish)؛ audit و model_results بدون حذف در v1 |
| Q-11 | آیا کاربر می‌تواند SVG/نماد گرافیکی سفارشی (P&ID) بارگذاری کند؟ | XSS | **[فرض A-10]** بله، فقط از طریق Media با sanitize سمت سرور (حذف script/foreignObject/event handlers/external refs) و رندر به‌صورت `<img>` یا SVG پاک‌سازی‌شده |
| Q-12 | دقت واحدها: تبدیل خودکار واحد و تحلیل ابعادی؟ | مدل‌سازی | **[فرض A-11]** کاتالوگ واحد با ضریب تبدیل خطی؛ تحلیل ابعادی فرمول‌ها در v1 فقط هشدار (warning) |
| Q-13 | Undo/redo بین نشست‌ها؟ | editor | **[فرض A-12]** undo/redo داخل نشست editor (client)؛ تاریخچهٔ بین‌نشستی = revisions سرور |
| Q-14 | ویرایش هم‌زمان چندکاربره (real-time collaboration) | پیچیدگی بالا | **[فرض A-13]** نه در v1؛ optimistic concurrency + پیام تعارض. قفل نرم (soft-lock «X در حال ویرایش است») در فاز ۶ |

## ۴. سناریوی پایلوت **[فرض A-14]**

**نیروگاه خورشیدی دارخوین** (همان سایتی که اپ موجود به آن وصل است):

- اشیاء: `site` (نیروگاه) ← `junction-box` (JB-01) ← `inverter` (INV-01..INV-04). متغیرها: `ac_power`, `pv_power` (kW؛ منبع W)، `energy_today` (kWh)، `state`.
- Data Source: یک منبع از نوع `scada_http_ws` با آدرس SCADA موجود؛ credential فقط سمت سرور، رمزگذاری‌شده.
- کامپوننت: `industrial.kpi-card@1.2.0` (renderer داخلی `builtin.kpi-card@1`).
- مدل: `solar.performance-ratio@1.0.0`:
  - \( Y_r = H_{poa} / G_{stc} \)، \( Y_f = E_{ac} / P_{stc} \)، \( PR = Y_f / Y_r \times 100 \)
  - ورودی‌ها: `energy_ac` (از `site.energy_today`)، `irradiation_poa` (ورودی اجرا، فرض A-04)، `energy_dc` (اختیاری).
  - پارامترها: `capacity_stc` (kWp)، `g_stc = 1 kW/m²`. بدون تصحیح دمایی در v1.
  - قاعدهٔ اعتبارسنجی: `irradiation_poa > 0` تا عدد گمراه‌کننده تولید نشود.
- داشبورد «نمای کلی نیروگاه»: KPI توان AC کل (live) + KPI نسبت عملکرد (آخرین اجرای موفق مدل، با برچسب «نتیجهٔ مدل» و زمان محاسبه).

> ظرفیت نیروگاه (`capacity_stc = 1500 kWp` در مثال‌ها) **مقدار نمونه** است؛ مقدار واقعی از API (`capacityKwp` در `/public/sites/overview`) یا کاربر گرفته می‌شود.

## ۵. فرض‌های فنی دیگر

| کد | فرض |
|---|---|
| A-15 | Python 3.13 در کانتینر (روی ماشین توسعه 3.14 موجود است؛ تست‌های قرارداد روی 3.14 اجرا شد)، Node 22 LTS |
| A-16 | ~~PostgreSQL 18~~ → MongoDB ≥ 8 replica set (ADR-0015، 2026-11-01)؛ UUIDv7 در اپلیکیشن تولید می‌شود |
| A-17 | Redis و Celery در v1 **نیست** (ADR-0009)؛ صف کار مبتنی بر collection `model_runs` با claim اتمیک + lease (ADR-0015 §8) |
| A-18 | فقط یک نوع Data Source واقعی در v1 (`scada_http_ws`) به‌علاوهٔ `manual`؛ MQTT/OPC UA/SQL در فاز ۱۰ |
| A-19 | اندازهٔ هر سند ≤ 2 MiB و ≤ ۵٬۰۰۰ node |
| A-20 | مرورگرهای هدف: Chromium/Firefox دو نسخهٔ اخیر؛ بدون IE |

## ۶. خارج از محدوده (v1)
اجرای کد/اسکریپت کاربر؛ نوشتن روی تجهیزات؛ ویرایش هم‌زمان real-time؛ موتور مدل دامنه‌ای (مثلاً شبیه‌سازی کامل PV)؛ historian داخلی؛ marketplace کامپوننت؛ multi-tenant SaaS؛ اپ موبایل native.
