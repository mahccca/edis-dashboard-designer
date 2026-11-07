# ADR-0007 — کامپوننت‌های schema-driven، بدون اجرای کد کاربر

**وضعیت:** Accepted (2026-10-27) · **تاریخ:** 2026-10-27

## Context
کاربران باید بدون کدنویسی کامپوننت گرافیکی تعریف کنند؛ ولی اجرای JS/HTML کاربر در مرورگر اپراتور ریسک XSS، نشت session و رفتار غیرقابل پیش‌بینی در محیط صنعتی دارد.

## Decision
- ComponentDefinition یک **JSON اعلامی** است (component-definition.schema.json): `properties` (propertySpec)، `inputs/outputs`، `bindings` (منابع مجاز)، `style.parts` (ویژگی‌های مجاز)، `validationRules` (با گرامر فرمول امن)، `layoutConstraints`، `permissions`، `compatibility`.
- رندر توسط **renderer داخلی** انتخاب‌شده با `rendererId` از whitelist (`builtin.<name>@<major>`)؛ مجموعهٔ اولیه: `kpi-card`, `gauge`, `line-chart`, `bar-chart`, `table`, `status-indicator`, `svg-symbol`, `text-value`. افزودن renderer جدید = تغییر کد پلتفرم (توسط تیم، نه کاربر).
- **svg-symbol**: SVG از Media (sanitize‌شده) + نگاشت اعلامی وضعیت → رنگ/نمایش لایه‌های نام‌دار (`data-layer`)؛ بدون اسکریپت/event handler.
- Inspector از propertySpec تولید می‌شود؛ editor هیچ UI اختصاصی per-component ندارد.
- سرور: `additionalProperties: false` (فیلدهایی مثل `script` رد می‌شوند)، `rendererId` با registry اعتبارسنجی می‌شود، `defaults` و props نمونه‌ها با propertySpec.

## Alternatives
- Sandbox iframe با JS کاربر: پیچیده، کند، و هنوز سطح حمله (postMessage، phishing داخلی).
- Web Components کاربر: همان مشکل اجرای کد.

## Consequences
- + امنیت، قابلیت ارتقا و مهاجرت اعلامی، inspector خودکار.
- − بیان‌پذیری محدود به rendererهای موجود؛ نیازهای جدید = backlog پلتفرم. این محدودیت آگاهانه است.
