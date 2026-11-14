"""Component library: definitions + versions (ADR-0007 — no user code, whitelist renderers)."""

from __future__ import annotations

import hashlib
import json
import re
import uuid
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.contracts import require_valid
from app.core.db import utcnow, uuid7
from app.core.errors import conflict, not_found, unprocessable
from app.core.http import etag, stale
from app.modules.components.models import ComponentDefinition, ComponentVersion

# Whitelist of renderers implemented in frontend/src/shared/renderers (ADR-0007).
RENDERERS = [
    {
        "rendererId": "builtin.kpi-card@1",
        "category": "kpi",
        "supportedInputs": ["value", "timestamp", "title"],
        "description": "Single value with unit, thresholds and freshness/test-data indicators.",
    },
    {
        "rendererId": "builtin.gauge@1",
        "category": "gauge",
        "supportedInputs": ["value", "min", "max"],
        "description": "Semi-circular gauge for a numeric reading; value/min/max are bindable.",
    },
    {
        "rendererId": "builtin.image@1",
        "category": "symbol",
        "supportedInputs": ["src"],
        "description": "Image widget from a URL (prop or binding).",
    },
    {
        "rendererId": "builtin.chart@1",
        "category": "chart",
        "supportedInputs": ["dataset"],
        "description": "Unified chart: line/bar/area/pie/scatter/combo from one API-bound dataset.",
    },
    {
        "rendererId": "builtin.map@1",
        "category": "symbol",
        "supportedInputs": ["metrics"],
        "description": "Progressive map: world/continent/country/province/city — loads only the selected region GeoJSON.",
    },
    {
        "rendererId": "builtin.industrial-panel@1",
        "category": "control",
        "supportedInputs": ["power", "voltage", "current", "temperature", "efficiency", "status", "primaryValue", "secondaryValue"],
        "description": "Custom visual industrial panel (Solar Panel, Inverter, BESS, Tank, Motor, etc.) with animated schematics and live telemetry bindings.",
    },
    {
        "rendererId": "builtin.svg-cad@1",
        "category": "symbol",
        "supportedInputs": ["tank_level", "valve_pressure", "pump_status", "temp_hex", "primaryValue", "secondaryValue"],
        "description": "Interactive AutoCAD & Canvas SVG visual schematic with dynamic telemetry hotspots and data overlays.",
    },
    {
        "rendererId": "builtin.model-3d@1",
        "category": "symbol",
        "supportedInputs": ["level", "speed", "rpm", "temperature", "pressure", "power", "status", "primaryValue"],
        "description": "Interactive 3D industrial equipment renderer (Three.js) with mouse rotation, zoom, pan, auto-spin, and live telemetry animation.",
    },
]
RENDERER_IDS = {r["rendererId"] for r in RENDERERS}

SEMVER = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")
QUALIFIED_KEY = re.compile(r"^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*){1,3}$")


def visible_definitions(db: Session, project_id: uuid.UUID, include_global: bool = True) -> list[ComponentDefinition]:
    cond = ComponentDefinition.project_id == project_id
    if include_global:
        cond = or_(cond, ComponentDefinition.project_id.is_(None))
    return list(db.scalars(select(ComponentDefinition).where(cond).order_by(ComponentDefinition.key)))


def find_version(db: Session, project_id: uuid.UUID, definition_id: uuid.UUID, version: str) -> ComponentVersion | None:
    """Only versions of global or same-project definitions are visible to a project."""
    return db.scalar(
        select(ComponentVersion)
        .join(ComponentDefinition, ComponentDefinition.id == ComponentVersion.definition_id)
        .where(ComponentVersion.definition_id == definition_id, ComponentVersion.version == version,
               or_(ComponentDefinition.project_id.is_(None), ComponentDefinition.project_id == project_id))
    )


def get_definition(db: Session, definition_id: uuid.UUID) -> ComponentDefinition:
    d = db.get(ComponentDefinition, definition_id)
    if d is None:
        raise not_found("component")
    return d


def get_version(db: Session, definition_id: uuid.UUID, version: str) -> ComponentVersion:
    v = db.scalar(select(ComponentVersion).where(
        ComponentVersion.definition_id == definition_id, ComponentVersion.version == version,
    ))
    if v is None:
        raise not_found("component version")
    return v


def summary(db: Session, d: ComponentDefinition) -> dict:
    versions = list(db.scalars(select(ComponentVersion).where(ComponentVersion.definition_id == d.id)
                               .order_by(ComponentVersion.major.desc(), ComponentVersion.minor.desc(), ComponentVersion.patch.desc())))
    published = next((v.version for v in versions if v.status == "published"), None)
    draft = next((v.version for v in versions if v.status == "draft"), None)
    return {"id": str(d.id), "key": d.key, "name": d.name, "category": d.category,
            "scope": "global" if d.project_id is None else "project",
            "latestPublishedVersion": published, "draftVersion": draft}


def version_summary(v: ComponentVersion) -> dict:
    return {"definitionId": str(v.definition_id), "version": v.version, "status": v.status, "rendererId": v.renderer_id,
            "publishedAt": v.published_at.isoformat() if v.published_at else None}


def _parse_semver(version: str) -> tuple[int, int, int]:
    if not isinstance(version, str) or not SEMVER.match(version):
        raise unprocessable([{"pointer": "/version", "code": "format", "message": "semver X.Y.Z required"}])
    major, minor, patch = (int(x) for x in version.split("."))
    return major, minor, patch


def _spec_hash(spec: dict[str, Any]) -> bytes:
    canonical = json.dumps(spec, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(canonical).digest()


def _assert_renderer(renderer_id: Any) -> None:
    if renderer_id not in RENDERER_IDS:
        raise unprocessable([{
            "pointer": "/rendererId",
            "code": "unknown_renderer",
            "message": f"renderer {renderer_id!r} is not in the platform whitelist",
        }])


def prepare_spec(
    body: dict[str, Any],
    *,
    definition_id: uuid.UUID,
    version: str,
    status: str,
) -> dict[str, Any]:
    """Fill server-owned fields and validate against the component-definition contract."""
    if not isinstance(body, dict):
        raise unprocessable([{"pointer": "", "code": "type", "message": "object expected"}])
    spec = dict(body)
    spec["id"] = str(definition_id)
    spec["schemaVersion"] = 1
    spec["version"] = version
    spec["status"] = status
    if "key" not in spec or not isinstance(spec["key"], str) or not QUALIFIED_KEY.match(spec["key"]):
        raise unprocessable([{
            "pointer": "/key",
            "code": "pattern",
            "message": "qualified key like project.my-gauge required",
        }])
    _assert_renderer(spec.get("rendererId"))
    # Defaults for optional collections so schema validation is friendlier in Studio.
    spec.setdefault("properties", [])
    spec.setdefault("defaults", {})
    spec.setdefault("inputs", [])
    require_valid("component-definition.schema.json", spec)
    return spec


def create_definition(db: Session, project_id: uuid.UUID, body: dict[str, Any]) -> tuple[ComponentDefinition, ComponentVersion]:
    version = body.get("version") if isinstance(body.get("version"), str) and SEMVER.match(body["version"]) else "0.1.0"
    definition_id = uuid7()
    spec = prepare_spec(body, definition_id=definition_id, version=version, status="draft")
    major, minor, patch = _parse_semver(version)

    d = ComponentDefinition(
        id=definition_id,
        project_id=project_id,
        key=spec["key"],
        category=spec["category"],
        name=spec["name"],
        status="active",
    )
    v = ComponentVersion(
        id=uuid7(),
        definition_id=definition_id,
        version=version,
        major=major,
        minor=minor,
        patch=patch,
        status="draft",
        schema_version=1,
        renderer_id=spec["rendererId"],
        spec=spec,
        spec_hash=_spec_hash(spec),
        lock_version=1,
        published_at=None,
    )
    db.add(d)
    db.add(v)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise conflict("key_taken", "A component with this key already exists in the project") from exc
    return d, v


def save_draft(db: Session, definition_id: uuid.UUID, version: str, body: dict[str, Any], expected_lock: int) -> ComponentVersion:
    d = get_definition(db, definition_id)
    if d.project_id is None:
        raise unprocessable([{"pointer": "", "code": "forbidden_global", "message": "built-in library definitions are read-only"}])
    v = get_version(db, definition_id, version)
    if v.status != "draft":
        raise conflict("not_draft", "Only draft versions can be edited")
    if v.lock_version != expected_lock:
        raise stale(etag("v", v.lock_version))

    # Keep key stable once created (matches unique index on project+key).
    body = dict(body)
    body["key"] = d.key
    spec = prepare_spec(body, definition_id=definition_id, version=version, status="draft")
    if spec["category"] != d.category:
        d.category = spec["category"]
    d.name = spec["name"]
    v.renderer_id = spec["rendererId"]
    v.spec = spec
    v.spec_hash = _spec_hash(spec)
    v.lock_version += 1
    db.flush()
    return v


def bump_version(db: Session, definition_id: uuid.UUID, from_version: str, bump: str) -> ComponentVersion:
    d = get_definition(db, definition_id)
    if d.project_id is None:
        raise unprocessable([{"pointer": "", "code": "forbidden_global", "message": "built-in library definitions are read-only"}])
    if bump not in {"major", "minor", "patch"}:
        raise unprocessable([{"pointer": "/bump", "code": "enum", "message": "major, minor, or patch"}])
    src = get_version(db, definition_id, from_version)
    major, minor, patch = src.major, src.minor, src.patch
    if bump == "major":
        major, minor, patch = major + 1, 0, 0
    elif bump == "minor":
        minor, patch = minor + 1, 0
    else:
        patch += 1
    version = f"{major}.{minor}.{patch}"
    existing = db.scalar(select(ComponentVersion).where(
        ComponentVersion.definition_id == definition_id, ComponentVersion.version == version,
    ))
    if existing is not None:
        raise conflict("version_exists", f"Version {version} already exists")

    # Only one draft at a time keeps Studio simple.
    open_draft = db.scalar(select(ComponentVersion).where(
        ComponentVersion.definition_id == definition_id, ComponentVersion.status == "draft",
    ))
    if open_draft is not None:
        raise conflict("draft_exists", f"Draft {open_draft.version} already exists; publish or delete it first")

    spec = dict(src.spec)
    spec = prepare_spec(spec, definition_id=definition_id, version=version, status="draft")
    v = ComponentVersion(
        id=uuid7(),
        definition_id=definition_id,
        version=version,
        major=major,
        minor=minor,
        patch=patch,
        status="draft",
        schema_version=1,
        renderer_id=spec["rendererId"],
        spec=spec,
        spec_hash=_spec_hash(spec),
        lock_version=1,
        published_at=None,
    )
    db.add(v)
    db.flush()
    return v


def publish_version(db: Session, definition_id: uuid.UUID, version: str) -> ComponentVersion:
    d = get_definition(db, definition_id)
    if d.project_id is None:
        raise unprocessable([{"pointer": "", "code": "forbidden_global", "message": "built-in library definitions are read-only"}])
    v = get_version(db, definition_id, version)
    if v.status != "draft":
        raise conflict("not_draft", "Only draft versions can be published")
    # Re-validate before publish.
    spec = prepare_spec(dict(v.spec), definition_id=definition_id, version=version, status="published")
    v.spec = spec
    v.spec_hash = _spec_hash(spec)
    v.status = "published"
    v.published_at = utcnow()
    v.lock_version += 1
    db.flush()
    return v


def deprecate_version(db: Session, definition_id: uuid.UUID, version: str) -> ComponentVersion:
    d = get_definition(db, definition_id)
    if d.project_id is None:
        raise unprocessable([{"pointer": "", "code": "forbidden_global", "message": "built-in library definitions are read-only"}])
    v = get_version(db, definition_id, version)
    if v.status == "draft":
        raise conflict("is_draft", "Publish first, or delete the draft instead of deprecating")
    if v.status == "deprecated":
        return v
    # Status-only column change is allowed by the guard; published.spec stays immutable.
    v.status = "deprecated"
    v.lock_version += 1
    db.flush()
    return v


def list_usages(db: Session, definition_id: uuid.UUID) -> list[dict[str, Any]]:
    """Best-effort where-used from draft usages and published pins."""
    from app.modules.design.models import ComponentUsage, PublishedVersionPin

    get_definition(db, definition_id)
    version_ids = {
        str(v.id): v.version
        for v in db.scalars(select(ComponentVersion).where(ComponentVersion.definition_id == definition_id))
    }
    if not version_ids:
        return []
    items: list[dict[str, Any]] = []
    for u in db.scalars(select(ComponentUsage).where(ComponentUsage.component_version_id.in_(
        [uuid.UUID(i) for i in version_ids],
    ))):
        items.append({
            "kind": "draft",
            "documentId": str(u.document_id),
            "nodeId": u.node_id,
            "version": version_ids.get(str(u.component_version_id)),
            "revisionNo": u.revision_no,
        })
    for p in db.scalars(select(PublishedVersionPin).where(PublishedVersionPin.component_version_id.in_(
        [uuid.UUID(i) for i in version_ids],
    ))):
        items.append({
            "kind": "published",
            "publishedVersionId": str(p.published_version_id),
            "version": version_ids.get(str(p.component_version_id)),
        })
    return items
