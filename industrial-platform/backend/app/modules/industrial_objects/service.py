import re
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.contracts import require_valid
from app.core.db import utcnow, uuid7
from app.core.errors import ApiError, conflict, not_found, unprocessable
from app.modules.data_sources.models import DataSource
from app.modules.industrial_objects.models import IndustrialObject, ObjectRelation, ObjectType, ObjectTypeVersion
from app.modules.industrial_objects.units import UNITS, UnitError, convert

SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")


def _semver(v: str) -> tuple[int, int, int]:
    m = SEMVER.match(v)
    if not m:
        raise unprocessable([{"pointer": "/version", "code": "semver", "message": "MAJOR.MINOR.PATCH expected"}])
    return int(m[1]), int(m[2]), int(m[3])


# ----------------------------------------------------------------- object types

def type_to_dict(t: ObjectType, v: ObjectTypeVersion) -> dict[str, Any]:
    return {**v.spec, "id": str(t.id), "version": v.version, "status": v.status, "lockVersion": v.lock_version}


def create_type(db: Session, project_id: uuid.UUID, body: dict[str, Any]) -> tuple[ObjectType, ObjectTypeVersion]:
    type_id = uuid7()
    spec = {**body, "id": str(type_id), "status": body.get("status", "draft")}
    spec.pop("lockVersion", None)
    require_valid("industrial-object-type.schema.json", spec)
    if spec["status"] not in ("draft", "published"):
        raise unprocessable([{"pointer": "/status", "code": "enum", "message": "draft or published on create"}])
    for i, var in enumerate(spec["variables"]):
        if var.get("unit") is not None and var["unit"] not in UNITS:
            raise unprocessable([{"pointer": f"/variables/{i}/unit", "code": "unknown_unit", "message": f"unknown unit {var['unit']!r}"}])
    major, minor, patch = _semver(spec["version"])
    t = ObjectType(id=type_id, project_id=project_id, key=spec["key"], category=spec["category"], name=spec["name"])
    v = ObjectTypeVersion(type_id=type_id, version=spec["version"], major=major, minor=minor, patch=patch,
                          status=spec["status"], spec=spec, published_at=utcnow() if spec["status"] == "published" else None)
    db.add(t)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise conflict("key_taken", f"Object type {spec['key']!r} already exists") from exc
    db.add(v)
    db.flush()
    return t, v


def get_type_version(db: Session, type_id: uuid.UUID, version: str) -> tuple[ObjectType, ObjectTypeVersion]:
    t = db.get(ObjectType, type_id)
    v = db.scalar(select(ObjectTypeVersion).where(ObjectTypeVersion.type_id == type_id, ObjectTypeVersion.version == version)) if t else None
    if t is None or v is None:
        raise not_found("object type version")
    return t, v


def list_types(db: Session, project_id: uuid.UUID) -> list[tuple[ObjectType, ObjectTypeVersion]]:
    rows = db.execute(
        select(ObjectType, ObjectTypeVersion).join(ObjectTypeVersion, ObjectTypeVersion.type_id == ObjectType.id)
        .where(ObjectType.project_id == project_id).order_by(ObjectType.key, ObjectTypeVersion.major, ObjectTypeVersion.minor, ObjectTypeVersion.patch)
    )
    return [(t, v) for t, v in rows]


def publish_type_version(v: ObjectTypeVersion) -> None:
    if v.status != "draft":
        raise conflict("not_draft", "Only draft versions can be published")
    v.status = "published"
    v.spec = {**v.spec, "status": "published"}
    v.published_at = utcnow()
    v.lock_version += 1


# ----------------------------------------------------------------- objects

def object_to_dict(db: Session, o: IndustrialObject) -> dict[str, Any]:
    v = db.get(ObjectTypeVersion, o.type_version_id)
    assert v is not None
    relations = db.scalars(select(ObjectRelation).where(ObjectRelation.source_object_id == o.id))
    return {
        "id": str(o.id), "projectId": str(o.project_id), "typeId": str(v.type_id), "typeVersion": v.version,
        "key": o.key, "name": o.name, "parentId": str(o.parent_id) if o.parent_id else None, "status": o.status,
        "parameters": o.parameters, "variableSources": o.variable_sources,
        "relations": [{"relationKey": r.relation_key, "targetObjectId": str(r.target_object_id)} for r in relations],
        "tags": list(o.tags), "lockVersion": o.lock_version,
    }


def _check_against_type(db: Session, project_id: uuid.UUID, spec: dict[str, Any], type_spec: dict[str, Any]) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []
    params = {p["key"]: p for p in type_spec.get("parameters", [])}
    for key, value in spec.get("parameters", {}).items():
        p = params.get(key)
        if p is None:
            errors.append({"pointer": f"/parameters/{key}", "code": "unknown_parameter", "message": f"type has no parameter {key!r}"})
        elif p["dataType"] in ("number", "integer") and (isinstance(value, bool) or not isinstance(value, (int, float))):
            errors.append({"pointer": f"/parameters/{key}", "code": "type", "message": f"{p['dataType']} expected"})
        elif p["dataType"] in ("number", "integer") and "minimum" in p and value < p["minimum"]:
            errors.append({"pointer": f"/parameters/{key}", "code": "minimum", "message": f">= {p['minimum']}"})
    for key, p in params.items():
        if p.get("required") and key not in spec.get("parameters", {}):
            errors.append({"pointer": f"/parameters/{key}", "code": "required", "message": f"parameter {key!r} is required"})
    variables = {v["key"]: v for v in type_spec["variables"]}
    for key, src in spec.get("variableSources", {}).items():
        var = variables.get(key)
        pointer = f"/variableSources/{key}"
        if var is None:
            errors.append({"pointer": pointer, "code": "unknown_variable", "message": f"type has no variable {key!r}"})
            continue
        if src["kind"] == "data_source_signal":
            ds = db.get(DataSource, uuid.UUID(src["dataSourceId"]))
            if ds is None or ds.project_id != project_id:
                errors.append({"pointer": pointer + "/dataSourceId", "code": "not_found", "message": "data source not in project"})
            unit_from, unit_to = src.get("sourceUnit"), var.get("unit")
            if unit_from and unit_to:
                try:
                    convert(1.0, unit_from, unit_to)
                except UnitError as exc:
                    errors.append({"pointer": pointer + "/sourceUnit", "code": "unit_incompatible", "message": str(exc)})
    for field in ("parentId",):
        if spec.get(field):
            other = db.get(IndustrialObject, uuid.UUID(spec[field]))
            if other is None or other.project_id != project_id:
                errors.append({"pointer": f"/{field}", "code": "not_found", "message": "object not in project"})
    for i, rel in enumerate(spec.get("relations", [])):
        other = db.get(IndustrialObject, uuid.UUID(rel["targetObjectId"]))
        if other is None or other.project_id != project_id:
            errors.append({"pointer": f"/relations/{i}/targetObjectId", "code": "not_found", "message": "object not in project"})
    return errors


def create_object(db: Session, project_id: uuid.UUID, body: dict[str, Any]) -> IndustrialObject:
    obj_id = uuid7()
    spec = {**body, "id": str(obj_id), "projectId": str(project_id)}
    spec.setdefault("status", "active")
    spec.pop("lockVersion", None)
    require_valid("industrial-object.schema.json", spec)
    t, v = get_type_version(db, uuid.UUID(spec["typeId"]), spec["typeVersion"])
    if t.project_id != project_id:
        raise not_found("object type version")
    if v.status != "published":
        raise ApiError(422, "type_not_published", "Objects can only use published object type versions")
    errors = _check_against_type(db, project_id, spec, v.spec)
    if errors:
        raise unprocessable(errors)
    o = IndustrialObject(id=obj_id, project_id=project_id, type_version_id=v.id, key=spec["key"], name=spec["name"],
                         parent_id=uuid.UUID(spec["parentId"]) if spec.get("parentId") else None, status=spec["status"],
                         parameters=spec.get("parameters", {}), variable_sources=spec.get("variableSources", {}),
                         tags=spec.get("tags", []))
    db.add(o)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise conflict("key_taken", f"Object {spec['key']!r} already exists") from exc
    for rel in spec.get("relations", []):
        db.add(ObjectRelation(source_object_id=o.id, relation_key=rel["relationKey"], target_object_id=uuid.UUID(rel["targetObjectId"])))
    db.flush()
    return o


def get_object(db: Session, object_id: uuid.UUID) -> IndustrialObject:
    o = db.get(IndustrialObject, object_id)
    if o is None:
        raise not_found("object")
    return o


def list_objects(db: Session, project_id: uuid.UUID, q: str | None, limit: int) -> list[IndustrialObject]:
    stmt = select(IndustrialObject).where(IndustrialObject.project_id == project_id)
    if q:
        stmt = stmt.where(IndustrialObject.key.ilike(f"%{q.replace('%', '').replace('_', '')}%"))
    return list(db.scalars(stmt.order_by(IndustrialObject.key).limit(limit)))
