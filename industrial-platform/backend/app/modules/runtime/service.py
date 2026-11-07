import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError, not_found
from app.modules.design.models import Document, Page, PublishedVersion
from app.modules.iam.models import User
from app.modules.iam.service import authorize
from app.modules.live_values.service import resolve_binding
from app.modules.projects.models import Project


def check_access(db: Session, user: User | None, project: Project) -> None:
    if project.runtime_visibility == "public":
        return
    if user is None:
        raise ApiError(401, "unauthenticated", "Authentication required")
    authorize(db, user, project.id, "runtime.view", "site")


def project_by_slug(db: Session, slug: str) -> Project:
    p = db.scalar(select(Project).where(Project.slug == slug, Project.status == "active"))
    if p is None:
        raise not_found("site")
    return p


def live_version(db: Session, project: Project, path: str) -> PublishedVersion:
    row = db.execute(select(Page, Document).join(Document, Document.id == Page.document_id)
                     .where(Page.project_id == project.id, Page.path == path, Page.archived_at.is_(None))).first()
    if row is None or row[1].live_published_version_id is None or row[1].status == "archived":
        raise not_found("published page")
    pv = db.get(PublishedVersion, row[1].live_published_version_id)
    assert pv is not None
    return pv


def version_in_project(db: Session, project: Project, pv_id: uuid.UUID) -> PublishedVersion:
    pv = db.get(PublishedVersion, pv_id)
    doc = db.get(Document, pv.document_id) if pv else None
    if pv is None or doc is None or doc.project_id != project.id:
        raise not_found("published version")
    return pv


def project_of(db: Session, pv: PublishedVersion) -> Project:
    doc = db.get(Document, pv.document_id)
    project = db.get(Project, doc.project_id) if doc else None
    if project is None:
        raise ApiError(404, "not_found", "published version not found")
    return project


def bundle_response(pv: PublishedVersion) -> dict[str, Any]:
    return {**pv.bundle, "publishedVersionId": str(pv.id)}


def values(db: Session, pv: PublishedVersion, binding_ids: set[str] | None = None) -> list[dict[str, Any]]:
    """Resolved from the bundle's binding snapshots, so later binding edits never affect a published page."""
    now = datetime.now(UTC)
    return [resolve_binding(db, spec, now) for spec in pv.bundle["bindings"] if binding_ids is None or spec["id"] in binding_ids]


def allowed_topics(pv: PublishedVersion) -> set[str]:
    return set(pv.bundle.get("liveChannel", {}).get("topics", []))
