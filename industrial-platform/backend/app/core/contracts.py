"""Server-side enforcement of contracts/schemas (single source of truth with the frontend)."""

import json
from functools import lru_cache
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import best_match
from referencing import Registry, Resource

from app.core.config import get_settings
from app.core.errors import unprocessable


@lru_cache
def _schemas() -> tuple[dict[str, dict], Registry]:
    folder = get_settings().contracts_dir / "schemas"
    docs = {p.name: json.loads(p.read_text(encoding="utf-8")) for p in folder.glob("*.schema.json")}
    if not docs:
        raise RuntimeError(f"no contract schemas found in {folder}")
    registry = Registry().with_resources((d["$id"], Resource.from_contents(d)) for d in docs.values())
    return docs, registry


@lru_cache
def _validator(name: str) -> Draft202012Validator:
    docs, registry = _schemas()
    return Draft202012Validator(docs[name], registry=registry)


def _pointer(base: str, path: Any) -> str:
    return base + "".join("/" + str(p).replace("~", "~0").replace("/", "~1") for p in path)


def schema_errors(schema: str, instance: Any, base: str = "") -> list[dict[str, str]]:
    out = []
    for err in _validator(schema).iter_errors(instance):
        leaf = best_match([err])
        out.append({
            "pointer": _pointer(base, leaf.absolute_path),
            "code": f"schema_{leaf.validator}",
            "message": leaf.message[:300],
        })
    return sorted(out, key=lambda e: e["pointer"])


def require_valid(schema: str, instance: Any, base: str = "") -> None:
    errors = schema_errors(schema, instance, base)
    if errors:
        raise unprocessable(errors)
