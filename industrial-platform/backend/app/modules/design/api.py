import uuid
from typing import Any

from fastapi import APIRouter, Body, Depends, Request, Response

from app.core.auth import Ctx, current
from app.core.http import etag, require_if_match
from app.modules.audit.service import record
from app.modules.design import service
from app.modules.iam.service import authorize

router = APIRouter(tags=["pages"])


def _audit(ctx: Ctx, action: str, page_id: uuid.UUID, project_id: uuid.UUID, **summary: Any) -> None:
    record(ctx.db, action=action, entity_type="page", entity_id=page_id, actor=ctx.user.id, project_id=project_id,
           summary=summary, request_id=ctx.request_id, ip=ctx.ip)


@router.get("/projects/{project_id}/pages")
def list_pages(project_id: uuid.UUID, ctx: Ctx = Depends(current)) -> dict:
    authorize(ctx.db, ctx.user, project_id, "page.view", "project")
    return {"items": [service.page_summary(ctx.db, p, d) for p, d in service.list_pages(ctx.db, project_id)], "nextCursor": None}


@router.post("/projects/{project_id}/pages", status_code=201)
def create_page(project_id: uuid.UUID, response: Response, body: dict[str, Any] = Body(...), ctx: Ctx = Depends(current)) -> dict:
    authorize(ctx.db, ctx.user, project_id, "page.edit", "project")
    page, doc = service.create_page(ctx.db, project_id, body, ctx.user)
    _audit(ctx, "page.created", doc.id, project_id, path=page.path)
    ctx.db.commit()
    response.headers["Location"] = f"/api/v1/pages/{doc.id}"
    response.headers["ETag"] = etag("rev", doc.head_revision_no)
    return service.page_to_dict(ctx.db, page, doc)


@router.get("/pages/{page_id}")
def get_page(page_id: uuid.UUID, response: Response, ctx: Ctx = Depends(current)) -> dict:
    page, doc = service.load_page(ctx.db, page_id)
    authorize(ctx.db, ctx.user, page.project_id, "page.view", "page")
    response.headers["ETag"] = etag("rev", doc.head_revision_no)
    return service.page_to_dict(ctx.db, page, doc)


@router.get("/pages/{page_id}/document")
def get_document(page_id: uuid.UUID, response: Response, ctx: Ctx = Depends(current)) -> dict:
    page, doc = service.load_page(ctx.db, page_id)
    authorize(ctx.db, ctx.user, page.project_id, "page.view", "page")
    rev = service.head(ctx.db, doc)
    response.headers["ETag"] = etag("rev", doc.head_revision_no)
    return {**service.revision_summary(rev), "content": rev.content, "migratedFrom": None}


@router.put("/pages/{page_id}/document")
def save_document(page_id: uuid.UUID, request: Request, response: Response, body: dict[str, Any] = Body(...),
                  ctx: Ctx = Depends(current)) -> dict:
    page, _ = service.load_page(ctx.db, page_id)
    authorize(ctx.db, ctx.user, page.project_id, "page.edit", "page")
    page, doc = service.load_page(ctx.db, page_id, lock=True)
    require_if_match(request, "rev", doc.head_revision_no)
    rev = service.save_document(ctx.db, page, doc, body, ctx.user)
    _audit(ctx, "page.document.saved", doc.id, page.project_id, revisionNo=rev.revision_no)
    ctx.db.commit()
    response.headers["ETag"] = etag("rev", rev.revision_no)
    return service.revision_summary(rev)


@router.get("/pages/{page_id}/revisions")
def list_revisions(page_id: uuid.UUID, ctx: Ctx = Depends(current)) -> dict:
    page, doc = service.load_page(ctx.db, page_id)
    authorize(ctx.db, ctx.user, page.project_id, "page.view", "page")
    from sqlalchemy import select

    from app.modules.design.models import DocumentRevision
    revs = ctx.db.scalars(select(DocumentRevision).where(DocumentRevision.document_id == doc.id)
                          .order_by(DocumentRevision.revision_no.desc()).limit(200))
    return {"items": [service.revision_summary(r) for r in revs], "nextCursor": None}


@router.get("/pages/{page_id}/revisions/{revision_no}")
def get_revision(page_id: uuid.UUID, revision_no: int, ctx: Ctx = Depends(current)) -> dict:
    page, doc = service.load_page(ctx.db, page_id)
    authorize(ctx.db, ctx.user, page.project_id, "page.view", "page")
    rev = service.revision(ctx.db, doc, revision_no)
    return {**service.revision_summary(rev), "content": rev.content, "migratedFrom": None}


@router.post("/pages/{page_id}/revisions/{revision_no}/restore", status_code=201)
def restore_revision(page_id: uuid.UUID, revision_no: int, request: Request, response: Response,
                     ctx: Ctx = Depends(current)) -> dict:
    page, _ = service.load_page(ctx.db, page_id)
    authorize(ctx.db, ctx.user, page.project_id, "page.edit", "page")
    page, doc = service.load_page(ctx.db, page_id, lock=True)
    require_if_match(request, "rev", doc.head_revision_no)
    rev = service.restore(ctx.db, page, doc, revision_no, ctx.user)
    _audit(ctx, "page.revision.restored", doc.id, page.project_id, fromRevision=revision_no, revisionNo=rev.revision_no)
    ctx.db.commit()
    response.headers["ETag"] = etag("rev", rev.revision_no)
    return service.revision_summary(rev)


@router.post("/pages/{page_id}/publish", status_code=201)
def publish_page(page_id: uuid.UUID, response: Response, body: dict[str, Any] = Body(...), ctx: Ctx = Depends(current)) -> dict:
    page, _ = service.load_page(ctx.db, page_id)
    authorize(ctx.db, ctx.user, page.project_id, "page.publish", "page")
    page, doc = service.load_page(ctx.db, page_id, lock=True)
    pv = service.publish(ctx.db, page, doc, body, ctx.user)
    _audit(ctx, "page.published", doc.id, page.project_id, versionNo=pv.version_no, revisionNo=body["revisionNo"],
           containsTestData=pv.bundle["containsTestData"])
    ctx.db.commit()
    response.headers["Location"] = f"/api/v1/pages/{doc.id}/published-versions"
    return service.published_to_dict(ctx.db, pv, doc)


@router.get("/pages/{page_id}/published-versions")
def list_published(page_id: uuid.UUID, ctx: Ctx = Depends(current)) -> dict:
    page, doc = service.load_page(ctx.db, page_id)
    authorize(ctx.db, ctx.user, page.project_id, "page.view", "page")
    return {"items": [service.published_to_dict(ctx.db, pv, doc) for pv in service.list_published(ctx.db, doc)], "nextCursor": None}


@router.post("/pages/{page_id}/published-versions/{version_no}/activate")
def activate(page_id: uuid.UUID, version_no: int, ctx: Ctx = Depends(current)) -> dict:
    page, _ = service.load_page(ctx.db, page_id)
    authorize(ctx.db, ctx.user, page.project_id, "page.publish", "page")
    page, doc = service.load_page(ctx.db, page_id, lock=True)
    pv = service.activate(ctx.db, doc, version_no)
    _audit(ctx, "page.rollback", doc.id, page.project_id, versionNo=version_no)
    ctx.db.commit()
    return service.published_to_dict(ctx.db, pv, doc)
