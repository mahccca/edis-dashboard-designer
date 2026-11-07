# ADR-0011 — CSS Modules + design tokens (CSS custom properties)

**وضعیت:** Accepted (2026-10-27) · **تاریخ:** 2026-10-27

## Context
کاربر بدون کد تم را عوض می‌کند و تغییر باید بدون rebuild فرانت در runtime اعمال شود. style هر node باید امن (بدون CSS injection) و responsive باشد.

## Decision
- **CSS Modules** برای استایل داخلی کامپوننت‌ها و UI studio؛ هیچ UI kit.
- **Design tokens** (theme.schema.json) → style engine آن‌ها را به CSS custom properties تبدیل می‌کند (`color.surface.raised` → `--color-surface-raised`) و روی root runtime/preview تزریق می‌کند. CSS Modules فقط از `var(--…)` استفاده می‌کنند.
- **Style nodeها**: فقط کلیدهای whitelist (`styleBlock`) و مقادیر محدود (token ref، طول با واحد مجاز، رنگ hex/rgb، keyword). style engine آن‌ها را به inline custom properties روی node (`--n-padding`) و کلاس‌های ثابت نگاشت می‌کند؛ هیچ رشتهٔ CSS آزاد تولید نمی‌شود.
- Responsive: overrideهای `responsive.tablet/mobile` → media query‌های ثابت بر اساس `breakpoints` تم (کلاس‌های از پیش تعریف‌شده + custom properties per-breakpoint).
- RTL: `dir` از تنظیمات سند؛ استفاده از ویژگی‌های منطقی CSS (`margin-inline-start`, ...).
- فونت: Vazirmatn self-hosted (A-08).

## Alternatives
- Tailwind: کلاس‌های utility برای محتوای پویای کاربر مناسب نیست (کلاس‌ها باید در build شناخته شوند).
- CSS-in-JS runtime (styled-components/emotion): هزینهٔ runtime و ریسک تزریق اگر رشته‌ها از کاربر بیایند.

## Consequences
- + تعویض تم = تعویض مقادیر متغیرها؛ بدون rebuild؛ CSP سخت (`style-src 'self'` + custom properties inline روی elementها مستلزم `style` attribute است → `style-src-attr 'unsafe-inline'` فقط برای attribute؛ ریسک پایین چون مقادیر whitelist‌اند).
- − مجموعهٔ ویژگی‌های استایل محدود است (آگاهانه).
