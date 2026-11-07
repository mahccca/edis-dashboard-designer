# ADR-0006 — نسخه‌های منتشرشدهٔ تغییرناپذیر و pin‌شده

**وضعیت:** Accepted (2026-10-27); سازوکار اجرا Superseded by [ADR-0015](0015-mongodb-single-datastore.md) — trigger/`ON DELETE RESTRICT`/جدول `published_version_pins` جای خود را به `AppendOnlyRepo` + نقش `ipApp` (find+insert) و pinهای embed در `published_versions` داده‌اند. اصل تصمیم (snapshot تغییرناپذیر، pin دقیق، دو نوع rollback) بدون تغییر است. · **تاریخ:** 2026-10-27

## Context
در محیط صنعتی، صفحه‌ای که اپراتور می‌بیند نباید با ویرایش یک کامپوننت، تم یا binding در جای دیگر بی‌صدا تغییر کند. Rollback باید فوری و قطعی باشد.

## Decision
- **PublishedVersion** = snapshot کامل و خوداتکا (`bundle` JSONB): محتوای سند، spec دقیق هر نسخهٔ کامپوننت استفاده‌شده، tokens نسخهٔ تم، اسناد header/footer منطبق (از نسخهٔ زندهٔ خودشان)، منوها، specهای binding، و `bundle_hash`.
- ارجاع‌ها در `published_version_pins` با `ON DELETE RESTRICT` ثبت می‌شوند؛ نسخهٔ pin‌شده قابل حذف نیست.
- در سند همیشه **نسخهٔ دقیق** کامپوننت (`version: "1.2.0"`) ذخیره می‌شود، نه range. ارتقا فقط با فرمان صریح editor (و `compatibility.upgradeFrom` اعلامی).
- انتشار فقط با نسخه‌های کامپوننت `published` مجاز است (draft فقط در preview).
- Immutable: trigger روی UPDATE/DELETE + نقش DB بدون UPDATE.
- **دو نوع rollback**:
  1. *Runtime rollback*: `activate` نسخهٔ منتشرشدهٔ قبلی → فقط pointer `documents.live_published_version_id` تغییر می‌کند.
  2. *Draft rollback*: `restore` یک revision قدیمی → revision جدید (تاریخچه بازنویسی نمی‌شود).
- انتشار header/footer **صفحات منتشرشده را تغییر نمی‌دهد** (تصمیم D-04 برای «propagate» در فاز ۶).

## Alternatives
- Bundle فقط با ارجاع (بدون snapshot spec): کوچک‌تر، ولی وابستگی runtime به جداول طراحی و ریسک تغییر.
- Range semver در سند: ارتقای خودکار patch؛ ولی با الزام «pinned» در تضاد است.

## Consequences
- + runtime قطعی، cacheable (ETag = id)، rollback O(1).
- − تکرار داده در bundleها (چند ده KB هر نسخه — پذیرفتنی). bundle‌ها فشرده (TOAST) ذخیره می‌شوند.
- − به‌روزرسانی سراسری header نیازمند republish صفحات است (ابزار batch در فاز ۶).
