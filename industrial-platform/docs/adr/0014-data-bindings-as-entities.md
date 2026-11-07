# ADR-0014 — DataBinding به‌عنوان موجودیت مستقل

**وضعیت:** Accepted (2026-10-27) · **تاریخ:** 2026-10-27

## Context
DataBinding در فهرست موجودیت‌های الزامی است. دو گزینه: (الف) spec binding داخل node سند (inline)؛ (ب) موجودیت مستقل در جدول `data_bindings` و ارجاع با `bindingId` از node.

## Decision
گزینهٔ **(ب)**:
- node فقط `bindings: { "<prop>": { "bindingId": "<uuid>", "fallback": null } }` دارد.
- `data_bindings` source (`object_variable` / `model_output` / `static`)، transform (واحد، اعشار، عبارت امن روی `value`) و delivery (`live`/`poll`/`on_load`, `staleAfterMs`) را نگه می‌دارد؛ FKهای `object_id`/`model_id` استخراج‌شده برای integrity و where-used.
- UX: وقتی کاربر در inspector یک prop را bind می‌کند، editor binding را بی‌صدا می‌سازد (یا binding موجود را پیشنهاد می‌دهد)؛ کاربر مفهوم جداگانه‌ای نمی‌بیند مگر بخواهد.
- انتشار: specهای binding در bundle snapshot می‌شوند؛ ویرایش binding روی نسخهٔ منتشرشده اثری ندارد.
- authz و resolve فقط سمت سرور؛ runtime فقط bindingهای داخل bundle را می‌تواند subscribe کند.

## Alternatives
- Inline: سند خودکفا و ساده‌تر، ولی موجودیت مستقل/where-used/استفادهٔ مجدد/تغییر متمرکز (مثلاً جایگزینی شیء) را از دست می‌دهیم و validation پراکنده می‌شود.

## Consequences
- + یک نقطهٔ اعتبارسنجی، استفادهٔ مجدد، impact analysis («کدام صفحات از INV-01 استفاده می‌کنند؟»).
- − bindingهای یتیم (بدون node ارجاع‌دهنده) → garbage collection دوره‌ای یا نمایش در UI «استفاده‌نشده».
- این تصمیم نیاز به تأیید کاربر دارد (D-03).
