# ADR-0010 — احراز هویت و مجوزدهی

**وضعیت:** Accepted (2026-10-27) · **تاریخ:** 2026-10-27

## Context
کاربران مرورگر (studio/runtime) روی شبکهٔ داخلی؛ در آینده ادغام با AD/OIDC سازمانی. توکن در `localStorage` (مثل اپ موجود) در برابر XSS آسیب‌پذیر است.

## Decision
- **Session سمت سرور**: کوکی `ipsid` (توکن تصادفی 256 بیت؛ در DB فقط SHA-256 آن)، `HttpOnly; Secure; SameSite=Lax; Path=/`، انقضای مطلق ۱۲ ساعت + idle ۲ ساعت، چرخش پس از login.
- **CSRF**: هدر `X-CSRF-Token` (مقدار برگشتی login، HMAC روی session) برای همهٔ متدهای unsafe؛ به‌علاوهٔ بررسی `Origin`.
- رمز عبور: Argon2id؛ محدودیت نرخ login per-IP و per-username (پاسخ 429)؛ پیام خطای یکسان.
- **Bearer tokens** (service/personal) در فاز ۹ با همان مدل مجوز.
- **RBAC سطح پروژه**: نقش‌ها `owner, admin, designer, engineer, operator, viewer` → مجموعهٔ permissionها (`page.edit`, `page.publish`, `component.edit`, `component.publish`, `object.edit`, `object_type.edit`, `data_source.manage`, `model.edit`, `model.run`, `model.publish`, `theme.edit`, `theme.publish`, `template.edit`, `template.publish`, `runtime.view`, `project.manage`, `project.manage_members`, `project.audit`, ...). `is_platform_admin` برای ایجاد پروژه و مدیریت کاربران.
- اعمال: dependency `require("page.publish")` روی هر route؛ `project_id` از منبع resolve می‌شود؛ منابع پروژه‌ای که کاربر عضو آن نیست → 404. تست خودکار: هر route در OpenAPI یک `x-permission` دارد و هر route FastAPI یک dependency مجوز.
- **OIDC** (Keycloak/AD FS) در فاز ۹ به‌عنوان روش login اضافه؛ session همان می‌ماند.

## Alternatives
- JWT در localStorage: ابطال سخت، XSS.
- JWT در کوکی: مزیتی بر session سمت سرور در monolith ندارد؛ ابطال سخت‌تر.

## Consequences
- + ابطال فوری، امن در برابر XSS برای سرقت توکن.
- − runtime و api باید هم‌origin باشند (nginx reverse proxy) — در استقرار on-prem مشکلی نیست.
