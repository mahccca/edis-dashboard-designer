import re
import uuid

from fastapi import APIRouter, FastAPI, Request

from app.core.errors import install_error_handlers
from app.modules.components.api import router as components_router
from app.modules.data_bindings.api import router as bindings_router
from app.modules.data_sources.api import router as data_sources_router
from app.modules.design.api import router as pages_router
from app.modules.iam.api import router as auth_router
from app.modules.industrial_objects.api import router as objects_router
from app.modules.projects.api import router as projects_router
from app.modules.runtime.api import router as runtime_router

API_PREFIX = "/api/v1"
_REQUEST_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")


def create_app() -> FastAPI:
    app = FastAPI(title="Industrial Visual Platform API", version="0.1.0", docs_url=f"{API_PREFIX}/docs",
                  openapi_url=f"{API_PREFIX}/openapi.json", redoc_url=None)

    @app.middleware("http")
    async def request_id(request: Request, call_next):  # type: ignore[no-untyped-def]
        incoming = request.headers.get("x-request-id", "")
        request.state.request_id = incoming if _REQUEST_ID.match(incoming) else str(uuid.uuid4())
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        return response

    install_error_handlers(app)

    api = APIRouter(prefix=API_PREFIX)

    @api.get("/health", tags=["ops"])
    def health() -> dict:
        return {"status": "ok"}

    for router in (auth_router, projects_router, components_router, objects_router, data_sources_router,
                   bindings_router, pages_router, runtime_router):
        api.include_router(router)
    app.include_router(api)
    return app


app = create_app()
