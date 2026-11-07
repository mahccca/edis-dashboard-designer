"""Pages, revisions, publishing and rollback (ADR-0004 / ADR-0005)."""

import json
import uuid
from functools import lru_cache
from pathlib import Path
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.contracts import schema_errors
from app.core.db import utcnow
from app.core.errors import ApiError, conflict, not_found, unprocessable
from app.modules.data_bindings.models import DataBinding
from app.modules.data_bindings.service import to_dict as binding_to_dict
from app.modules.design import document_engine
from app.modules.design.models import (ComponentUsage, Document, DocumentRevision, Page, PublishedVersion,
                                       PublishedVersionPin)
from app.modules.iam.models import User
from app.modules.live_values.service import binding_data_origin

BUILTIN = Path(__file__).parent / "builtin"
LIVE_CHANNEL = "/api/v1/runtime/ws"


@lru_cache
def default_theme() -> dict[str, Any]:
    return json.loads((BUILTIN / "default-theme.json").read_text(encoding="utf-8"))


def empty_document(document_type: str) -> dict[str, Any]:
    return {"schemaVersion": 1, "documentType": document_type,
            "settings": {"layout": "fluid", "direction": "rtl"},
            "root": {"id": "root", "type": "root", "children": []}}


# ----------------------------------------------------------------- loading / serialisation

def load_page(db: Session, page_id: uuid.UUID, *, lock: bool = False) -> tuple[Page, Document]:
    stmt = select(Document).where(Document.id == page_id)
    if lock:
        stmt = stmt.with_for_update()
    doc = db.scalar(stmt)
    page = db.get(Page, page_id) if doc else None
    if doc is None or page is None or page.archived_at is not None:
        raise not_found("page")
    return page, doc


def head(db: Session, doc: Document) -> DocumentRevision:
    return revision(db, doc, doc.head_revision_no)


def revision(db: Session, doc: Document, no: int) -> DocumentRevision:
    rev = db.scalar(select(DocumentRevision).where(DocumentRevision.document_id == doc.id, DocumentRevision.revision_no == no))
    if rev is None:
        raise not_found("revision")
    return rev


def _live_version_no(db: Session, doc: Document) -> int | None:
    if doc.live_published_version_id is None:
        return None
    pv = db.get(PublishedVersion, doc.live_published_version_id)
    return pv.version_no if pv else None


def _live_source_revision_no(db: Session, doc: Document) -> int | None:
    if doc.live_published_version_id is None:
        return None
    pv = db.get(PublishedVersion, doc.live_published_version_id)
    rev = db.get(DocumentRevision, pv.source_revision_id) if pv else None
    return rev.revision_no if rev else None


def page_summary(db: Session, page: Page, doc: Document) -> dict[str, Any]:
    return {
        "id": str(doc.id), "kind": page.kind, "title": page.title, "slug": page.slug, "path": page.path,
        "status": doc.status, "headRevision": doc.head_revision_no, "livePublishedVersionNo": _live_version_no(db, doc),
        "hasUnpublishedChanges": _live_source_revision_no(db, doc) != doc.head_revision_no,
        "updatedAt": doc.updated_at.isoformat(),
    }


def page_to_dict(db: Session, page: Page, doc: Document) -> dict[str, Any]:
    return {
        "id": str(doc.id), "projectId": str(page.project_id), "kind": page.kind, "title": page.title, "slug": page.slug,
        "path": page.path, "templateId": None, "headerPolicy": page.header_policy, "seo": page.seo, "status": doc.status,
        "headRevision": doc.head_revision_no,
        "livePublishedVersionId": str(doc.live_published_version_id) if doc.live_published_version_id else None,
        "document": head(db, doc).content,
    }


def revision_summary(rev: DocumentRevision) -> dict[str, Any]:
    return {"revisionNo": rev.revision_no, "schemaVersion": rev.schema_version, "contentHash": rev.content_hash.hex(),
            "message": rev.message, "autosave": rev.autosave, "restoredFrom": rev.restored_from_no,
            "createdAt": rev.created_at.isoformat() if rev.created_at else None}


def list_revisions(db: Session, doc: Document, limit: int = 200) -> list[DocumentRevision]:
    return list(db.scalars(select(DocumentRevision).where(DocumentRevision.document_id == doc.id)
                           .order_by(DocumentRevision.revision_no.desc()).limit(limit)))


def list_pages(db: Session, project_id: uuid.UUID) -> list[tuple[Page, Document]]:
    rows = db.execute(select(Page, Document).join(Document, Document.id == Page.document_id)
                      .where(Page.project_id == project_id, Page.archived_at.is_(None)).order_by(Page.path))
    return [(p, d) for p, d in rows]


# ----------------------------------------------------------------- writes

def _append_revision(db: Session, doc: Document, content: dict[str, Any], result: document_engine.Result, user: User,
                     message: str | None = None, autosave: bool = False, restored_from: int | None = None) -> DocumentRevision:
    no = doc.head_revision_no + 1 if doc.head_revision_no else 1
    rev = DocumentRevision(document_id=doc.id, revision_no=no, schema_version=content["schemaVersion"], content=content,
                           content_hash=document_engine.content_hash(content), message=message, autosave=autosave,
                           restored_from_no=restored_from, created_by=user.id)
    db.add(rev)
    doc.head_revision_no = no
    doc.updated_by = user.id
    doc.updated_at = utcnow()
    db.flush()
    db.execute(delete(ComponentUsage).where(ComponentUsage.document_id == doc.id))
    by_key = {(str(v.definition_id), v.version): v.id for v in result.component_versions.values()}
    for node, _, _ in document_engine._walk(content["root"], "", None):
        if node["type"] == "component":
            cv = by_key.get((node["component"]["definitionId"], node["component"]["version"]))
            if cv:
                db.add(ComponentUsage(document_id=doc.id, node_id=node["id"], component_version_id=cv, revision_no=no))
    db.flush()
    return rev


def create_page(db: Session, project_id: uuid.UUID, body: dict[str, Any], user: User) -> tuple[Page, Document]:
    allowed = {"kind", "title", "slug", "path", "templateId", "document"}
    if set(body) - allowed:
        raise unprocessable([{"pointer": f"/{k}", "code": "additional_properties", "message": "not allowed"} for k in sorted(set(body) - allowed)])
    kind = body.get("kind", "page")
    if kind not in ("page", "dashboard"):
        raise unprocessable([{"pointer": "/kind", "code": "enum", "message": "page or dashboard"}])
    content = body.get("document") or empty_document(kind)
    candidate = {"kind": kind, "title": body.get("title"), "slug": body.get("slug"), "path": body.get("path"), "document": content}
    errors = [e for e in schema_errors("page.schema.json", candidate) if not e["pointer"].startswith("/document")]
    if errors:
        raise unprocessable(errors)
    result = document_engine.validate(db, project_id, kind, content, base="/document")
    doc = Document(project_id=project_id, document_type=kind, name=body["slug"], status="draft", head_revision_no=0,
                   created_by=user.id, updated_by=user.id)
    db.add(doc)
    db.flush()
    page = Page(document_id=doc.id, project_id=project_id, kind=kind, title=body["title"], slug=body["slug"], path=body["path"])
    db.add(page)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise conflict("path_taken", "Another page already uses this slug or path") from exc
    _append_revision(db, doc, content, result, user, message="created")
    return page, doc


def archive_page(db: Session, page: Page, doc: Document, user: User) -> None:
    """Revisions and published versions are immutable history, so deletion archives: the page leaves lists and the
    runtime, and its slug/path become reusable."""
    now = utcnow()
    page.archived_at = now
    doc.status = "archived"
    doc.live_published_version_id = None
    doc.updated_by = user.id
    doc.updated_at = now
    db.flush()


def save_document(db: Session, page: Page, doc: Document, body: dict[str, Any], user: User) -> DocumentRevision:
    if set(body) - {"content", "message", "autosave"} or "content" not in body:
        raise unprocessable([{"pointer": "", "code": "shape", "message": "body is {content, message?, autosave?}"}])
    message = body.get("message")
    if message is not None and (not isinstance(message, str) or len(message) > 500):
        raise unprocessable([{"pointer": "/message", "code": "maxLength", "message": "string up to 500 chars"}])
    result = document_engine.validate(db, page.project_id, page.kind, body["content"])
    return _append_revision(db, doc, body["content"], result, user, message, bool(body.get("autosave", False)))


def restore(db: Session, page: Page, doc: Document, revision_no: int, user: User) -> DocumentRevision:
    old = revision(db, doc, revision_no)
    result = document_engine.validate(db, page.project_id, page.kind, old.content)
    return _append_revision(db, doc, old.content, result, user, message=f"restored from revision {revision_no}",
                            restored_from=revision_no)


# ----------------------------------------------------------------- publishing

def published_to_dict(db: Session, pv: PublishedVersion, doc: Document) -> dict[str, Any]:
    src = db.get(DocumentRevision, pv.source_revision_id)
    return {
        "id": str(pv.id), "documentId": str(pv.document_id), "versionNo": pv.version_no,
        "sourceRevisionNo": src.revision_no if src else None, "bundleHash": pv.bundle_hash.hex(),
        "pins": {"components": pv.bundle.get("pins", {}).get("components", [])},
        "note": pv.note, "publishedAt": pv.published_at.isoformat() if pv.published_at else None,
        "isLive": doc.live_published_version_id == pv.id, "containsTestData": pv.bundle.get("containsTestData", False),
    }


def publish(db: Session, page: Page, doc: Document, body: dict[str, Any], user: User) -> PublishedVersion:
    if set(body) - {"revisionNo", "note"} or not isinstance(body.get("revisionNo"), int) or isinstance(body.get("revisionNo"), bool):
        raise unprocessable([{"pointer": "/revisionNo", "code": "required", "message": "integer revisionNo required"}])
    if body["revisionNo"] > doc.head_revision_no:
        raise conflict("revision_ahead_of_head", "Cannot publish a revision that does not exist yet")
    rev = revision(db, doc, body["revisionNo"])
    result = document_engine.validate(db, page.project_id, page.kind, rev.content, for_publish=True)
    bindings = list(db.scalars(select(DataBinding).where(DataBinding.id.in_(result.binding_ids)))) if result.binding_ids else []
    snapshots = sorted((binding_to_dict(b) for b in bindings), key=lambda b: b["id"])
    origins = {s["id"]: binding_data_origin(db, s) for s in snapshots}
    components = sorted(result.component_versions.values(), key=lambda v: (v.spec["key"], v.version))
    version_no = (db.scalar(select(func.max(PublishedVersion.version_no)).where(PublishedVersion.document_id == doc.id)) or 0) + 1
    bundle = {
        "mode": "runtime",
        "page": {"id": str(doc.id), "title": page.title, "path": page.path, "kind": page.kind},
        "document": rev.content,
        "header": None, "footer": None,
        "components": [v.spec for v in components],
        "theme": default_theme(),
        "menus": [],
        "bindings": snapshots,
        "bindingOrigins": origins,
        "containsTestData": any(o["isTestData"] for o in origins.values()),
        "pins": {"components": [{"definitionId": str(v.definition_id), "version": v.version} for v in components]},
        "liveChannel": {"url": LIVE_CHANNEL, "topics": [f"binding:{s['id']}" for s in snapshots]},
    }
    pv = PublishedVersion(document_id=doc.id, version_no=version_no, source_revision_id=rev.id, bundle=bundle,
                          bundle_hash=document_engine.content_hash(bundle), note=body.get("note"), published_by=user.id)
    db.add(pv)
    db.flush()
    for v in components:
        db.add(PublishedVersionPin(published_version_id=pv.id, component_version_id=v.id))
    doc.live_published_version_id = pv.id
    doc.status = "published"
    db.flush()
    return pv


def list_published(db: Session, doc: Document) -> list[PublishedVersion]:
    return list(db.scalars(select(PublishedVersion).where(PublishedVersion.document_id == doc.id)
                           .order_by(PublishedVersion.version_no.desc())))


def activate(db: Session, doc: Document, version_no: int) -> PublishedVersion:
    pv = db.scalar(select(PublishedVersion).where(PublishedVersion.document_id == doc.id, PublishedVersion.version_no == version_no))
    if pv is None:
        raise not_found("published version")
    if doc.status == "archived":
        raise ApiError(409, "archived", "Archived pages cannot be activated")
    doc.live_published_version_id = pv.id
    doc.status = "published"
    db.flush()
    return pv
