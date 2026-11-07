# ۰۵ — نقشهٔ راه (فازهای ۰ تا ۱۰) و اسپرینت‌ها

اسپرینت‌ها دوهفته‌ای؛ شروع فرضی دوشنبه 2026-11-02. راهبرد: **اول یک Vertical Slice نازک از همهٔ لایه‌ها** (VS-1، اسپرینت ۱–۳)، سپس پهن کردن هر لایه. هر فاز = یک حوزهٔ قابلیت؛ اسپرینت‌ها ممکن است چند فاز را موازی جلو ببرند.

## فازها
| فاز | عنوان | خروجی اصلی | پیش‌نیاز |
|---|---|---|---|
| 0 | Discovery & Contracts | همین اسناد، schemas، OpenAPI، ADRها | — |
| 1 | Foundations | scaffold backend/frontend، Docker Compose، CI، DB baseline + MongoDB migrations، iam/session/CSRF، projects، seed roles/units | 0 |
| 2 | Design Core | document-engine (commands, undo/redo, validation)، element registry، rendering، layout engine (flow+grid)، style engine + tokens + responsive، Theme Builder | 1 |
| 3 | Component Studio | definitions/versions، propertySpec → inspector، rendererهای داخلی (KPI, gauge, line/bar chart, table, status, svg-symbol)، usages | 2 |
| 4 | Objects & Data | object types/versions، objects tree، units، data source `scada_http_ws` + credentials، signal browser، DataBindings، live gateway | 1 |
| 5 | Page/Dashboard Builder & Publishing | DnD editor، dashboard grid، preview، publish + pins + bundle، runtime app، revisions/rollback | 2, 3, 4 |
| 6 | Templates, Header/Footer, Menus | template + slot، template parts + display conditions، menus، republish ابزار | 5 |
| 7 | Modeling | engine (parser/AST/DAG/evaluator)، model editor، worker + queue، results، binding `model_output`؛ سپس schedule/event و ورودی تاریخچه‌ای | 1 (engine)، 4 (ورودی‌ها)، 5 (نمایش) |
| 8 | Reports | قرارداد Report، report builder (همان design core)، خروجی PDF/CSV، زمان‌بندی | 5, 7 |
| 9 | Hardening | OIDC، bearer tokens، ارزیابی RLS، CSP/headers، rate limits، backup/restore، observability، load test، audit UI | 5 |
| 10 | Extensions | adapterهای MQTT/OPC UA/SQL، React Flow (گراف اشیاء/مدل)، soft-lock ویرایش، i18n کامل، مقیاس افقی (Redis pub/sub) | 9 |

**MVP** = فازهای ۱ تا ۷ (بخش manual-run) + بخش‌های لازم ۶ (header ساده). هدف: پایان اسپرینت ۸.

## گانت

```mermaid
gantt
  title Industrial Visual Platform — roadmap (2-week sprints)
  dateFormat YYYY-MM-DD
  axisFormat %b %d
  section Phase 0–1
  P0 Discovery & contracts (done)         :done, p0, 2026-10-19, 2026-10-30
  S1 Foundations (scaffold, CI, auth, DB)  :s1, 2026-11-02, 14d
  section Vertical Slice 1
  S2 VS-1 backend (doc, publish, runtime)  :s2, after s1, 14d
  S3 VS-1 frontend (editor-lite, runtime)  :s3, after s2, 14d
  VS-1 demo                                :milestone, m1, after s3, 0d
  section Widen layers
  S4 Design core + Theme builder (P2)      :s4, after s3, 14d
  S5 Component Studio (P3)                 :s5, after s4, 14d
  S5b Object Studio + data (P4)            :s5b, after s4, 14d
  Modeling engine lib (P7a, parallel)      :me, after s1, 28d
  S7 Modeling UI + worker + results (P7a)  :s7, after s5, 14d
  S8 Templates/Header/Menus (P6) + MVP e2e :s8, after s7, 14d
  MVP acceptance                           :milestone, m2, after s8, 0d
  section Post-MVP
  S9–S10 Schedules/events (P7b) + Reports (P8) :s9, after s8, 28d
  S11–S12 Hardening (P9)                   :s11, after s9, 28d
  S13+ Extensions (P10)                    :s13, after s11, 28d
```

## گراف وابستگی و کارهای موازی

```mermaid
flowchart LR
  P0[P0 Contracts] --> P1[P1 Foundations]
  P1 --> P2[P2 Design core]
  P1 --> P4[P4 Objects & Data]
  P1 --> P7E[P7a Engine lib]
  P2 --> P3[P3 Component Studio]
  P2 & P3 & P4 --> P5[P5 Builder + Publish + Runtime]
  P5 --> P6[P6 Templates/Header/Menus]
  P7E & P4 & P5 --> P7[P7 Modeling UI/runs]
  P5 & P7 --> P8[P8 Reports]
  P5 --> P9[P9 Hardening]
  P9 --> P10[P10 Extensions]
```

**موازی‌سازی‌ها:**
- موتور مدل‌سازی (کتابخانهٔ خالص Python) از اسپرینت ۲ به‌طور مستقل توسط مهندس مدل‌سازی جلو می‌رود (ورودی: `contracts/tools/semantic.py`).
- فاز ۳ (frontend-heavy) و فاز ۴ (backend-heavy + یکپارچه‌سازی SCADA) در اسپرینت ۵ موازی‌اند.
- QA: تست‌های قراردادی و e2e هر اسپرینت هم‌زمان با توسعه؛ DevOps: CI/Compose در S1، backup/observability در S11.
- Theme Builder (UI) پس از style engine، موازی با Component Studio ممکن است.

## مسیر بحرانی
P1 → VS-1 (S2–S3) → Design core (S4) → Component Studio (S5) → Modeling UI (S7) → MVP e2e (S8). ریسک اصلی مسیر: دسترسی واقعی به SCADA و قرارداد آن (R-01) — باید در S1 حل شود.
