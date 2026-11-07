import uuid
from typing import Any

from fastapi import APIRouter, Body, Depends, Request, Response

from app.core.auth import Ctx, current
from app.core.http import etag, require_if_match
from app.modules.audit.service import record
from app.modules.data_bindings import service
from app.modules.iam.service import authorize
from app.modules.live_values.service import resolve_binding

router = APIRouter(tags=["data-bindings"])


@router.get("/projects/{project_id}/data-bindings")
def list_bindings(project_id: uuid.UUID, ctx: Ctx = Depends(current)) -> dict:
    authorize(ctx.db, ctx.user, project_id, "page.view", "project")
    return {"items": [service.to_dict(b) for b in service.list_for(ctx.db, project_id)], "nextCursor": None}


@router.post("/projects/{project_id}/data-bindings", status_code=201)
def create_binding(project_id: uuid.UUID, response: Response, body: dict[str, Any] = Body(...),
                   ctx: Ctx = Depends(current)) -> dict:
    authorize(ctx.db, ctx.user, project_id, "page.edit", "project")
    b = service.create(ctx.db, project_id, body)
    record(ctx.db, action="data_binding.created", entity_type="data_binding", entity_id=b.id, actor=ctx.user.id,
           project_id=project_id, summary={"source": b.source_kind}, request_id=ctx.request_id, ip=ctx.ip)
    ctx.db.commit()
    response.headers["Location"] = f"/api/v1/data-bindings/{b.id}"
    response.headers["ETag"] = etag("v", b.lock_version)
    return service.to_dict(b)


@router.get("/data-bindings/{binding_id}")
def get_binding(binding_id: uuid.UUID, response: Response, ctx: Ctx = Depends(current)) -> dict:
    b = service.get(ctx.db, binding_id)
    authorize(ctx.db, ctx.user, b.project_id, "page.view", "data binding")
    response.headers["ETag"] = etag("v", b.lock_version)
    return service.to_dict(b)


@router.patch("/data-bindings/{binding_id}")
def patch_binding(binding_id: uuid.UUID, request: Request, response: Response,
                  body: dict[str, Any] = Body(...), ctx: Ctx = Depends(current)) -> dict:
    b = service.get(ctx.db, binding_id)
    authorize(ctx.db, ctx.user, b.project_id, "page.edit", "data binding")
    require_if_match(request, "v", b.lock_version)
    service.update(ctx.db, b, body)
    record(ctx.db, action="data_binding.updated", entity_type="data_binding", entity_id=b.id, actor=ctx.user.id,
           project_id=b.project_id, summary={"fields": sorted(body)}, request_id=ctx.request_id, ip=ctx.ip)
    ctx.db.commit()
    response.headers["ETag"] = etag("v", b.lock_version)
    return service.to_dict(b)


@router.delete("/data-bindings/{binding_id}", status_code=204)
def delete_binding(binding_id: uuid.UUID, request: Request, response: Response,
                   ctx: Ctx = Depends(current)) -> Response:
    b = service.get(ctx.db, binding_id)
    authorize(ctx.db, ctx.user, b.project_id, "page.edit", "data binding")
    require_if_match(request, "v", b.lock_version)
    project_id = b.project_id
    service.delete(ctx.db, b)
    record(ctx.db, action="data_binding.deleted", entity_type="data_binding", entity_id=binding_id,
           actor=ctx.user.id, project_id=project_id, summary={}, request_id=ctx.request_id, ip=ctx.ip)
    ctx.db.commit()
    response.status_code = 204
    return response


@router.get("/data-bindings/{binding_id}/value")
def get_binding_value(binding_id: uuid.UUID, ctx: Ctx = Depends(current)) -> dict:
    b = service.get(ctx.db, binding_id)
    authorize(ctx.db, ctx.user, b.project_id, "object.view", "data binding")
    return resolve_binding(ctx.db, service.to_dict(b))
