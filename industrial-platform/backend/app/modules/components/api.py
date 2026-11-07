import uuid
from typing import Any

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select

from app.core.auth import Ctx, current
from app.core.errors import not_found
from app.core.http import etag, require_if_match
from app.modules.components import service
from app.modules.components.models import ComponentVersion
from app.modules.iam.service import authorize

router = APIRouter(tags=["components"])


@router.get("/renderers")
def list_renderers(ctx: Ctx = Depends(current)) -> dict:
    return {"items": service.RENDERERS}


@router.get("/projects/{project_id}/components")
def list_components(project_id: uuid.UUID, includeGlobal: bool = True, ctx: Ctx = Depends(current)) -> dict:
    authorize(ctx.db, ctx.user, project_id, "component.use", "project")
    items = [service.summary(ctx.db, d) for d in service.visible_definitions(ctx.db, project_id, includeGlobal)]
    return {"items": items, "nextCursor": None}


@router.post("/projects/{project_id}/components", status_code=201)
def create_component(project_id: uuid.UUID, body: dict[str, Any], response: Response, ctx: Ctx = Depends(current)) -> dict:
    authorize(ctx.db, ctx.user, project_id, "component.edit", "project")
    d, v = service.create_definition(ctx.db, project_id, body)
    ctx.db.commit()
    response.headers["Location"] = f"/api/v1/components/{d.id}/versions/{v.version}"
    response.headers["ETag"] = etag("v", v.lock_version)
    return service.summary(ctx.db, d)


def _check_access(ctx: Ctx, definition_id: uuid.UUID, permission: str = "component.use") -> None:
    d = service.get_definition(ctx.db, definition_id)
    if d.project_id is not None:
        authorize(ctx.db, ctx.user, d.project_id, permission, "component")


@router.get("/components/{component_id}/versions")
def list_versions(component_id: uuid.UUID, ctx: Ctx = Depends(current)) -> dict:
    _check_access(ctx, component_id)
    rows = ctx.db.scalars(select(ComponentVersion).where(ComponentVersion.definition_id == component_id)
                          .order_by(ComponentVersion.major.desc(), ComponentVersion.minor.desc(), ComponentVersion.patch.desc()))
    return {"items": [service.version_summary(v) for v in rows]}


@router.post("/components/{component_id}/versions", status_code=201)
def create_version(component_id: uuid.UUID, body: dict[str, Any], response: Response, ctx: Ctx = Depends(current)) -> dict:
    _check_access(ctx, component_id, "component.edit")
    from_version = body.get("fromVersion")
    bump = body.get("bump")
    if not isinstance(from_version, str) or not isinstance(bump, str):
        from app.core.errors import unprocessable
        raise unprocessable([
            {"pointer": "/fromVersion", "code": "required", "message": "semver string"},
            {"pointer": "/bump", "code": "required", "message": "major|minor|patch"},
        ])
    v = service.bump_version(ctx.db, component_id, from_version, bump)
    ctx.db.commit()
    response.headers["Location"] = f"/api/v1/components/{component_id}/versions/{v.version}"
    response.headers["ETag"] = etag("v", v.lock_version)
    return v.spec


@router.get("/components/{component_id}/versions/{version}")
def get_version(component_id: uuid.UUID, version: str, response: Response, ctx: Ctx = Depends(current)) -> dict:
    _check_access(ctx, component_id)
    v = ctx.db.scalar(select(ComponentVersion).where(ComponentVersion.definition_id == component_id,
                                                     ComponentVersion.version == version))
    if v is None:
        raise not_found("component version")
    response.headers["ETag"] = etag("v", v.lock_version)
    return v.spec


@router.put("/components/{component_id}/versions/{version}")
def save_version(
    component_id: uuid.UUID,
    version: str,
    body: dict[str, Any],
    request: Request,
    response: Response,
    ctx: Ctx = Depends(current),
) -> dict:
    _check_access(ctx, component_id, "component.edit")
    v = service.get_version(ctx.db, component_id, version)
    require_if_match(request, "v", v.lock_version)
    saved = service.save_draft(ctx.db, component_id, version, body, expected_lock=v.lock_version)
    ctx.db.commit()
    response.headers["ETag"] = etag("v", saved.lock_version)
    return saved.spec


@router.post("/components/{component_id}/versions/{version}/publish")
def publish_version(component_id: uuid.UUID, version: str, ctx: Ctx = Depends(current)) -> dict:
    _check_access(ctx, component_id, "component.publish")
    v = service.publish_version(ctx.db, component_id, version)
    ctx.db.commit()
    return service.version_summary(v)


@router.post("/components/{component_id}/versions/{version}/deprecate")
def deprecate_version(component_id: uuid.UUID, version: str, ctx: Ctx = Depends(current)) -> dict:
    _check_access(ctx, component_id, "component.publish")
    v = service.deprecate_version(ctx.db, component_id, version)
    ctx.db.commit()
    return service.version_summary(v)


@router.get("/components/{component_id}/usages")
def list_usages(component_id: uuid.UUID, ctx: Ctx = Depends(current)) -> dict:
    _check_access(ctx, component_id)
    return {"items": service.list_usages(ctx.db, component_id)}
