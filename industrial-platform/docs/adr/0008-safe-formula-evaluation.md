# ADR-0008 — ارزیابی امن فرمول

**وضعیت:** Accepted (2026-10-27) · **تاریخ:** 2026-10-27

## Context
فرمول‌ها در مدل‌ها، قواعد اعتبارسنجی کامپوننت، شرط alarm و transform binding استفاده می‌شوند. `eval`/`exec` یا `ast.literal_eval` توسعه‌یافته، یا کتابخانه‌هایی که به namespace پایتون دسترسی می‌دهند، غیرقابل قبول‌اند.

## Decision
- **گرامر اختصاصی کوچک** (EBNF در `contracts/schemas/expression.schema.json`): اعداد، `true/false`، شناسه‌های اعلام‌شده، `+ - * / % ^`، مقایسه (غیرانجمنی)، `&& || !`، شرطی `?:`، فراخوانی فقط توابع whitelist (`abs, min, max, clamp, round, floor, ceil, sqrt, exp, ln, log10, if, safe_div`). **رشته، دسترسی عضو، اندیس، انتساب، حلقه وجود ندارد.**
- **سه لایه دفاع**: (۱) JSON Schema: whitelist کاراکتر (کوتیشن، براکت، backslash، `;` رد می‌شوند)؛ (۲) parser دست‌نویس recursive-descent → AST (`expression.schema.json`)، رد توابع ناشناخته و شناسه‌های با `_`؛ (۳) evaluator روی AST با شمارندهٔ گام، عمق محدود (64)، و اجرای مدل در subprocess با timeout (ADR-0009).
- تحلیل معنایی: همهٔ شناسه‌ها باید input/parameter/variable اعلام‌شده باشند؛ DAG وابستگی بدون چرخه؛ خروجی‌ها به خروجی دیگر وابسته نیستند؛ واحدها (v1: هشدار).
- AST کامپایل‌شده در `model_versions.compiled` ذخیره می‌شود؛ worker هرگز متن را دوباره parse نمی‌کند.
- پیاده‌سازی مرجع در `contracts/tools/semantic.py` (با تست) — backend `modeling/engine` از آن شروع می‌کند؛ editor برای بازخورد آنی همان گرامر را در TS دارد (فقط validate؛ ارزیابی نهایی سرور).
- تقسیم بر صفر: `/` خطای `math_error` می‌دهد؛ `safe_div(a, b, fallback)` برای حالت‌های مورد انتظار.

## Alternatives
- `simpleeval`/`asteval`: بر پایهٔ AST پایتون؛ سطح حمله و نگهداری وابستگی خارجی؛ گرامر پایتون را به کاربر تحمیل می‌کند.
- `numexpr`/`sympy`: قدرتمند ولی بیش از نیاز و سطح حملهٔ بیشتر (sympy از eval استفاده می‌کند).

## Consequences
- + سطح حملهٔ حداقلی؛ پیام خطای دقیق؛ AST قابل نمایش (dependency graph).
- − توابع آماری روی سری زمانی (avg روی پنجره) خارج از گرامر v1؛ با `aggregation/window` در `inputSource` حل می‌شود.
