import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.contracts import require_valid
from app.core.db import uuid7
from app.core.errors import ApiError, not_found, unprocessable
from app.modules.data_bindings.models import DataBinding
from app.modules.industrial_objects.models import IndustrialObject, ObjectTypeVersion
from app.modules.industrial_objects.units import UnitError, convert
from app.modules.modeling.expression import FormulaError, parse_formula, refs


def to_dict(b: DataBinding) -> dict[str, Any]:
    return {**b.spec, "id": str(b.id), "projectId": str(b.project_id), "lockVersion": b.lock_version}


def _semantic(db: Session, project_id: uuid.UUID, spec: dict[str, Any]) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []
    source = spec["source"]
    if source["kind"] == "model_output":
        raise ApiError(422, "source_not_available", "model_output bindings are not available in Vertical Slice 1")
    if source["kind"] == "object_variable":
        obj = db.get(IndustrialObject, uuid.UUID(source["objectId"]))
        if obj is None or obj.project_id != project_id:
            return [{"pointer": "/source/objectId", "code": "not_found", "message": "object not in project"}]
        tv = db.get(ObjectTypeVersion, obj.type_version_id)
        var = next((v for v in tv.spec["variables"] if v["key"] == source["variable"]), None) if tv else None
        if var is None:
            return [{"pointer": "/source/variable", "code": "unknown_variable", "message": f"no variable {source['variable']!r}"}]
        to_unit = spec.get("transform", {}).get("toUnit")
        if to_unit and var.get("unit"):
            try:
                convert(1.0, var["unit"], to_unit)
            except UnitError as exc:
                errors.append({"pointer": "/transform/toUnit", "code": "unit_incompatible", "message": str(exc)})
    expr = spec.get("transform", {}).get("expression")
    if expr:
        try:
            extra = set(refs(parse_formula(expr))) - {"value"}
            if extra:
                errors.append({"pointer": "/transform/expression", "code": "undeclared_identifier",
                               "message": f"only 'value' is available, got {sorted(extra)}"})
        except FormulaError as exc:
            errors.append({"pointer": "/transform/expression", "code": exc.code, "message": str(exc)})
    return errors


def create(db: Session, project_id: uuid.UUID, body: dict[str, Any]) -> DataBinding:
    binding_id = uuid7()
    spec = {k: v for k, v in body.items() if k != "lockVersion"}
    spec.update(id=str(binding_id), projectId=str(project_id))
    require_valid("data-binding.schema.json", spec)
    errors = _semantic(db, project_id, spec)
    if errors:
        raise unprocessable(errors)
    source = spec["source"]
    b = DataBinding(id=binding_id, project_id=project_id, name=spec["name"], source_kind=source["kind"],
                    object_id=uuid.UUID(source["objectId"]) if source["kind"] == "object_variable" else None,
                    variable_key=source.get("variable"), spec={k: v for k, v in spec.items() if k not in ("id", "projectId")})
    db.add(b)
    db.flush()
    return b


def get(db: Session, binding_id: uuid.UUID) -> DataBinding:
    b = db.get(DataBinding, binding_id)
    if b is None:
        raise not_found("data binding")
    return b


def list_for(db: Session, project_id: uuid.UUID) -> list[DataBinding]:
    return list(db.scalars(select(DataBinding).where(DataBinding.project_id == project_id).order_by(DataBinding.name)))


def existing_ids(db: Session, project_id: uuid.UUID, ids: set[uuid.UUID]) -> dict[uuid.UUID, DataBinding]:
    if not ids:
        return {}
    rows = db.scalars(select(DataBinding).where(DataBinding.project_id == project_id, DataBinding.id.in_(ids)))
    return {b.id: b for b in rows}


def update(db: Session, b: DataBinding, body: dict[str, Any]) -> DataBinding:
    from app.core.http import etag, stale

    expected = b.lock_version
    current = db.scalar(select(DataBinding).where(DataBinding.id == b.id).with_for_update())
    if current is None or current.lock_version != expected:
        raise stale(etag("v", current.lock_version if current else None))
    allowed = {"name", "source", "transform", "delivery", "defaultValue"}
    if set(body) - allowed - {"id", "projectId", "lockVersion"}:
        raise unprocessable([{"pointer": "", "code": "additional_properties", "message": f"allowed: {sorted(allowed)}"}])
    spec = {**current.spec}
    if "name" in body:
        if not isinstance(body["name"], str) or not 1 <= len(body["name"]) <= 120:
            raise unprocessable([{"pointer": "/name", "code": "required", "message": "1..120 characters"}])
        current.name = body["name"]
        spec["name"] = body["name"]
    for key in ("source", "transform", "delivery", "defaultValue"):
        if key in body:
            spec[key] = body[key]
    full = {**spec, "id": str(current.id), "projectId": str(current.project_id)}
    require_valid("data-binding.schema.json", full)
    errors = _semantic(db, current.project_id, full)
    if errors:
        raise unprocessable(errors)
    source = full["source"]
    current.source_kind = source["kind"]
    current.object_id = uuid.UUID(source["objectId"]) if source["kind"] == "object_variable" else None
    current.variable_key = source.get("variable")
    current.spec = {k: v for k, v in full.items() if k not in ("id", "projectId")}
    current.lock_version = expected + 1
    db.flush()
    b.name, b.spec, b.lock_version = current.name, current.spec, current.lock_version
    return b


def delete(db: Session, b: DataBinding) -> None:
    db.delete(b)
    db.flush()
