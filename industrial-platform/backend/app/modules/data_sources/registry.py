"""Response sample store + JSON Schema registry (ADR-0016)."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import uuid7
from app.modules.data_sources.jsonpath import PathError, path_exists, resolve_path
from app.modules.data_sources.models import DataSource
from app.modules.data_sources.schema_infer import infer_schema, schema_paths
from app.modules.data_sources.schema_models import ApiResponseSample, ApiSchema


def save_sample(db: Session, ds: DataSource, query_key: str, result: dict[str, Any]) -> ApiResponseSample:
    body = result.get("body")
    sample = ApiResponseSample(
        id=uuid7(),
        data_source_id=ds.id,
        query_key=query_key,
        status_code=result.get("statusCode"),
        headers=result.get("headers") or {},
        body=body if isinstance(body, (dict, list, str, int, float, bool, type(None))) else str(body),
        byte_size=int(result.get("byteSize") or 0),
        ok=bool(result.get("ok")),
        message=result.get("message"),
        latency_ms=result.get("latencyMs"),
    )
    db.add(sample)
    db.flush()
    return sample


def discover_and_store(db: Session, ds: DataSource, query_key: str, body: Any, sample_id: uuid.UUID | None) -> ApiSchema:
    schema = infer_schema(body)
    latest = db.scalar(
        select(func.max(ApiSchema.version)).where(
            ApiSchema.data_source_id == ds.id, ApiSchema.query_key == query_key
        )
    )
    version = int(latest or 0) + 1
    row = ApiSchema(
        id=uuid7(),
        data_source_id=ds.id,
        query_key=query_key,
        version=version,
        schema=schema,
        inferred_from_sample_id=sample_id,
    )
    db.add(row)
    db.flush()
    return row


def list_schemas(db: Session, ds_id: uuid.UUID, query_key: str | None = None) -> list[ApiSchema]:
    stmt = select(ApiSchema).where(ApiSchema.data_source_id == ds_id)
    if query_key:
        stmt = stmt.where(ApiSchema.query_key == query_key)
    return list(db.scalars(stmt.order_by(ApiSchema.query_key, ApiSchema.version.desc())))


def latest_schema(db: Session, ds_id: uuid.UUID, query_key: str) -> ApiSchema | None:
    return db.scalar(
        select(ApiSchema)
        .where(ApiSchema.data_source_id == ds_id, ApiSchema.query_key == query_key)
        .order_by(ApiSchema.version.desc())
        .limit(1)
    )


def latest_sample(db: Session, ds_id: uuid.UUID, query_key: str) -> ApiResponseSample | None:
    return db.scalar(
        select(ApiResponseSample)
        .where(ApiResponseSample.data_source_id == ds_id, ApiResponseSample.query_key == query_key)
        .order_by(ApiResponseSample.captured_at.desc())
        .limit(1)
    )


def schema_to_dict(row: ApiSchema, sample: ApiResponseSample | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": str(row.id),
        "dataSourceId": str(row.data_source_id),
        "queryKey": row.query_key,
        "version": row.version,
        "schema": row.schema,
        "paths": schema_paths(row.schema),
        "createdAt": row.created_at.isoformat() if row.created_at else None,
    }
    if sample and sample.body is not None:
        out["sample"] = sample.body
        # enrich paths with sample values where possible
        enriched = []
        for p in out["paths"]:
            node = dict(p)
            try:
                if path_exists(sample.body, p["path"]):
                    node["sampleValue"] = resolve_path(sample.body, p["path"])
            except PathError:
                pass
            enriched.append(node)
        out["paths"] = enriched
    return out


def diff_schemas(old: dict[str, Any], new: dict[str, Any]) -> dict[str, Any]:
    old_paths = {p["path"]: p.get("type") for p in schema_paths(old)}
    new_paths = {p["path"]: p.get("type") for p in schema_paths(new)}
    removed = sorted(set(old_paths) - set(new_paths))
    added = sorted(set(new_paths) - set(old_paths))
    changed = sorted(p for p in set(old_paths) & set(new_paths) if old_paths[p] != new_paths[p])
    return {"added": added, "removed": removed, "changed": [{"path": p, "from": old_paths[p], "to": new_paths[p]} for p in changed]}
