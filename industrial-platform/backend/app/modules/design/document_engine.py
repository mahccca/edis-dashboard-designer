"""Server-side document validation: JSON Schema (contracts) + semantic rules that need the database."""

import hashlib
import json
import uuid
from dataclasses import dataclass, field
from typing import Any, Iterator

from app.core.config import get_settings
from app.core.contracts import schema_errors
from sqlalchemy.orm import Session

from app.core.errors import ApiError, unprocessable
from app.modules.components.models import ComponentVersion
from app.modules.components.service import find_version
from app.modules.data_bindings.service import existing_ids
from app.modules.modeling.expression import FormulaError, evaluate, parse_formula, refs

LITERAL_BINDABLE = {"heading": {"text"}, "text": {"text"}, "image": {"mediaId"}}


@dataclass
class Result:
    component_versions: dict[uuid.UUID, ComponentVersion] = field(default_factory=dict)
    binding_ids: set[uuid.UUID] = field(default_factory=set)


def canonical(data: Any) -> bytes:
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def content_hash(data: Any) -> bytes:
    return hashlib.sha256(canonical(data)).digest()


def _walk(node: dict, pointer: str, parent: dict | None) -> Iterator[tuple[dict, str, dict | None]]:
    yield node, pointer, parent
    for i, child in enumerate(node.get("children", [])):
        yield from _walk(child, f"{pointer}/children/{i}", node)


def _localized(value: Any) -> bool:
    return isinstance(value, dict) and bool(value) and all(isinstance(k, str) and isinstance(v, str) for k, v in value.items())


def _check_prop(spec: dict, value: Any) -> str | None:
    t = spec["type"]
    if t in ("string", "text"):
        text = value if isinstance(value, str) else None
        if text is None and _localized(value):
            text = max(value.values(), key=len)
        if text is None:
            return "string or localized text expected"
        if "maxLength" in spec and len(text) > spec["maxLength"]:
            return f"longer than {spec['maxLength']}"
        return None
    if t in ("number", "integer"):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or (t == "integer" and not float(value).is_integer()):
            return f"{t} expected"
        if "minimum" in spec and value < spec["minimum"]:
            return f"must be >= {spec['minimum']}"
        if "maximum" in spec and value > spec["maximum"]:
            return f"must be <= {spec['maximum']}"
        return None
    if t == "boolean":
        return None if isinstance(value, bool) else "boolean expected"
    if t == "enum":
        return None if value in spec["enum"] else f"one of {spec['enum']}"
    if t in ("token", "color", "unit", "icon"):
        return None if isinstance(value, str) and len(value) <= 120 and "<" not in value and "(" not in value else "invalid value"
    if t in ("media", "objectRef"):
        try:
            uuid.UUID(str(value))
            return None
        except ValueError:
            return "uuid expected"
    return "unsupported property type"


def _check_component(node: dict, pointer: str, parent: dict | None, spec: dict, document_type: str,
                     *, for_publish: bool = False) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []
    lc = spec.get("layoutConstraints", {})
    if lc.get("allowedDocumentTypes") and document_type not in lc["allowedDocumentTypes"]:
        errors.append({"pointer": pointer, "code": "document_type_not_allowed",
                       "message": f"{spec['key']} cannot be used in a {document_type}"})
    if lc.get("allowedParents") and parent is not None and parent["type"] not in lc["allowedParents"]:
        errors.append({"pointer": pointer, "code": "parent_not_allowed",
                       "message": f"{spec['key']} must be inside one of {lc['allowedParents']}"})
    props_spec = {p["key"]: p for p in spec["properties"]}
    props = node.get("props", {})
    for key, value in props.items():
        p = props_spec.get(key)
        if p is None:
            errors.append({"pointer": f"{pointer}/props/{key}", "code": "unknown_prop", "message": f"{spec['key']} has no property {key!r}"})
        elif (msg := _check_prop(p, value)) is not None:
            errors.append({"pointer": f"{pointer}/props/{key}", "code": "invalid_prop", "message": msg})
    merged = {**spec.get("defaults", {}), **props}
    bindable = {i["key"] for i in spec.get("inputs", [])} | {p["key"] for p in spec["properties"] if p.get("bindable")}
    for p in spec["properties"]:
        if p.get("required") and p["key"] not in merged and p["key"] not in node.get("bindings", {}):
            errors.append({"pointer": f"{pointer}/props/{p['key']}", "code": "required", "message": f"{p['key']} is required"})
    # Required data bindings are enforced only at publish so drafts can be saved while wiring data.
    if for_publish:
        for i in spec.get("inputs", []):
            if i.get("required") and i["key"] not in node.get("bindings", {}):
                errors.append({
                    "pointer": f"{pointer}/bindings/{i['key']}",
                    "code": "required",
                    "message": f"input {i['key']!r} needs a binding",
                })
    for key in node.get("bindings", {}):
        if key not in bindable:
            errors.append({"pointer": f"{pointer}/bindings/{key}", "code": "not_bindable", "message": f"{key!r} is not an input or bindable property"})
    if errors:
        return errors
    numeric = {k: v for k, v in merged.items() if isinstance(v, (int, float)) and not isinstance(v, bool)}
    for rule in spec.get("validationRules", []):
        try:
            ast = parse_formula(rule["assert"])
            if not set(refs(ast)) <= numeric.keys():
                continue
            ok = evaluate(ast, numeric, 1000)
        except (FormulaError, ArithmeticError):
            ok = False
        if not ok and rule.get("severity", "error") == "error":
            errors.append({"pointer": f"{pointer}/props", "code": f"rule_{rule['id']}",
                           "message": rule["message"].get("en") or next(iter(rule["message"].values()))})
    return errors


def validate(db: Session, project_id: uuid.UUID, document_type: str, content: Any, *, for_publish: bool = False,
             base: str = "/content") -> Result:
    if len(canonical(content)) > get_settings().max_document_bytes:
        raise ApiError(413, "payload_too_large", "Document exceeds the maximum size")
    errors = schema_errors("document.schema.json", content, base)
    if errors:
        raise unprocessable(errors)
    if content["documentType"] != document_type:
        raise unprocessable([{"pointer": f"{base}/documentType", "code": "document_type_mismatch",
                              "message": f"expected {document_type!r}"}])
    result = Result()
    seen: dict[str, str] = {}
    binding_refs: dict[uuid.UUID, list[str]] = {}
    for node, pointer, parent in _walk(content["root"], f"{base}/root", None):
        if node["id"] in seen:
            errors.append({"pointer": f"{pointer}/id", "code": "duplicate_node_id", "message": f"{node['id']!r} also used at {seen[node['id']]}"})
        seen.setdefault(node["id"], pointer)
        if node["type"] == "slot" and document_type != "template":
            errors.append({"pointer": pointer, "code": "slot_outside_template", "message": "slot nodes are only allowed in templates"})
        for key, ref in node.get("bindings", {}).items():
            binding_refs.setdefault(uuid.UUID(ref["bindingId"]), []).append(f"{pointer}/bindings/{key}/bindingId")
        if node["type"] in LITERAL_BINDABLE:
            for key in node.get("bindings", {}):
                if key not in LITERAL_BINDABLE[node["type"]]:
                    errors.append({"pointer": f"{pointer}/bindings/{key}", "code": "not_bindable", "message": f"{key!r} is not bindable on {node['type']}"})
        if node["type"] != "component":
            continue
        ref = node["component"]
        version = find_version(db, project_id, uuid.UUID(ref["definitionId"]), ref["version"])
        if version is None:
            errors.append({"pointer": f"{pointer}/component", "code": "component_not_found",
                           "message": f"{ref.get('definitionKey', ref['definitionId'])}@{ref['version']} does not exist"})
            continue
        if version.status == "withdrawn" or (for_publish and version.status != "published"):
            errors.append({"pointer": f"{pointer}/component", "code": "component_not_published",
                           "message": f"{version.spec['key']}@{version.version} is {version.status}"})
            continue
        errors += _check_component(node, pointer, parent, version.spec, document_type, for_publish=for_publish)
        result.component_versions[version.id] = version
    found = existing_ids(db, project_id, set(binding_refs))
    for binding_id, pointers in binding_refs.items():
        if binding_id not in found:
            errors += [{"pointer": p, "code": "binding_not_found", "message": "binding does not exist in this project"} for p in pointers]
    if errors:
        raise unprocessable(errors, "Document is not valid")
    result.binding_ids = set(found)
    return result
