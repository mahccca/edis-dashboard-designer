import json

from app.core.config import PLATFORM_ROOT
from app.modules.design.document_engine import _check_component, _check_prop, canonical, content_hash

KPI = json.loads((PLATFORM_ROOT / "contracts/examples/valid/component-definition.kpi-card.json").read_text(encoding="utf-8"))
COLUMN = {"id": "col", "type": "column"}


def node(**props: object) -> dict:
    return {"id": "kpi", "type": "component", "component": {}, "props": {"title": "AC", **props},
            "bindings": {"value": {"bindingId": "01929f3a-5000-7000-8000-000000000001"}}}


def codes(errors: list[dict]) -> set[str]:
    return {e["code"] for e in errors}


def test_valid_kpi_instance() -> None:
    assert _check_component(node(decimals=1, warnBelow=200, critBelow=50), "/n", COLUMN, KPI, "dashboard") == []


def test_props_checked_against_property_spec() -> None:
    errs = _check_component(node(decimals=9, size="xl", bogus=1), "/n", COLUMN, KPI, "page")
    assert codes(errs) == {"invalid_prop", "unknown_prop"}
    assert {e["pointer"] for e in errs} == {"/n/props/decimals", "/n/props/size", "/n/props/bogus"}


def test_validation_rules_evaluated_with_safe_engine() -> None:
    errs = _check_component(node(warnBelow=10, critBelow=50), "/n", COLUMN, KPI, "page")
    assert codes(errs) == {"rule_thresholds_ordered"}


def test_layout_constraints_and_bindings() -> None:
    n = node()
    n["bindings"] = {"title": {"bindingId": "01929f3a-5000-7000-8000-000000000001"}}
    draft = _check_component(n, "/n", {"id": "s", "type": "section"}, KPI, "template_part")
    assert codes(draft) == {"document_type_not_allowed", "parent_not_allowed", "not_bindable"}
    published = _check_component(n, "/n", {"id": "s", "type": "section"}, KPI, "template_part", for_publish=True)
    assert codes(published) == {"document_type_not_allowed", "parent_not_allowed", "not_bindable", "required"}


def test_localized_text_accepted_for_string_props() -> None:
    assert _check_prop({"type": "string", "maxLength": 5}, {"fa": "توان", "en": "AC"}) is None
    assert _check_prop({"type": "string", "maxLength": 5}, {"en": "far too long"}) is not None
    assert _check_prop({"type": "token"}, "url(javascript:alert(1))") is not None


def test_canonical_hash_is_key_order_independent() -> None:
    assert canonical({"b": 1, "a": [1, {"d": 2, "c": 3}]}) == canonical({"a": [1, {"c": 3, "d": 2}], "b": 1})
    assert content_hash({"x": 1}) == content_hash({"x": 1}) != content_hash({"x": 2})
