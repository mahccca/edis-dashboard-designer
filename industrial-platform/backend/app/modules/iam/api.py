import uuid

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


class ChangeCredentialsRequest(BaseModel):
    model_config = {"extra": "forbid"}
    current_password: str = Field(min_length=1, max_length=512)
    new_username: str | None = Field(default=None, min_length=3, max_length=120)
    new_password: str | None = Field(default=None, min_length=6, max_length=512)
    new_display_name: str | None = Field(default=None, min_length=1, max_length=120)


class AdminUserCreate(BaseModel):
    model_config = {"extra": "forbid"}
    username: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=6, max_length=512)
    display_name: str = Field(min_length=1, max_length=120)
    is_platform_admin: bool = False


class AdminUserUpdate(BaseModel):
    model_config = {"extra": "forbid"}
    username: str | None = Field(default=None, min_length=3, max_length=120)
    password: str | None = Field(default=None, min_length=6, max_length=512)
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    status: str | None = Field(default=None, pattern="^(active|disabled)$")
    is_platform_admin: bool | None = None


def user_dict(user: User) -> dict:
    return {
        "id": str(user.id),
        "username": user.username,
        "displayName": user.display_name,
        "locale": user.locale,
        "isPlatformAdmin": user.is_platform_admin,
        "status": user.status,
        "createdAt": user.created_at.isoformat() if user.created_at else None,
        "lastLoginAt": user.last_login_at.isoformat() if user.last_login_at else None,
    }


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


@router.put("/credentials")
def change_credentials(body: ChangeCredentialsRequest, ctx: Ctx = Depends(current)) -> dict:
    assert ctx.user is not None
    if not service.verify_password(ctx.user.password_hash, body.current_password):
        raise ApiError(400, "invalid_current_password", "کلمهٔ عبور فعلی نامعتبر است")

    changed: list[str] = []
    if body.new_username:
        norm = body.new_username.strip().lower()
        if norm != ctx.user.username:
            existing = service.by_username(ctx.db, norm)
            if existing and existing.id != ctx.user.id:
                raise ApiError(409, "username_taken", "این نام کاربری قبلاً انتخاب شده است")
            ctx.user.username = norm
            changed.append("username")

    if body.new_display_name:
        disp = body.new_display_name.strip()
        if disp != ctx.user.display_name:
            ctx.user.display_name = disp
            changed.append("display_name")

    if body.new_password:
        service.set_password(ctx.db, ctx.user, body.new_password)
        changed.append("password")

    if not changed:
        raise ApiError(400, "no_changes", "هیچ فیلدی برای تغییر مشخص نشده است")

    record(ctx.db, action="auth.credentials_changed", entity_type="user", entity_id=ctx.user.id,
           actor=ctx.user.id, summary={"changed": changed}, request_id=ctx.request_id, ip=ctx.ip)
    ctx.db.commit()

    return {
        "status": "ok",
        "message": "اطلاعات حساب کاربری با موفقیت به‌روزرسانی شد",
        "user": user_dict(ctx.user),
    }


@router.get("/users")
def list_users(ctx: Ctx = Depends(current)) -> dict:
    assert ctx.user is not None
    if not ctx.user.is_platform_admin:
        raise ApiError(403, "forbidden", "Requires platform admin permissions")
    users = service.list_users(ctx.db)
    return {"items": [user_dict(u) for u in users]}


@router.post("/users", status_code=201)
def create_user_by_admin(body: AdminUserCreate, ctx: Ctx = Depends(current)) -> dict:
    assert ctx.user is not None
    if not ctx.user.is_platform_admin:
        raise ApiError(403, "forbidden", "Requires platform admin permissions")
    norm = body.username.strip().lower()
    if service.by_username(ctx.db, norm):
        raise ApiError(409, "username_taken", "این نام کاربری قبلاً انتخاب شده است")
    created = service.create_user(ctx.db, norm, body.password, body.display_name.strip(), body.is_platform_admin)
    record(ctx.db, action="user.created", entity_type="user", entity_id=created.id, actor=ctx.user.id,
           request_id=ctx.request_id, ip=ctx.ip)
    ctx.db.commit()
    return user_dict(created)


@router.patch("/users/{user_id}")
def update_user_by_admin(user_id: uuid.UUID, body: AdminUserUpdate, ctx: Ctx = Depends(current)) -> dict:
    assert ctx.user is not None
    if not ctx.user.is_platform_admin:
        raise ApiError(403, "forbidden", "Requires platform admin permissions")
    target = ctx.db.get(User, user_id)
    if not target:
        raise ApiError(404, "user_not_found", "کاربر یافت نشد")

    changed: list[str] = []
    if body.username:
        norm = body.username.strip().lower()
        if norm != target.username:
            existing = service.by_username(ctx.db, norm)
            if existing and existing.id != target.id:
                raise ApiError(409, "username_taken", "این نام کاربری قبلاً انتخاب شده است")
            target.username = norm
            changed.append("username")

    if body.display_name:
        target.display_name = body.display_name.strip()
        changed.append("display_name")

    if body.password:
        service.set_password(ctx.db, target, body.password)
        changed.append("password")

    if body.status:
        target.status = body.status
        changed.append("status")

    if body.is_platform_admin is not None:
        target.is_platform_admin = body.is_platform_admin
        changed.append("is_platform_admin")

    record(ctx.db, action="user.updated", entity_type="user", entity_id=target.id, actor=ctx.user.id,
           summary={"changed": changed}, request_id=ctx.request_id, ip=ctx.ip)
    ctx.db.commit()
    return user_dict(target)
