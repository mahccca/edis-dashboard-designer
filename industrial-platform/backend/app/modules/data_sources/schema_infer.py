"""Infer a JSON Schema (draft-2020-12 subset) from a sample JSON value."""

from __future__ import annotations

from typing import Any


def _merge_object_schemas(schemas: list[dict[str, Any]]) -> dict[str, Any]:
    props: dict[str, Any] = {}
    required_votes: set[str] | None = None
    for s in schemas:
        p = s.get("properties") or {}
        keys = set(p)
        required_votes = keys if required_votes is None else required_votes & keys
        for k, v in p.items():
            if k not in props:
                props[k] = v
            else:
                props[k] = _merge_types(props[k], v)
    out: dict[str, Any] = {"type": "object", "properties": props}
    if required_votes:
        out["required"] = sorted(required_votes)
    return out


def _merge_types(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    if a == b:
        return a
    ta, tb = a.get("type"), b.get("type")
    if ta == "object" and tb == "object":
        return _merge_object_schemas([a, b])
    if ta == "array" and tb == "array":
        return {"type": "array", "items": _merge_types(a.get("items") or {}, b.get("items") or {})}
    if ta == tb:
        return a
    # Divergent → oneOf
    variants = []
    for s in (a, b):
        if "oneOf" in s:
            variants.extend(s["oneOf"])
        else:
            variants.append(s)
    # dedupe by type key
    seen: set[str] = set()
    uniq = []
    for v in variants:
        key = str(v.get("type"))
        if key in seen:
            continue
        seen.add(key)
        uniq.append(v)
    return {"oneOf": uniq} if len(uniq) > 1 else uniq[0]


def infer_schema(value: Any) -> dict[str, Any]:
    if value is None:
        return {"type": "null"}
    if isinstance(value, bool):
        return {"type": "boolean"}
    if isinstance(value, int) and not isinstance(value, bool):
        return {"type": "integer"}
    if isinstance(value, float):
        return {"type": "number"}
    if isinstance(value, str):
        return {"type": "string"}
    if isinstance(value, list):
        if not value:
            return {"type": "array", "items": {}}
        item_schemas = [infer_schema(x) for x in value[:50]]
        merged = item_schemas[0]
        for s in item_schemas[1:]:
            merged = _merge_types(merged, s)
        return {"type": "array", "items": merged}
    if isinstance(value, dict):
        props = {str(k): infer_schema(v) for k, v in value.items()}
        return {"type": "object", "properties": props, "required": sorted(props)}
    return {}


def schema_paths(schema: dict[str, Any], prefix: str = "$") -> list[dict[str, Any]]:
    """Flatten schema into explorer nodes: path, type, (no sample)."""
    nodes: list[dict[str, Any]] = []

    def walk(s: dict[str, Any], path: str) -> None:
        if "oneOf" in s:
            nodes.append({"path": path, "type": "oneOf", "children": True})
            for i, branch in enumerate(s["oneOf"]):
                walk(branch, f"{path}#oneOf/{i}")
            return
        t = s.get("type")
        if t == "object":
            nodes.append({"path": path, "type": "object", "children": True})
            for k, child in (s.get("properties") or {}).items():
                walk(child, f"{path}.{k}" if path != "$" else f"$.{k}")
        elif t == "array":
            nodes.append({"path": path, "type": "array", "children": True})
            items = s.get("items") or {}
            star = f"{path}[*]" if path != "$" else "$[*]"
            first = f"{path}[0]" if path != "$" else "$[0]"
            walk(items if isinstance(items, dict) else {}, star)
            # virtual item alias for UI — [*] (all) and [0] (first, for scalar binds)
            item_type = items.get("type", "unknown") if isinstance(items, dict) else "unknown"
            has_kids = isinstance(items, dict) and items.get("type") in ("object", "array")
            nodes.append({"path": star, "type": item_type, "children": has_kids, "isArrayItem": True})
            nodes.append({"path": first, "type": item_type, "children": has_kids, "isArrayItem": True})
            if isinstance(items, dict) and items.get("type") == "object":
                for k, child in (items.get("properties") or {}).items():
                    walk(child, f"{star}.{k}")
                    walk(child, f"{first}.{k}")
        else:
            nodes.append({"path": path, "type": t or "unknown", "children": False})

    walk(schema, prefix)
    # de-dupe by path keeping first
    seen: set[str] = set()
    out = []
    for n in nodes:
        if n["path"] in seen:
            continue
        seen.add(n["path"])
        out.append(n)
    return out
