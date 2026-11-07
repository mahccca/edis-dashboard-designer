"""Resolves current values for object variables and data bindings through the data-source adapters.

Every value carries `dataOrigin` and `isTestData` so no surface can present simulated data as real.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.modules.data_sources.adapters import adapter_for
from app.modules.data_sources.jsonpath import PathError, resolve_path
from app.modules.data_sources.models import DataSource
from app.modules.industrial_objects.models import IndustrialObject, ObjectTypeVersion
from app.modules.industrial_objects.units import UnitError, convert
from app.modules.modeling.expression import FormulaError, evaluate, parse_formula


def _iso(ts: datetime | None) -> str | None:
    return ts.isoformat() if ts else None


def _empty(quality: str = "no_data", origin: str = "live", test: bool = False) -> dict[str, Any]:
    return {"value": None, "unit": None, "quality": quality, "sourceTimestamp": None, "dataOrigin": origin, "isTestData": test}


def resolve_variable(db: Session, obj: IndustrialObject, variable: str, now: datetime) -> dict[str, Any]:
    tv = db.get(ObjectTypeVersion, obj.type_version_id)
    var = next((v for v in tv.spec["variables"] if v["key"] == variable), None) if tv else None
    src = obj.variable_sources.get(variable)
    if var is None or src is None:
        return _empty()
    target_unit = var.get("unit") or ""
    if src["kind"] == "manual":
        return {"value": src["value"], "unit": target_unit, "quality": "good", "sourceTimestamp": src["enteredAt"],
                "dataOrigin": "manual", "isTestData": False}
    ds = db.get(DataSource, uuid.UUID(str(src["dataSourceId"])))
    if ds is None:
        return _empty("bad")
    adapter = adapter_for(ds.kind)
    reading = adapter.read_latest(ds.config, [src["signal"]], now)[src["signal"]]
    if reading is None or not isinstance(reading.value, (int, float)) or isinstance(reading.value, bool):
        out = _empty("no_data", adapter.data_origin, adapter.is_test_data)
        if reading is not None:
            out.update(value=reading.value, quality="good", sourceTimestamp=_iso(reading.ts))
        return out
    value = float(reading.value) * src.get("scale", 1) + src.get("offset", 0)
    try:
        value = convert(value, src.get("sourceUnit") or reading.unit, target_unit or reading.unit)
    except UnitError:
        return _empty("bad", adapter.data_origin, adapter.is_test_data)
    return {"value": value, "unit": target_unit or reading.unit, "quality": "good", "sourceTimestamp": _iso(reading.ts),
            "dataOrigin": adapter.data_origin, "isTestData": adapter.is_test_data}


def _unwrap_singleton_list(value: Any) -> Any:
    """`$[*].field` over one parent yields `[scalar]` — KPI/inputs need the scalar."""
    if isinstance(value, list) and len(value) == 1:
        inner = value[0]
        if not isinstance(inner, (dict, list)):
            return inner
    return value


def _pack_reading(value: Any, unit: str | None, ts: datetime | None, origin: str, test: bool) -> dict[str, Any]:
    value = _unwrap_singleton_list(value)
    if isinstance(value, (dict, list)):
        return {"value": value, "unit": unit or None, "quality": "good",
                "sourceTimestamp": _iso(ts), "dataOrigin": origin, "isTestData": test}
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return {"value": float(value), "unit": unit, "quality": "good",
                "sourceTimestamp": _iso(ts), "dataOrigin": origin, "isTestData": test}
    return {"value": value, "unit": unit, "quality": "good",
            "sourceTimestamp": _iso(ts), "dataOrigin": origin, "isTestData": test}


def _resolve_data_source_signal(
    db: Session, data_source_id: Any, signal: str, now: datetime, field_path: str | None = None,
) -> dict[str, Any]:
    ds = db.get(DataSource, uuid.UUID(str(data_source_id)))
    if ds is None:
        return _empty("bad")
    if hasattr(ds, "enabled") and ds.enabled is False:
        return _empty("no_data")
    adapter = adapter_for(ds.kind)
    # Prefer adapter path that applies fieldPath on the raw JSON (before options/scalar extract).
    if hasattr(adapter, "read_binding_value"):
        reading = adapter.read_binding_value(ds.config, signal, now, field_path)
        if reading is None:
            return _empty("no_data", adapter.data_origin, adapter.is_test_data)
        return _pack_reading(reading.value, reading.unit, reading.ts, adapter.data_origin, adapter.is_test_data)
    reading = adapter.read_latest(ds.config, [signal], now)[signal]
    if reading is None:
        return _empty("no_data", adapter.data_origin, adapter.is_test_data)
    value: Any = reading.value
    if field_path:
        try:
            value = resolve_path(value, field_path)
        except PathError:
            return _empty("no_data", adapter.data_origin, adapter.is_test_data)
    return _pack_reading(value, reading.unit, reading.ts, adapter.data_origin, adapter.is_test_data)


def binding_data_origin(db: Session, spec: dict[str, Any]) -> dict[str, Any]:
    """Where a binding's values come from, without reading a value (used for the publish-time bundle label)."""
    source = spec["source"]
    if source["kind"] == "static":
        return {"dataOrigin": "static", "isTestData": False}
    if source["kind"] == "model_output":
        return {"dataOrigin": "model", "isTestData": False}
    if source["kind"] == "data_source_signal":
        ds = db.get(DataSource, uuid.UUID(str(source["dataSourceId"])))
        if ds is None:
            return {"dataOrigin": "live", "isTestData": False}
        adapter = adapter_for(ds.kind)
        return {"dataOrigin": adapter.data_origin, "isTestData": adapter.is_test_data}
    obj = db.get(IndustrialObject, uuid.UUID(str(source["objectId"])))
    src = obj.variable_sources.get(source["variable"]) if obj else None
    if src is None:
        return {"dataOrigin": "live", "isTestData": False}
    if src["kind"] == "manual":
        return {"dataOrigin": "manual", "isTestData": False}
    ds = db.get(DataSource, uuid.UUID(str(src["dataSourceId"])))
    if ds is None:
        return {"dataOrigin": "live", "isTestData": False}
    adapter = adapter_for(ds.kind)
    return {"dataOrigin": adapter.data_origin, "isTestData": adapter.is_test_data}


def _apply_format(value: Any, fmt: str | None) -> Any:
    if not fmt or fmt == "none" or value is None:
        return value
    if fmt == "string":
        return str(value)
    if fmt == "number" and isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if fmt == "percent" and isinstance(value, (int, float)) and not isinstance(value, bool):
        return f"{float(value):.1f}%"
    if fmt in {"date", "datetime"} and isinstance(value, str):
        return value  # display-ready ISO passthrough
    return value


def _apply_transform(v: dict[str, Any], transform: dict[str, Any]) -> dict[str, Any]:
    if isinstance(v["value"], (int, float)) and not isinstance(v["value"], bool):
        value = v["value"]
        if transform.get("toUnit") and v["unit"] is not None:
            try:
                value = convert(value, v["unit"], transform["toUnit"])
                v = {**v, "unit": transform["toUnit"]}
            except UnitError:
                return _empty("bad", v["dataOrigin"], v["isTestData"])
        if transform.get("expression"):
            try:
                value = evaluate(parse_formula(transform["expression"]), {"value": value}, 1000)
            except (FormulaError, ArithmeticError, KeyError):
                return _empty("bad", v["dataOrigin"], v["isTestData"])
        if "decimals" in transform:
            value = round(float(value), transform["decimals"])
        v = {**v, "value": value}
    if transform.get("format"):
        v = {**v, "value": _apply_format(v["value"], transform.get("format"))}
    return v


def resolve_binding(db: Session, spec: dict[str, Any], now: datetime | None = None,
                    item_context: dict[str, Any] | None = None) -> dict[str, Any]:
    """`spec` is a data-binding contract document (live row or published snapshot).

    `item_context` supports repeater relative paths (e.g. alias `item` → current array element).
    """
    now = now or datetime.now(UTC)
    source = spec["source"]
    base = {"bindingId": spec["id"], "origin": source["kind"], "modelRunId": None}
    if source["kind"] == "static":
        return {**base, "value": source["value"], "unit": None, "quality": "good", "sourceTimestamp": None,
                "dataOrigin": "static", "isTestData": False}
    if source["kind"] == "model_output":
        return {**base, **_empty("no_data", "model")}
    if source["kind"] == "data_source_signal":
        field_path = source.get("fieldPath")
        # Relative repeater path: item.foo → resolve against item_context
        if item_context and isinstance(field_path, str):
            for alias, item in item_context.items():
                prefix = f"{alias}."
                if field_path == alias or field_path == f"$.{alias}":
                    v = _pack_reading(item, None, now, "live", False)
                    break
                if field_path.startswith(prefix) or field_path.startswith(f"$.{prefix}"):
                    rel = field_path.removeprefix("$.").removeprefix(prefix)
                    try:
                        v = _pack_reading(resolve_path(item, rel), None, now, "live", False)
                    except PathError:
                        v = _empty("no_data")
                    break
            else:
                v = _resolve_data_source_signal(db, source["dataSourceId"], source["signal"], now, field_path)
        else:
            v = _resolve_data_source_signal(db, source["dataSourceId"], source["signal"], now, field_path)
    else:
        obj = db.get(IndustrialObject, uuid.UUID(str(source["objectId"])))
        if obj is None:
            return {**base, **_empty("bad")}
        v = resolve_variable(db, obj, source["variable"], now)

    if v.get("value") is None and "defaultValue" in spec:
        v = {**v, "value": spec["defaultValue"], "quality": "good" if spec["defaultValue"] is not None else v.get("quality", "no_data")}

    v = _apply_transform(v, spec.get("transform", {}))
    stale_ms = spec.get("delivery", {}).get("staleAfterMs")
    if stale_ms and v.get("sourceTimestamp") and v.get("quality") == "good":
        age = (now - datetime.fromisoformat(v["sourceTimestamp"])).total_seconds() * 1000
        if age > stale_ms:
            v = {**v, "quality": "stale"}
    return {**base, **v}
