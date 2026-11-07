from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import SESSION_COOKIE, Ctx, current, origin_allowed
from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import ApiError
from app.modules.audit.service import record
from app.modules.iam import service
from app.modules.iam.models import ProjectMember, RolePermission, User

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    model_config = {"extra": "forbid"}
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=512)


def user_dict(user: User) -> dict:
    return {"id": str(user.id), "username": user.username, "displayName": user.display_name, "locale": user.locale}


@router.post("/login")
def login(body: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> dict:
    if not origin_allowed(request.headers.get("origin")):
        raise ApiError(403, "origin_not_allowed", "Cross-origin request rejected")
    ip = request.client.host if request.client else None
    try:
        user = service.authenticate(db, body.username, body.password, ip)
    except ApiError:
        db.commit()
        raise
    token, session = service.start_session(db, user, ip, request.headers.get("user-agent"))
    record(db, action="auth.login", entity_type="user", entity_id=user.id, actor=user.id,
           request_id=request.state.request_id, ip=ip)
    db.commit()
    response.set_cookie(SESSION_COOKIE, token, httponly=True, secure=get_settings().cookie_secure,
                        samesite="lax", path="/", max_age=get_settings().session_ttl_hours * 3600)
    return {"user": user_dict(user), "csrfToken": session.csrf_token, "expiresAt": session.expires_at.isoformat()}


@router.post("/logout", status_code=204)
def logout(response: Response, ctx: Ctx = Depends(current)) -> Response:
    assert ctx.session is not None
    service.revoke(ctx.db, ctx.session)
    record(ctx.db, action="auth.logout", entity_type="user", entity_id=ctx.session.user_id,
           actor=ctx.session.user_id, request_id=ctx.request_id, ip=ctx.ip)
    ctx.db.commit()
    response.status_code = 204
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response


@router.get("/me")
def me(ctx: Ctx = Depends(current)) -> dict:
    assert ctx.user is not None and ctx.session is not None
    rows = ctx.db.execute(select(ProjectMember.project_id, ProjectMember.role_key).where(ProjectMember.user_id == ctx.user.id)).all()
    grants: dict[str, list[str]] = {}
    for role_key, perm in ctx.db.execute(select(RolePermission.role_key, RolePermission.permission_key)).all():
        grants.setdefault(role_key, []).append(perm)
    return {
        "user": user_dict(ctx.user),
        "csrfToken": ctx.session.csrf_token,
        "platformPermissions": ["platform.create_project"] if ctx.user.is_platform_admin else [],
        "memberships": [
            {"projectId": str(pid), "role": role, "permissions": sorted(grants.get(role, []))} for pid, role in rows
        ],
    }
