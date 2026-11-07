from dataclasses import dataclass

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import ApiError
from app.modules.iam import service as iam
from app.modules.iam.models import AuthSession, User

SESSION_COOKIE = "ipsid"
UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


@dataclass
class Ctx:
    db: Session
    user: User | None
    session: AuthSession | None
    request: Request

    @property
    def request_id(self) -> str | None:
        return getattr(self.request.state, "request_id", None)

    @property
    def ip(self) -> str | None:
        return self.request.client.host if self.request.client else None


def origin_allowed(origin: str | None) -> bool:
    allowed = get_settings().allowed_origins
    return origin is None or not allowed or origin in allowed


def _load(request: Request, db: Session) -> Ctx:
    found = iam.resolve_session(db, request.cookies.get(SESSION_COOKIE))
    user, session = found if found else (None, None)
    if request.method in UNSAFE:
        if not origin_allowed(request.headers.get("origin")):
            raise ApiError(403, "origin_not_allowed", "Cross-origin request rejected")
        if session is not None and not iam.csrf_ok(session, request.headers.get("x-csrf-token")):
            raise ApiError(403, "csrf_failed", "Missing or invalid X-CSRF-Token")
    return Ctx(db, user, session, request)


def current(request: Request, db: Session = Depends(get_db)) -> Ctx:
    """Authenticated request context (401 otherwise). CSRF is enforced on unsafe methods."""
    ctx = _load(request, db)
    if ctx.user is None:
        raise ApiError(401, "unauthenticated", "Authentication required")
    return ctx


def optional(request: Request, db: Session = Depends(get_db)) -> Ctx:
    """For runtime endpoints that may be public (project.runtime_visibility = public)."""
    return _load(request, db)
