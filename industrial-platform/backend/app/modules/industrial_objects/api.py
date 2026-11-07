import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Body, Depends, Response

from app.core.auth import Ctx, current
from app.core.http import etag, page_params
from app.modules.audit.service import record
from app.modules.iam.service import authorize
from app.modules.industrial_objects import service
from app.modules.industrial_objects.models import ObjectTypeVersion
from app.modules.live_values.service import resolve_variable

router = APIRouter(tags=["objects"])


@router.get("/projects/{project_id}/object-types")
def list_object_types(project_id: uuid.UUID, ctx: Ctx = Depends(current)) -> dict:
    authorize(ctx.db, ctx.user, project_id, "object.view", "project")
    return {"items": [service.type_to_dict(t, v) for t, v in service.list_types(ctx.db, project_id)], "nextCursor": None}


@router.post("/projects/{project_id}/object-types", status_code=201)
def create_object_type(project_id: uuid.UUID, response: Response, body: dict[str, Any] = Body(...),
                       ctx: Ctx = Depends(current)) -> dict:
    authorize(ctx.db, ctx.user, project_id, "object_type.edit", "project")
    t, v = service.create_type(ctx.db, project_id, body)
    record(ctx.db, action="object_type.created", entity_type="object_type", entity_id=t.id, actor=ctx.user.id,
           project_id=project_id, summary={"key": t.key, "version": v.version}, request_id=ctx.request_id, ip=ctx.ip)
    ctx.db.commit()
    response.headers["Location"] = f"/api/v1/object-types/{t.id}/versions/{v.version}"
    return service.type_to_dict(t, v)


@router.get("/object-types/{type_id}/versions/{version}")
def get_object_type_version(type_id: uuid.UUID, version: str, response: Response, ctx: Ctx = Depends(current)) -> dict:
    t, v = service.get_type_version(ctx.db, type_id, version)
    authorize(ctx.db, ctx.user, t.project_id, "object.view", "object type")
    response.headers["ETag"] = etag("v", v.lock_version)
    return service.type_to_dict(t, v)


@router.post("/object-types/{type_id}/versions/{version}/publish")
def publish_object_type_version(type_id: uuid.UUID, version: str, ctx: Ctx = Depends(current)) -> dict:
    t, v = service.get_type_version(ctx.db, type_id, version)
    authorize(ctx.db, ctx.user, t.project_id, "object_type.edit", "object type")
    service.publish_type_version(ctx.db, v)
    record(ctx.db, action="object_type.published", entity_type="object_type", entity_id=t.id, actor=ctx.user.id,
           project_id=t.project_id, summary={"version": version}, request_id=ctx.request_id, ip=ctx.ip)
    ctx.db.commit()
    return service.type_to_dict(t, v)


@router.get("/projects/{project_id}/objects")
def list_objects(project_id: uuid.UUID, q: str | None = None, limit: int | None = None, ctx: Ctx = Depends(current)) -> dict:
    authorize(ctx.db, ctx.user, project_id, "object.view", "project")
    items = service.list_objects(ctx.db, project_id, q, page_params(limit))
    return {"items": [service.object_to_dict(ctx.db, o) for o in items], "nextCursor": None}


@router.post("/projects/{project_id}/objects", status_code=201)
def create_object(project_id: uuid.UUID, response: Response, body: dict[str, Any] = Body(...),
                  ctx: Ctx = Depends(current)) -> dict:
    authorize(ctx.db, ctx.user, project_id, "object.edit", "project")
    o = service.create_object(ctx.db, project_id, body)
    record(ctx.db, action="object.created", entity_type="object", entity_id=o.id, actor=ctx.user.id,
           project_id=project_id, summary={"key": o.key}, request_id=ctx.request_id, ip=ctx.ip)
    ctx.db.commit()
    response.headers["Location"] = f"/api/v1/objects/{o.id}"
    response.headers["ETag"] = etag("v", o.lock_version)
    return service.object_to_dict(ctx.db, o)


@router.get("/objects/{object_id}")
def get_object(object_id: uuid.UUID, response: Response, ctx: Ctx = Depends(current)) -> dict:
    o = service.get_object(ctx.db, object_id)
    authorize(ctx.db, ctx.user, o.project_id, "object.view", "object")
    response.headers["ETag"] = etag("v", o.lock_version)
    return service.object_to_dict(ctx.db, o)


@router.get("/objects/{object_id}/values")
def get_object_values(object_id: uuid.UUID, ctx: Ctx = Depends(current)) -> dict:
    o = service.get_object(ctx.db, object_id)
    authorize(ctx.db, ctx.user, o.project_id, "object.view", "object")
    tv = ctx.db.get(ObjectTypeVersion, o.type_version_id)
    now = datetime.now(UTC)
    items = [{"variable": v["key"], **resolve_variable(ctx.db, o, v["key"], now), "receivedAt": now.isoformat()}
             for v in tv.spec["variables"]] if tv else []
    return {"items": items}
