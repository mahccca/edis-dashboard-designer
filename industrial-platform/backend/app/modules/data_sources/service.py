import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.core.errors import ApiError, conflict, not_found, unprocessable
from app.core.http import etag, stale
from app.modules.data_sources.adapters import adapter_for, creatable_kinds
from app.modules.data_sources.adapters.http_json import has_credentials, redact_config
from app.modules.data_sources.models import DataSource


def to_dict(ds: DataSource) -> dict[str, Any]:
    adapter = adapter_for(ds.kind)
    config = redact_config(ds.config) if ds.kind == "http_json" else ds.config
    return {
        "id": str(ds.id), "projectId": str(ds.project_id), "name": ds.name,
        "description": ds.description, "enabled": bool(getattr(ds, "enabled", True)),
        "kind": ds.kind, "config": config,
        "hasCredentials": has_credentials(ds.config) if ds.kind == "http_json" else False, "status": ds.status,
        "lastCheckedAt": ds.last_checked_at.isoformat() if ds.last_checked_at else None,
        "isTestData": adapter.is_test_data, "dataOrigin": adapter.data_origin, "lockVersion": ds.lock_version,
    }


def create(db: Session, project_id: uuid.UUID, body: dict[str, Any]) -> DataSource:
    name, kind, config = body.get("name"), body.get("kind"), body.get("config")
    errors = []
    if not isinstance(name, str) or not 1 <= len(name) <= 120:
        errors.append({"pointer": "/name", "code": "required", "message": "1..120 characters"})
    if kind not in creatable_kinds():
        raise ApiError(422, "adapter_not_available", f"Data source kind {kind!r} is not available",
                       "Available kinds: simulated (test data), http_json (REST API).")
    if not isinstance(config, dict):
        errors.append({"pointer": "/config", "code": "type", "message": "object expected"})
    else:
        errors += adapter_for(kind).validate_config(config)
    if set(body) - {"name", "kind", "config", "description", "enabled"}:
        errors.append({"pointer": "", "code": "additional_properties",
                       "message": "only name, kind, config, description, enabled allowed"})
    if errors:
        raise unprocessable(errors)
    description = body.get("description")
    if description is not None and (not isinstance(description, str) or len(description) > 2000):
        raise unprocessable([{"pointer": "/description", "code": "type", "message": "string ≤2000"}])
    enabled = body.get("enabled", True)
    if not isinstance(enabled, bool):
        raise unprocessable([{"pointer": "/enabled", "code": "type", "message": "boolean expected"}])
    ds = DataSource(project_id=project_id, name=name, kind=kind, config=config, status="healthy",
                    description=description, enabled=enabled)
    db.add(ds)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise conflict("name_taken", "A data source with this name already exists") from exc
    return ds


def update(db: Session, ds: DataSource, body: dict[str, Any]) -> None:
    """Conditional on the lock_version that was checked against If-Match; a concurrent writer makes it 412."""
    if set(body) - {"name", "config", "description", "enabled"}:
        raise unprocessable([{"pointer": "", "code": "additional_properties",
                              "message": "only name, config, description, enabled may change"}])
    expected = ds.lock_version
    current = db.scalar(select(DataSource).where(DataSource.id == ds.id).with_for_update())
    if current is None or current.lock_version != expected:
        raise stale(etag("v", current.lock_version if current else None))
    if "name" in body:
        if not isinstance(body["name"], str) or not 1 <= len(body["name"]) <= 120:
            raise unprocessable([{"pointer": "/name", "code": "required", "message": "1..120 characters"}])
        current.name = body["name"]
    if "description" in body:
        d = body["description"]
        if d is not None and (not isinstance(d, str) or len(d) > 2000):
            raise unprocessable([{"pointer": "/description", "code": "type", "message": "string ≤2000"}])
        current.description = d
    if "enabled" in body:
        if not isinstance(body["enabled"], bool):
            raise unprocessable([{"pointer": "/enabled", "code": "type", "message": "boolean expected"}])
        current.enabled = body["enabled"]
    if "config" in body:
        if not isinstance(body["config"], dict):
            raise unprocessable([{"pointer": "/config", "code": "type", "message": "object expected"}])
        config = body["config"]
        if current.kind == "http_json":
            prev_headers = current.config.get("headers") if isinstance(current.config.get("headers"), dict) else {}
            incoming = config.get("headers") if isinstance(config.get("headers"), dict) else {}
            merged = dict(incoming)
            for key, value in incoming.items():
                if value == "***" and key in prev_headers:
                    merged[key] = prev_headers[key]
            config = {**config, "headers": merged}
        errors = adapter_for(current.kind).validate_config(config)
        if errors:
            raise unprocessable(errors)
        current.config = config
    current.lock_version = expected + 1
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise conflict("name_taken", "A data source with this name already exists") from exc
    ds.name, ds.config, ds.lock_version = current.name, current.config, current.lock_version


def delete(db: Session, ds: DataSource) -> None:
    db.delete(ds)
    db.flush()


def mark_checked(db: Session, ds: DataSource) -> None:
    ds.last_checked_at = utcnow()
    db.flush()


def get(db: Session, ds_id: uuid.UUID) -> DataSource:
    ds = db.get(DataSource, ds_id)
    if ds is None:
        raise not_found("data source")
    return ds


def list_for(db: Session, project_id: uuid.UUID) -> list[DataSource]:
    return list(db.scalars(select(DataSource).where(DataSource.project_id == project_id).order_by(DataSource.name)))
