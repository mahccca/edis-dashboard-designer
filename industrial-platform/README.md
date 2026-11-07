# Industrial Visual Platform

پلتفرم بصری ماژولار برای محیط‌های صنعتی (الهام‌گرفته از page builderها): تم و design tokens، header/footer/menu/template با display rules، کامپوننت‌های گرافیکی schema-driven و نسخه‌دار، اشیاء صنعتی، binding داده، داشبورد با drag & drop، مدل‌های محاسباتی امن، preview/publish/rollback و runtime جدا از editor.

**وضعیت: اسپرینت ۱–۳ (Foundations + Vertical Slice 1)** — جزئیات و موارد مسدود در [docs/sprints/09-vs1-status.md](docs/sprints/09-vs1-status.md). اپ `darkhoveyn-scada` در ریشهٔ workspace جداگانه و دست نخورده است.

> **دادهٔ آزمایشی:** تنها منبع دادهٔ پیاده‌شده `simulated` است (منحنی قطعی، نه دادهٔ واقعی نیروگاه) و همه‌جا با «داده آزمایشی / Test data» برچسب می‌خورد. adapter واقعی SCADA (`scada_http_ws`) تا تأیید قرارداد پیاده نشده و پشت `IP_FEATURE_SCADA_ADAPTER` است.

## محتوا
| مسیر | شرح |
|---|---|
| [docs/architecture/01-requirements-analysis.md](docs/architecture/01-requirements-analysis.md) | نیازمندی‌ها، ابهام‌ها، فرض‌ها، سناریوی پایلوت |
| [docs/architecture/02-high-level-architecture.md](docs/architecture/02-high-level-architecture.md) | معماری، نمودار ماژول‌ها، design-time/runtime/modeling |
| [docs/database/03-data-model.md](docs/database/03-data-model.md) | مدل داده و ERD |
| [docs/architecture/04-repository-structure.md](docs/architecture/04-repository-structure.md) | ساختار مخزن |
| [docs/sprints/05-roadmap.md](docs/sprints/05-roadmap.md) | فازهای ۰–۱۰، گانت، وابستگی‌ها |
| [docs/sprints/06-task-backlog.md](docs/sprints/06-task-backlog.md) | جدول کارها |
| [docs/architecture/07-risks-and-decisions.md](docs/architecture/07-risks-and-decisions.md) | ریسک‌ها و تصمیم‌های نیازمند تأیید |
| [docs/sprints/08-vertical-slice-01.md](docs/sprints/08-vertical-slice-01.md) | تعریف اولین Vertical Slice |
| [docs/sprints/09-vs1-status.md](docs/sprints/09-vs1-status.md) | وضعیت Done/In Progress/Blocked و نتایج AT |
| [backend/](backend) | FastAPI + PyMongo (MongoDB replica set)؛ `app/modules/*`، migrationها در `app/migrations` |
| [frontend/](frontend) | React + TS + Vite؛ entryهای `index.html` (studio) و `runtime.html` (runtime) |
| [infra/compose.yaml](infra/compose.yaml) | MongoDB (replica set تک‌عضوی) برای توسعه (Docker) |
| [docs/api/api-conventions.md](docs/api/api-conventions.md) | قراردادهای REST و WebSocket |
| [docs/adr/](docs/adr/README.md) | ADR-0001 … ADR-0015 (0015: MongoDB به‌جای PostgreSQL) |
| [contracts/schemas/](contracts/schemas) | JSON Schema 2020-12 (v1) |
| [contracts/examples/](contracts/examples) | مثال‌های معتبر/نامعتبر + manifest |
| [contracts/openapi/openapi.yaml](contracts/openapi/openapi.yaml) | OpenAPI 3.1 |
| [contracts/tools/semantic.py](contracts/tools/semantic.py) | validator معنایی مرجع + parser امن فرمول |

## اجرای تست‌های قرارداد (PowerShell)
```powershell
cd industrial-platform
python -m venv .venv
.\.venv\Scripts\python -m pip install -r contracts\requirements-dev.txt
cd contracts
..\.venv\Scripts\python -m pytest
```

## اجرای محلی (PowerShell)
پیش‌نیاز: Python ≥ 3.13، Node 22، **MongoDB ≥ 8 به‌صورت replica set** (تراکنش لازم است) — portable یا Docker. جزئیات طراحی: [ADR-0015](docs/adr/0015-mongodb-single-datastore.md).

```powershell
cd industrial-platform

# 1) MongoDB
#  الف) Docker:
Copy-Item infra\.env.example infra\.env   # IP_MONGO_ROOT_PASSWORD و IP_MONGO_KEYFILE را تنظیم کنید
docker compose -f infra/compose.yaml --env-file infra/.env up -d   # healthcheck replica set rs0 را initiate می‌کند
#  ب) portable (بدون نصب/ادمین): zip رسمی Community را در پوشه‌ای خارج از مخزن باز کنید و mongod را با
#     --port 27018 --bind_ip 127.0.0.1 --replSet rs0 --keyFile <file> --auth اجرا کنید؛ سپس replSetInitiate و
#     ساخت کاربر root از طریق localhost exception. رمزها فقط در همان پوشه، نه در مخزن.

# 2) Backend: migration و کاربر محدود اپلیکیشن با هویت admin، اجرای API با کاربر محدود
.\.venv\Scripts\python -m pip install -e "backend[dev]"
cd backend
$env:IP_MONGODB_ADMIN_URL = "mongodb://ip_admin:<pw>@127.0.0.1:27018/?replicaSet=rs0&authSource=admin"   # placeholder
$env:IP_MONGODB_URL = $env:IP_MONGODB_ADMIN_URL; $env:IP_MONGODB_DB = "ip_dev"
..\.venv\Scripts\python -m app.cli migrate                       # migrate --check: drift/معلق → exit 1
$env:IP_NEW_APP_USER_PASSWORD = Read-Host "app user password (>= 16 chars)"
..\.venv\Scripts\python -m app.cli provision-app-user --username ip_app
$env:IP_MONGODB_URL = "mongodb://ip_app:<app pw>@127.0.0.1:27018/ip_dev?replicaSet=rs0&authSource=ip_dev"
Remove-Item Env:IP_NEW_APP_USER_PASSWORD, Env:IP_MONGODB_ADMIN_URL, Env:IP_MONGODB_DB
$env:IP_COOKIE_SECURE = "false"                                  # فقط http://localhost
$env:IP_NEW_USER_PASSWORD = Read-Host "password (>= 12 chars)"
..\.venv\Scripts\python -m app.cli create-user --username admin --display-name "Admin" --platform-admin
Remove-Item Env:IP_NEW_USER_PASSWORD
..\.venv\Scripts\python -m app.cli seed-pilot --project-slug darkhoveyn --owner admin   # دادهٔ آزمایشی
..\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 3) Frontend (ترمینال دیگر)
cd frontend
npm install
npm run dev        # studio: http://localhost:5180/  · runtime: http://localhost:5180/runtime.html?site=darkhoveyn&path=/plant/overview
```

تست‌ها:
```powershell
# backend: unit + integration روی MongoDB واقعی. هر اجرا DB یکتای ip_test_* را migrate می‌کند، نقش ipApp و یک کاربر
# محدود موقت می‌سازد، API را با همان کاربر محدود اجرا و در پایان همه را حذف می‌کند.
cd backend
$env:IP_TEST_MONGODB_URL = "mongodb://ip_admin:<pw>@127.0.0.1:27018/?replicaSet=rs0&authSource=admin"
..\.venv\Scripts\python -m pytest --cov        # بدون IP_TEST_MONGODB_URL تست‌های integration با دلیل صریح skip می‌شوند (هرگز mongomock)

# frontend
cd ..\frontend
npm run typecheck; npm test; npm run build     # build شامل بررسی bundle runtime (AT-11) است
```
همهٔ تنظیمات در [backend/.env.example](backend/.env.example) (فقط placeholder؛ فایل `.env` واقعی git-ignore است).

