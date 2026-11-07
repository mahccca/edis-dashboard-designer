# ۰۴ — ساختار مخزن (نهایی پیشنهادی)

> فقط پوشه‌هایی که الان محتوای واقعی دارند ساخته شده‌اند (`docs/`, `contracts/`). بقیه در فاز ۱ با اولین کد واقعی ایجاد می‌شوند — هیچ پوشهٔ خالی/placeholder ساخته نشده.

```text
improve-react/                      ← ریشهٔ workspace (git)
├─ src/, package.json, ...          ← اپ موجود darkhoveyn-scada (دست نخورده؛ D-01)
└─ industrial-platform/
   ├─ README.md
   ├─ docs/
   │  ├─ architecture/              01 requirements · 02 architecture · 04 repo structure · 07 risks & decisions
   │  ├─ adr/                       0001…0014
   │  ├─ api/                       api-conventions.md (REST + WebSocket)
   │  ├─ database/                  03 data model + ERD
   │  └─ sprints/                   05 roadmap · 06 task backlog · 08 vertical slice 1
   ├─ contracts/                    ← منبع حقیقت قراردادها (زبان‌مستقل)
   │  ├─ schemas/                   *.schema.json (JSON Schema 2020-12, $id …/v1/)
   │  ├─ examples/{valid,invalid}/  + manifest.json
   │  ├─ openapi/openapi.yaml       OpenAPI 3.1 (به schemas/ ارجاع می‌دهد)
   │  ├─ tools/semantic.py          validator معنایی مرجع + parser فرمول
   │  ├─ tests/                     pytest: schemas, examples, formula, OpenAPI
   │  ├─ pytest.ini · requirements-dev.txt
   ├─ backend/                      (فاز ۱)
   │  ├─ pyproject.toml
   │  ├─ app/
   │  │  ├─ main.py                 FastAPI app factory, router mounting
   │  │  ├─ core/                   config (pydantic-settings), db session, errors(problem+json),
   │  │  │                          etag/if-match, pagination, security(csrf), logging
   │  │  ├─ modules/
   │  │  │  ├─ iam/                 users, roles, permissions, sessions
   │  │  │  ├─ projects/
   │  │  │  ├─ design/              documents, revisions, pages, templates, template_parts,
   │  │  │  │                       display_conditions, menus, themes, media, document_engine/(validate, migrations)
   │  │  │  ├─ components/
   │  │  │  ├─ industrial_objects/  types, objects, relations, units
   │  │  │  ├─ data_sources/        adapters/ (scada_http_ws, manual), credentials
   │  │  │  ├─ data_bindings/
   │  │  │  ├─ modeling/            engine/ (pure: parser, ast, dag, evaluator) + service
   │  │  │  ├─ model_runs/
   │  │  │  ├─ publishing/          published versions, pins, bundle builder
   │  │  │  ├─ runtime/             resolve, values, ws gateway
   │  │  │  └─ audit/
   │  │  │     (each: api.py · service.py · repository.py · models.py · schemas.py)
   │  │  ├─ migrations/              MongoDB migrations (mNNNN_*.py) + runner (ADR-0015)
   │  │  └─ workers/model_worker.py
   │  └─ tests/{unit,integration,contract}/
   ├─ frontend/                     (فاز ۱)
   │  ├─ package.json · vite.config.ts · tsconfig.json
   │  └─ src/
   │     ├─ apps/
   │     │  ├─ studio/              entry design-time (router, shell)
   │     │  └─ runtime/             entry viewer (بدون کد editor)
   │     ├─ modules/
   │     │  ├─ platform/            login, projects, members
   │     │  ├─ theme-builder/
   │     │  ├─ component-studio/
   │     │  ├─ object-studio/
   │     │  ├─ page-builder/        EditorShell + configs: page · template · header/footer
   │     │  ├─ dashboard-builder/   config + grid layout
   │     │  └─ modeling/
   │     │     (reports/ در فاز ۸)
   │     └─ shared/
   │        ├─ document-engine/     commands, undo/redo, validation (ajv), serialization
   │        ├─ element-registry/    builtin renderers registry
   │        ├─ renderers/           kpi-card, gauge, line-chart (ECharts), table, status, svg-symbol
   │        ├─ layout-engine/  ·  style-engine/  ·  rendering/
   │        ├─ live-data/           WS client, subscriptions, quality/stale
   │        ├─ api/                 generated types (openapi-typescript) + client
   │        └─ ui/                  base controls (CSS Modules)
   ├─ infra/
   │  ├─ compose.yaml               mongo (replica set), api, worker, web
   │  ├─ docker/                    api.Dockerfile, web.Dockerfile, nginx.conf
   │  └─ scripts/                   dev bootstrap, db reset (PowerShell + sh)
   └─ tests/e2e/                    Playwright — سناریوهای پذیرش MVP
```

## توجیه تفاوت‌ها با ساختار پیشنهادی
| پیشنهاد | نهایی | دلیل |
|---|---|---|
| `modules/users` | `iam` | sessions، roles، permissions و authz یک bounded context هستند |
| `pages`, `themes` جدا | داخل `design` | همهٔ اسناد یک document engine/revision/publish مشترک دارند (design core واحد) |
| — | `publishing`, `runtime`, `audit` | جداسازی صریح design-time از runtime و انتشار تغییرناپذیر |
| `app/services` سراسری | `service.py` در هر ماژول | مرز ماژول = public service؛ پوشهٔ سراسری مرزها را محو می‌کند |
| `models` + `model_runs` | `modeling` (engine خالص) + `model_runs` | موتور بدون وابستگی به web/ORM، قابل تست و قابل استخراج |
| `frontend/src/app` | `src/apps/{studio,runtime}` | دو bundle مجزا؛ runtime سبک و بدون editor |
| `shared/types` | `shared/api` (تولیدی) | types از OpenAPI تولید می‌شوند، نه دستی |
| — | `contracts/examples`, `contracts/tools`, `contracts/tests` | قرارداد اجرایی و تست‌پذیر، مستقل از backend/frontend |
| `frontend/src/tests` | تست‌ها کنار کد (`*.test.ts`) + `tests/e2e` در ریشهٔ پروژه | قرارداد رایج Vitest؛ e2e سراسری است |
| `modules/reports` | فاز ۸ | پوشهٔ خالی نمی‌سازیم |

## قواعد وابستگی (lint)
- frontend: `modules/*` → `shared/*` مجاز؛ `shared` → `modules` ممنوع؛ `apps/runtime` → `modules/*` ممنوع (فقط `shared`). با `eslint-plugin-boundaries`.
- backend: `modules/X` → `modules/Y/service` مجاز؛ → `modules/Y/models|repository` ممنوع؛ `modeling/engine` → هیچ چیز جز stdlib. با `import-linter`.
