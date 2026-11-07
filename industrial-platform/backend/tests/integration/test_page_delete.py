"""Deleting a page archives it: gone from studio and runtime, history kept, slug/path reusable."""

import pytest
from sqlalchemy import select

from app.core.db import new_session
from app.modules.audit.models import AuditLog
from app.modules.design.models import DocumentRevision, PublishedVersion

pytestmark = pytest.mark.integration


def _publish(api, page_id: str) -> None:  # type: ignore[no-untyped-def]
    head = api.get(f"/pages/{page_id}").json()["headRevision"]
    assert api.post(f"/pages/{page_id}/publish", json={"revisionNo": head}).status_code == 201


def test_delete_live_page(world) -> None:  # type: ignore[no-untyped-def]
    designer, viewer = world.api("designer"), world.api("viewer")
    _publish(designer, world.page_id)
    page = designer.get(f"/pages/{world.page_id}")
    etag, path, slug = page.headers["ETag"], page.json()["path"], page.json()["slug"]
    assert viewer.get(f"/runtime/sites/{world.slug}/resolve", params={"path": path}).status_code == 200

    assert viewer.delete(f"/pages/{world.page_id}", headers={"If-Match": etag}).status_code == 403
    assert designer.delete(f"/pages/{world.page_id}").status_code == 428
    r = designer.delete(f"/pages/{world.page_id}", headers={"If-Match": '"rev-99"'})
    assert r.status_code == 412 and r.json()["currentEtag"] == etag

    assert designer.delete(f"/pages/{world.page_id}", headers={"If-Match": etag}).status_code == 204
    assert designer.get(f"/pages/{world.page_id}").status_code == 404
    assert designer.delete(f"/pages/{world.page_id}", headers={"If-Match": etag}).status_code == 404
    assert world.page_id not in [p["id"] for p in designer.get(f"/projects/{world.project_id}/pages").json()["items"]]
    assert viewer.get(f"/runtime/sites/{world.slug}/resolve", params={"path": path}).status_code == 404

    with new_session() as db:
        assert db.scalars(select(DocumentRevision).where(DocumentRevision.document_id == world.page_id)).first()
        assert db.scalars(select(PublishedVersion).where(PublishedVersion.document_id == world.page_id)).first()
        entry = db.scalar(select(AuditLog).where(AuditLog.entity_id == world.page_id, AuditLog.action == "page.archived"))
        assert entry is not None and entry.summary["wasLive"] is True

    r = designer.post(f"/projects/{world.project_id}/pages", json={"kind": "page", "title": {"en": "Again"}, "slug": slug, "path": path})
    assert r.status_code == 201, r.text
    assert r.json()["id"] != world.page_id


def test_outsider_cannot_delete(world) -> None:  # type: ignore[no-untyped-def]
    etag = world.api("designer").get(f"/pages/{world.page_id}").headers["ETag"]
    assert world.api("outsider").delete(f"/pages/{world.page_id}", headers={"If-Match": etag}).status_code == 404
