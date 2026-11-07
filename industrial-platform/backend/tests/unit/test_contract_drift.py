"""ADR-0003 drift test: every route FastAPI serves must exist in contracts/openapi/openapi.yaml (VS-1 implements a subset)."""

import re

import yaml

from app.core.config import PLATFORM_ROOT

METHODS = {"get", "post", "put", "patch", "delete"}


def _normalise(path: str) -> str:
    return re.sub(r"\{[^}]+\}", "{}", path)


def _ops(paths: dict, prefix: str = "") -> set[tuple[str, str]]:
    return {(m.upper(), _normalise(prefix + p)) for p, item in paths.items() for m in item if m in METHODS}


def test_implemented_routes_are_in_contract(monkeypatch):
    monkeypatch.setenv("IP_DATABASE_URL", "postgresql+psycopg://unused:unused@127.0.0.1:1/unused")
    from app.main import create_app

    contract = yaml.safe_load((PLATFORM_ROOT / "contracts" / "openapi" / "openapi.yaml").read_text(encoding="utf-8"))
    base = contract.get("servers", [{}])[0].get("url", "")
    prefix = base if base.startswith("/") else re.sub(r"^https?://[^/]+", "", base)
    declared = _ops(contract["paths"], prefix)
    served = _ops(create_app().openapi()["paths"])
    assert served, "app exposes no routes"
    assert sorted(served - declared) == []
