import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from tools.semantic import (
    FormulaError,
    StepLimitExceeded,
    check,
    evaluate,
    parse_formula,
    run_model,
)

ROOT = Path(__file__).resolve().parents[1]
SCHEMAS = ROOT / "schemas"
EXAMPLES = ROOT / "examples"
MANIFEST = json.loads((EXAMPLES / "manifest.json").read_text(encoding="utf-8"))
BASE = "https://contracts.industrial-platform.local/schemas/v1/"


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


SCHEMA_DOCS = {p.name: load(p) for p in sorted(SCHEMAS.glob("*.schema.json"))}
REGISTRY = Registry().with_resources(
    (doc["$id"], Resource.from_contents(doc)) for doc in SCHEMA_DOCS.values()
)


def validator(schema_name: str) -> Draft202012Validator:
    return Draft202012Validator(SCHEMA_DOCS[schema_name], registry=REGISTRY)


def leaf_paths(errors) -> set[str]:
    out = set()
    for err in errors:
        out.add(err.json_path)
        out |= leaf_paths(err.context)
    return out


@pytest.mark.parametrize("name", sorted(SCHEMA_DOCS))
def test_schema_is_valid_draft_2020_12(name):
    doc = SCHEMA_DOCS[name]
    Draft202012Validator.check_schema(doc)
    assert doc["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert doc["$id"] == BASE + name


def test_manifest_covers_every_example():
    listed = {e["file"] for e in MANIFEST["valid"] + MANIFEST["invalid"]}
    on_disk = {p.relative_to(EXAMPLES).as_posix() for p in EXAMPLES.glob("*/*.json")}
    assert listed == on_disk


@pytest.mark.parametrize("entry", MANIFEST["valid"], ids=lambda e: e["file"])
def test_valid_example(entry):
    data = load(EXAMPLES / entry["file"])
    errors = sorted(validator(entry["schema"]).iter_errors(data), key=lambda e: e.json_path)
    assert not errors, "\n".join(f"{e.json_path}: {e.message}" for e in errors)
    issues = check(entry["schema"], data)
    assert not issues, issues


@pytest.mark.parametrize("entry", MANIFEST["invalid"], ids=lambda e: e["file"])
def test_invalid_example_fails_for_the_intended_reason(entry):
    data = load(EXAMPLES / entry["file"])
    errors = list(validator(entry["schema"]).iter_errors(data))
    expect = entry["expect"]
    if "schemaErrorAt" in expect:
        assert errors, "expected schema validation to fail"
        assert expect["schemaErrorAt"] in leaf_paths(errors), sorted(leaf_paths(errors))
    else:
        assert not errors, "semantic example must be schema-valid so the semantic layer is what rejects it"
        codes = {i.code for i in check(entry["schema"], data)}
        assert expect["semanticError"] in codes, codes


def _formulas(model: dict):
    for section in ("variables", "outputs"):
        for item in model.get(section, []):
            yield item["formula"]["expression"]
    for rule in model.get("validation", []):
        yield rule["assert"]


def test_compiled_asts_conform_to_expression_schema():
    model = load(EXAMPLES / "valid/model.pv-performance-ratio.json")
    v = validator("expression.schema.json")
    for src in _formulas(model):
        ast = parse_formula(src)
        errors = list(v.iter_errors(ast))
        assert not errors, (src, [e.message for e in errors])


def test_performance_ratio_reference_run():
    model = load(EXAMPLES / "valid/model.pv-performance-ratio.json")
    out = run_model(model, {"energy_ac": 7200, "irradiation_poa": 6.0, "energy_dc": 7400})
    # Yr = 6 h, Yf = 7200/1500 = 4.8 h -> PR = 80 %
    assert out["performance_ratio"] == pytest.approx(80.0)
    assert out["inverter_efficiency"] == pytest.approx(97.3, abs=0.01)


def test_model_validation_rule_blocks_misleading_output():
    model = load(EXAMPLES / "valid/model.pv-performance-ratio.json")
    with pytest.raises(ValueError, match="irradiation_positive"):
        run_model(model, {"energy_ac": 7200, "irradiation_poa": 0, "energy_dc": 0})


@pytest.mark.parametrize(
    "src",
    ["x = 1", "a.b", "x[0]", "'s'", "1;2", "_secret", "open(x)", "x ? 1", "1 < 2 < 3", "min(x)"],
)
def test_parser_rejects_non_grammar_input(src):
    with pytest.raises(FormulaError):
        parse_formula(src)


def test_evaluation_is_step_bounded():
    ast = parse_formula(" + ".join(["x"] * 200))
    with pytest.raises(StepLimitExceeded):
        evaluate(ast, {"x": 1}, max_steps=50)
    assert evaluate(ast, {"x": 1}) == 200
