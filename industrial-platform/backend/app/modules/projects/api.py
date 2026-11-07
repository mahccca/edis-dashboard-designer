import uuid

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field

from app.core.auth import Ctx, current
from app.core.http import etag, page_params
from app.modules.audit.service import record
from app.modules.iam.service import authorize
from app.modules.projects import service

router = APIRouter(tags=["projects"])


class ProjectCreate(BaseModel):
    model_config = {"extra": "forbid"}
    slug: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)


@router.get("/projects")
def list_projects(q: str | None = None, limit: int | None = None, ctx: Ctx = Depends(current)) -> dict:
    assert ctx.user
    items = service.list_for(ctx.db, ctx.user, q, page_params(limit))
    return {"items": [service.to_dict(p) for p in items], "nextCursor": None}


@router.post("/projects", status_code=201)
def create_project(body: ProjectCreate, response: Response, ctx: Ctx = Depends(current)) -> dict:
    assert ctx.user
    project = service.create(ctx.db, ctx.user, body.slug, body.name, body.description)
    record(ctx.db, action="project.created", entity_type="project", entity_id=project.id, actor=ctx.user.id,
           project_id=project.id, request_id=ctx.request_id, ip=ctx.ip)
    ctx.db.commit()
    response.headers["Location"] = f"/api/v1/projects/{project.id}"
    response.headers["ETag"] = etag("v", project.lock_version)
    return service.to_dict(project)


@router.get("/projects/{project_id}")
def get_project(project_id: uuid.UUID, response: Response, ctx: Ctx = Depends(current)) -> dict:
    authorize(ctx.db, ctx.user, project_id, "project.view", "project")
    project = service.get(ctx.db, project_id)
    response.headers["ETag"] = etag("v", project.lock_version)
    return service.to_dict(project)
