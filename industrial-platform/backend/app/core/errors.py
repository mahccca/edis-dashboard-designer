import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError, IntegrityError, OperationalError
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("app")
ERROR_BASE = "https://errors.industrial-platform.local/"


class ApiError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        title: str,
        detail: str | None = None,
        errors: list[dict[str, str]] | None = None,
        **extra: Any,
    ):
        super().__init__(title)
        self.status, self.code, self.title, self.detail = status, code, title, detail
        self.errors, self.extra = errors, extra


def not_found(what: str = "resource") -> ApiError:
    return ApiError(404, "not_found", f"{what} not found")


def forbidden(permission: str) -> ApiError:
    return ApiError(403, "forbidden", "Permission denied", f"requires {permission}")


def unprocessable(errors: list[dict[str, str]], title: str = "Validation failed") -> ApiError:
    return ApiError(422, "validation_failed", title, errors=errors)


def conflict(code: str, title: str, detail: str | None = None) -> ApiError:
    return ApiError(409, code, title, detail)


def problem(request: Request, status: int, code: str, title: str, detail: str | None = None,
            errors: list[dict[str, str]] | None = None, **extra: Any) -> JSONResponse:
    body: dict[str, Any] = {
        "type": ERROR_BASE + code.replace("_", "-"),
        "title": title,
        "status": status,
        "code": code,
        "instance": request.url.path,
        "requestId": getattr(request.state, "request_id", None),
    }
    if detail:
        body["detail"] = detail
    if errors:
        body["errors"] = errors
    body.update(extra)
    return JSONResponse(body, status_code=status, media_type="application/problem+json")


def _loc_to_pointer(loc: tuple[Any, ...]) -> str:
    parts = [str(p) for p in loc if p not in ("body",)]
    return "/" + "/".join(parts) if parts else ""


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError) -> JSONResponse:
        return problem(request, exc.status, exc.code, exc.title, exc.detail, exc.errors, **exc.extra)

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            {"pointer": _loc_to_pointer(tuple(e.get("loc", ()))), "code": str(e.get("type")), "message": str(e.get("msg"))}
            for e in exc.errors()
        ]
        return problem(request, 422, "validation_failed", "Validation failed", errors=errors)

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return problem(request, exc.status_code, "http_error", str(exc.detail))

    @app.exception_handler(IntegrityError)
    async def _integrity(request: Request, exc: IntegrityError) -> JSONResponse:
        return problem(request, 409, "conflict", "Conflicting write", "a unique value is already taken")

    @app.exception_handler(OperationalError)
    async def _operational(request: Request, exc: OperationalError) -> JSONResponse:
        log.error("database unavailable: %s", exc)
        return problem(request, 503, "database_unavailable", "Database unavailable")

    @app.exception_handler(DBAPIError)
    async def _dbapi(request: Request, exc: DBAPIError) -> JSONResponse:
        log.exception("database error", extra={"request_id": getattr(request.state, "request_id", None)})
        return problem(request, 500, "internal_error", "Internal server error")

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error", extra={"request_id": getattr(request.state, "request_id", None)})
        return problem(request, 500, "internal_error", "Internal server error")
