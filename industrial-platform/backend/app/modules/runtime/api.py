import asyncio
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Request, Response, WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool

from app.core.auth import SESSION_COOKIE, Ctx, optional, origin_allowed
from app.core.config import get_settings
from app.core.db import new_session
from app.core.errors import ApiError
from app.modules.design.models import PublishedVersion
from app.modules.iam.service import resolve_session
from app.modules.runtime import service

router = APIRouter(tags=["runtime"])


@router.get("/runtime/sites/{project_slug}/resolve")
def resolve(project_slug: str, path: str, request: Request, response: Response, ctx: Ctx = Depends(optional)) -> Any:
    project = service.project_by_slug(ctx.db, project_slug)
    service.check_access(ctx.db, ctx.user, project)
    pv = service.live_version(ctx.db, project, path)
    tag = f'"pv-{pv.id}"'
    response.headers["Cache-Control"] = "private, no-cache"
    if request.headers.get("if-none-match") == tag:
        return Response(status_code=304, headers={"ETag": tag})
    response.headers["ETag"] = tag
    return service.bundle_response(pv)


@router.get("/runtime/sites/{project_slug}/values")
def get_values(project_slug: str, publishedVersionId: uuid.UUID, bindingIds: str | None = None,
               ctx: Ctx = Depends(optional)) -> dict:
    project = service.project_by_slug(ctx.db, project_slug)
    service.check_access(ctx.db, ctx.user, project)
    pv = service.version_in_project(ctx.db, project, publishedVersionId)
    wanted = set(bindingIds.split(",")) if bindingIds else None
    return {"publishedVersionId": str(pv.id), "containsTestData": pv.bundle.get("containsTestData", False),
            "items": service.values(ctx.db, pv, wanted)}


def _subscribe(token: str | None, message: dict[str, Any]) -> tuple[uuid.UUID, set[str]]:
    """Authorises a subscription; returns (publishedVersionId, binding ids). Raises ApiError."""
    with new_session() as db:
        found = resolve_session(db, token)
        user = found[0] if found else None
        try:
            pv_id = uuid.UUID(str(message.get("publishedVersionId")))
        except ValueError:
            raise ApiError(400, "bad_request", "publishedVersionId required") from None
        topics = message.get("topics")
        if not isinstance(topics, list) or not topics or not all(isinstance(t, str) for t in topics):
            raise ApiError(400, "bad_request", "topics must be a non-empty list of strings")
        pv = db.get(PublishedVersion, pv_id)
        if pv is None:
            raise ApiError(404, "not_found", "published version not found")
        service.check_access(db, user, service.project_of(db, pv))
        forbidden = set(topics) - service.allowed_topics(pv)
        if forbidden:
            raise ApiError(403, "forbidden_topic", "Topic not part of this published page", topics=sorted(forbidden))
        db.commit()
        return pv_id, {t.split(":", 1)[1] for t in topics}


def _snapshot(token: str | None, pv_id: uuid.UUID, binding_ids: set[str]) -> dict[str, Any]:
    with new_session() as db:
        pv = db.get(PublishedVersion, pv_id)
        if pv is None:
            raise ApiError(404, "not_found", "published version not found")
        project = service.project_of(db, pv)
        if project.runtime_visibility != "public":
            found = resolve_session(db, token)
            service.check_access(db, found[0] if found else None, project)
        items = service.values(db, pv, binding_ids)
        db.commit()
        return {"type": "values", "publishedVersionId": str(pv_id), "sentAt": datetime.now(UTC).isoformat(), "items": items}


@router.websocket("/runtime/ws")
async def runtime_ws(ws: WebSocket) -> None:
    if not origin_allowed(ws.headers.get("origin")):
        await ws.close(code=4403)
        return
    await ws.accept()
    token = ws.cookies.get(SESSION_COOKIE)
    subscription: tuple[uuid.UUID, set[str]] | None = None
    interval = get_settings().ws_push_interval_seconds
    try:
        while True:
            try:
                message = await asyncio.wait_for(ws.receive_json(), timeout=interval if subscription else None)
            except TimeoutError:
                message = None
            if message is not None:
                if not isinstance(message, dict) or message.get("type") not in ("subscribe", "unsubscribe", "ping"):
                    await ws.send_json({"type": "error", "code": "bad_request", "message": "unknown message type"})
                    continue
                if message["type"] == "ping":
                    await ws.send_json({"type": "pong"})
                    continue
                if message["type"] == "unsubscribe":
                    subscription = None
                    continue
                try:
                    subscription = await run_in_threadpool(_subscribe, token, message)
                except ApiError as exc:
                    await ws.send_json({"type": "error", "code": exc.code, "message": exc.title, **exc.extra})
                    if exc.status == 401:
                        await ws.close(code=4401)
                        return
                    continue
                await ws.send_json({"type": "subscribed", "publishedVersionId": str(subscription[0]),
                                    "topics": sorted(f"binding:{b}" for b in subscription[1])})
            if subscription:
                try:
                    await ws.send_json(await run_in_threadpool(_snapshot, token, *subscription))
                except ApiError as exc:
                    await ws.send_json({"type": "error", "code": exc.code, "message": exc.title})
                    await ws.close(code=4401 if exc.status == 401 else 4403)
                    return
    except WebSocketDisconnect:
        return
