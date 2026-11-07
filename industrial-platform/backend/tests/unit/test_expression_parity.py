"""The backend expression engine must behave exactly like the contract reference (contracts/tools/semantic.py)."""

import importlib.util
import json
import sys

import pytest

from app.core.config import PLATFORM_ROOT
from app.modules.modeling import expression as backend

_spec = importlib.util.spec_from_file_location("contract_semantic", PLATFORM_ROOT / "contracts" / "tools" / "semantic.py")
assert _spec and _spec.loader
reference = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = reference
_spec.loader.exec_module(reference)

EXAMPLES = PLATFORM_ROOT / "contracts" / "examples"
MANIFEST = json.loads((EXAMPLES / "manifest.json").read_text(encoding="utf-8"))
CASES = [(e["file"], e["schema"]) for e in MANIFEST.get("valid", []) + MANIFEST.get("invalid", [])]


def _outcome(module, schema: str, data: dict) -> object:  # type: ignore[no-untyped-def]
    try:
        return [(i.code, i.path) for i in module.check(schema, data)]
    except Exception as exc:  # schema-invalid examples may not be semantically checkable
        return ("raises", type(exc).__name__)


@pytest.mark.parametrize(("file", "schema"), CASES)
def test_semantic_parity(file: str, schema: str) -> None:
    data = json.loads((EXAMPLES / file).read_text(encoding="utf-8"))
    assert _outcome(backend, schema, data) == _outcome(reference, schema, data)


@pytest.mark.parametrize(("expr", "env", "expected"), [
    ("critBelow <= warnBelow", {"critBelow": 50, "warnBelow": 200}, True),
    ("safe_div(a, b, -1)", {"a": 1, "b": 0}, -1),
    ("round(a * 100, 1)", {"a": 0.81234}, 81.2),
    ("if(a > 1, a, 0) + clamp(b, 0, 10)", {"a": 3, "b": 42}, 13),
])
def test_evaluation_parity(expr: str, env: dict, expected: object) -> None:
    assert backend.evaluate(backend.parse_formula(expr), env) == reference.evaluate(reference.parse_formula(expr), env) == expected


@pytest.mark.parametrize("expr", ["__import__('os')", "a.b", "a[0]", "lambda: 1", "exec(1)", "a ; b"])
def test_rejects_non_grammar(expr: str) -> None:
    with pytest.raises(backend.FormulaError):
        backend.parse_formula(expr)
