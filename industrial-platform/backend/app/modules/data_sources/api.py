import uuid
from typing import Any

from fastapi import APIRouter, Body, Depends, Request, Response

from app.core.auth import Ctx, current
from app.core.http import etag, page_params, require_if_match
from app.modules.audit.service import record
from app.modules.data_sources import service
from app.modules.data_sources.adapters import adapter_for
from app.modules.iam.service import authorize

router = APIRouter(tags=["data-sources"])


@router.get("/projects/{project_id}/data-sources")
def list_data_sources(project_id: uuid.UUID, ctx: Ctx = Depends(current)) -> dict:
    authorize(ctx.db, ctx.user, project_id, "data_source.view", "project")
    return {"items": [service.to_dict(ds) for ds in service.list_for(ctx.db, project_id)]}


@router.post("/projects/{project_id}/data-sources", status_code=201)
def create_data_source(project_id: uuid.UUID, body: dict[str, Any] = Body(...), ctx: Ctx = Depends(current)) -> dict:
    authorize(ctx.db, ctx.user, project_id, "data_source.manage", "project")
    ds = service.create(ctx.db, project_id, body)
    record(ctx.db, action="data_source.created", entity_type="data_source", entity_id=ds.id, actor=ctx.user.id if ctx.user else None,
           project_id=project_id, summary={"kind": ds.kind}, request_id=ctx.request_id, ip=ctx.ip)
    ctx.db.commit()
    return service.to_dict(ds)


@router.patch("/data-sources/{data_source_id}")
def update_data_source(data_source_id: uuid.UUID, request: Request, response: Response,
                       body: dict[str, Any] = Body(...), ctx: Ctx = Depends(current)) -> dict:
    ds = service.get(ctx.db, data_source_id)
    authorize(ctx.db, ctx.user, ds.project_id, "data_source.manage", "data source")
    require_if_match(request, "v", ds.lock_version)
    service.update(ctx.db, ds, body)
    record(ctx.db, action="data_source.updated", entity_type="data_source", entity_id=ds.id, actor=ctx.user.id,
           project_id=ds.project_id, summary={"fields": sorted(body)}, request_id=ctx.request_id, ip=ctx.ip)
    ctx.db.commit()
    response.headers["ETag"] = etag("v", ds.lock_version)
    return service.to_dict(ds)


@router.delete("/data-sources/{data_source_id}", status_code=204)
def delete_data_source(data_source_id: uuid.UUID, request: Request, response: Response,
                       ctx: Ctx = Depends(current)) -> Response:
    ds = service.get(ctx.db, data_source_id)
    authorize(ctx.db, ctx.user, ds.project_id, "data_source.manage", "data source")
    require_if_match(request, "v", ds.lock_version)
    project_id, kind = ds.project_id, ds.kind
    service.delete(ctx.db, ds)
    record(ctx.db, action="data_source.deleted", entity_type="data_source", entity_id=data_source_id,
           actor=ctx.user.id if ctx.user else None, project_id=project_id, summary={"kind": kind},
           request_id=ctx.request_id, ip=ctx.ip)
    ctx.db.commit()
    response.status_code = 204
    return response


@router.post("/data-sources/{data_source_id}/test")
def test_data_source(data_source_id: uuid.UUID, ctx: Ctx = Depends(current)) -> dict:
    ds = service.get(ctx.db, data_source_id)
    authorize(ctx.db, ctx.user, ds.project_id, "data_source.manage", "data source")
    result = adapter_for(ds.kind).test(ds.config)
    service.mark_checked(ctx.db, ds)
    ctx.db.commit()
    return {**result, "isTestData": adapter_for(ds.kind).is_test_data}


@router.get("/data-sources/{data_source_id}/signals")
def search_signals(data_source_id: uuid.UUID, q: str | None = None, limit: int | None = None,
                   ctx: Ctx = Depends(current)) -> dict:
    ds = service.get(ctx.db, data_source_id)
    authorize(ctx.db, ctx.user, ds.project_id, "object.edit", "data source")
    return {"items": adapter_for(ds.kind).search_signals(ds.config, q, page_params(limit))}


@router.get("/data-sources/{data_source_id}/option-sets")
def list_option_sets(data_source_id: uuid.UUID, ctx: Ctx = Depends(current)) -> dict:
    """Option catalogs for page-builder props (string fill only; not live bindings)."""
    ds = service.get(ctx.db, data_source_id)
    authorize(ctx.db, ctx.user, ds.project_id, "object.edit", "data source")
    adapter = adapter_for(ds.kind)
    items = adapter.list_option_sets(ds.config) if hasattr(adapter, "list_option_sets") else []
    return {"items": items}


@router.post("/data-sources/{data_source_id}/execute")
def execute_query(data_source_id: uuid.UUID, body: dict[str, Any] = Body(...), ctx: Ctx = Depends(current)) -> dict:
    """Run a named query; persist sample; optionally discover schema when ok."""
    from app.modules.data_sources import registry

    ds = service.get(ctx.db, data_source_id)
    authorize(ctx.db, ctx.user, ds.project_id, "data_source.manage", "data source")
    query_key = body.get("queryKey")
    if not isinstance(query_key, str) or not query_key.strip():
        from app.core.errors import unprocessable
        raise unprocessable([{"pointer": "/queryKey", "code": "required", "message": "queryKey required"}])
    adapter = adapter_for(ds.kind)
    if not hasattr(adapter, "execute_query"):
        result = {"ok": False, "statusCode": None, "headers": {}, "body": None, "latencyMs": None,
                  "byteSize": 0, "message": f"execute not supported for kind {ds.kind!r}", "queryKey": query_key}
        return result
    # Admin Execute/Discover bypasses cache so the sample is fresh; live reads still honor refreshIntervalMs.
    use_cache = bool(body.get("useCache", False))
    result = adapter.execute_query(ds.config, query_key.strip(), use_cache=use_cache)
    sample = registry.save_sample(ctx.db, ds, query_key.strip(), result)
    schema_out = None
    if result.get("ok") and body.get("discover", True):
        row = registry.discover_and_store(ctx.db, ds, query_key.strip(), result.get("body"), sample.id)
        schema_out = registry.schema_to_dict(row, sample)
    service.mark_checked(ctx.db, ds)
    ctx.db.commit()
    return {**result, "sampleId": str(sample.id), "schema": schema_out, "isTestData": adapter.is_test_data}


@router.post("/data-sources/{data_source_id}/discover-schema")
def discover_schema(data_source_id: uuid.UUID, body: dict[str, Any] = Body(...), ctx: Ctx = Depends(current)) -> dict:
    from app.modules.data_sources import registry
    from app.core.errors import unprocessable

    ds = service.get(ctx.db, data_source_id)
    authorize(ctx.db, ctx.user, ds.project_id, "data_source.manage", "data source")
    query_key = body.get("queryKey")
    if not isinstance(query_key, str) or not query_key.strip():
        raise unprocessable([{"pointer": "/queryKey", "code": "required", "message": "queryKey required"}])
    sample = registry.latest_sample(ctx.db, ds.id, query_key.strip())
    if sample is None or sample.body is None:
        # execute first
        adapter = adapter_for(ds.kind)
        if not hasattr(adapter, "execute_query"):
            raise unprocessable([{"pointer": "", "code": "unsupported", "message": "no sample and cannot execute"}])
        result = adapter.execute_query(ds.config, query_key.strip())
        sample = registry.save_sample(ctx.db, ds, query_key.strip(), result)
        if not result.get("ok"):
            ctx.db.commit()
            return {"ok": False, "message": result.get("message"), "schema": None}
    prev = registry.latest_schema(ctx.db, ds.id, query_key.strip())
    row = registry.discover_and_store(ctx.db, ds, query_key.strip(), sample.body, sample.id)
    diff = registry.diff_schemas(prev.schema, row.schema) if prev else None
    ctx.db.commit()
    return {"ok": True, "schema": registry.schema_to_dict(row, sample), "diff": diff}


@router.get("/data-sources/{data_source_id}/schemas")
def list_schemas(data_source_id: uuid.UUID, queryKey: str | None = None, ctx: Ctx = Depends(current)) -> dict:
    from app.modules.data_sources import registry

    ds = service.get(ctx.db, data_source_id)
    authorize(ctx.db, ctx.user, ds.project_id, "object.edit", "data source")
    rows = registry.list_schemas(ctx.db, ds.id, queryKey)
    return {"items": [
        {"id": str(r.id), "queryKey": r.query_key, "version": r.version,
         "createdAt": r.created_at.isoformat() if r.created_at else None}
        for r in rows
    ]}


@router.get("/data-sources/{data_source_id}/schema/latest")
def get_latest_schema(data_source_id: uuid.UUID, queryKey: str, ctx: Ctx = Depends(current)) -> dict:
    """Latest schema for a query. queryKey is a query param so keys may contain '/' (e.g. watchlists/signals)."""
    from app.modules.data_sources import registry
    from app.core.errors import not_found, unprocessable

    ds = service.get(ctx.db, data_source_id)
    authorize(ctx.db, ctx.user, ds.project_id, "object.edit", "data source")
    if not isinstance(queryKey, str) or not queryKey.strip():
        raise unprocessable([{"pointer": "/queryKey", "code": "required", "message": "queryKey required"}])
    key = queryKey.strip()
    row = registry.latest_schema(ctx.db, ds.id, key)
    if row is None:
        raise not_found("schema")
    sample = registry.latest_sample(ctx.db, ds.id, key)
    return registry.schema_to_dict(row, sample)


@router.post("/data-sources/{data_source_id}/duplicate", status_code=201)
def duplicate_data_source(data_source_id: uuid.UUID, body: dict[str, Any] = Body(default={}),
                          ctx: Ctx = Depends(current)) -> dict:
    ds = service.get(ctx.db, data_source_id)
    authorize(ctx.db, ctx.user, ds.project_id, "data_source.manage", "data source")
    name = body.get("name") or f"{ds.name} (copy)"
    clone = service.create(ctx.db, ds.project_id, {
        "name": name, "kind": ds.kind, "config": ds.config,
        "description": ds.description, "enabled": ds.enabled,
    })
    ctx.db.commit()
    return service.to_dict(clone)


@router.post("/data-sources/{data_source_id}/import-openapi")
def import_openapi(data_source_id: uuid.UUID, body: dict[str, Any] = Body(...), ctx: Ctx = Depends(current)) -> dict:
    """Phase 5: import OpenAPI paths as http_json queries (best-effort)."""
    from app.core.errors import unprocessable

    ds = service.get(ctx.db, data_source_id)
    authorize(ctx.db, ctx.user, ds.project_id, "data_source.manage", "data source")
    if ds.kind != "http_json":
        raise unprocessable([{"pointer": "", "code": "unsupported", "message": "only http_json supports OpenAPI import"}])
    doc = body.get("document")
    if not isinstance(doc, dict) or "paths" not in doc:
        raise unprocessable([{"pointer": "/document", "code": "required", "message": "OpenAPI document with paths required"}])
    queries = list(ds.config.get("queries") or [])
    existing = {q.get("key") for q in queries if isinstance(q, dict)}
    added = []
    for path, methods in (doc.get("paths") or {}).items():
        if not isinstance(methods, dict):
            continue
        for method, op in methods.items():
            m = str(method).upper()
            if m not in {"GET", "POST", "PUT", "PATCH", "DELETE"} or not isinstance(op, dict):
                continue
            key = (op.get("operationId") or f"{m.lower()}{path.replace('/', '_')}").replace(" ", "_")[:120]
            if key in existing:
                continue
            queries.append({
                "key": key, "name": op.get("summary") or key, "method": m,
                "urlPath": path if str(path).startswith("/") else f"/{path}",
                "resultMode": "json", "jsonPath": "$", "unit": "",
            })
            existing.add(key)
            added.append(key)
    service.update(ctx.db, ds, {"config": {**ds.config, "queries": queries}})
    ctx.db.commit()
    return {"ok": True, "added": added, "dataSource": service.to_dict(ds)}


@router.get("/projects/{project_id}/binding-health")
def binding_health(project_id: uuid.UUID, ctx: Ctx = Depends(current)) -> dict:
    """Phase 4: compare data_source_signal fieldPaths against latest schemas."""
    from app.modules.data_bindings import service as binding_service
    from app.modules.data_sources import registry

    authorize(ctx.db, ctx.user, project_id, "page.view", "project")
    items = []
    for b in binding_service.list_for(ctx.db, project_id):
        spec = binding_service.to_dict(b)
        src = spec.get("source") or {}
        if src.get("kind") != "data_source_signal":
            continue
        field_path = src.get("fieldPath")
        if not field_path:
            continue
        try:
            ds_id = uuid.UUID(str(src["dataSourceId"]))
        except (ValueError, KeyError):
            items.append({"bindingId": str(b.id), "name": b.name, "status": "bad_source", "path": field_path})
            continue
        schema_row = registry.latest_schema(ctx.db, ds_id, src.get("signal", ""))
        if schema_row is None:
            items.append({"bindingId": str(b.id), "name": b.name, "status": "no_schema", "path": field_path})
            continue
        paths = {p["path"] for p in registry.schema_to_dict(schema_row)["paths"]}
        # normalize comparison
        candidates = {field_path, field_path.removeprefix("$.").removeprefix("$")}
        ok = any(c in paths or f"$.{c}" in paths or c.startswith("$") and c in paths for c in candidates)
        # also accept prefix array item paths
        if not ok:
            ok = any(field_path.startswith(p.rstrip("[*]")) for p in paths)
        items.append({
            "bindingId": str(b.id), "name": b.name, "status": "ok" if ok else "stale_schema",
            "path": field_path, "queryKey": src.get("signal"), "schemaVersion": schema_row.version,
        })
    return {"items": items}
