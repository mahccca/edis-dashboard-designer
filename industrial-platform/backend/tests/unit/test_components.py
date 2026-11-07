"""Component definition validation + renderer whitelist (ADR-0007)."""

from __future__ import annotations

import json
import uuid
from pathlib import Path

import pytest

from app.core.errors import ApiError
from app.modules.components import service

BUILTIN = Path(__file__).resolve().parents[2] / "app" / "modules" / "components" / "builtin"


def _base_body(**overrides: object) -> dict:
    body = {
        "key": "demo.my-gauge",
        "category": "gauge",
        "name": {"fa": "گیج من", "en": "My gauge"},
        "rendererId": "builtin.gauge@1",
        "properties": [
            {"key": "title", "label": {"en": "Title"}, "type": "string"},
            {"key": "min", "label": {"en": "Min"}, "type": "number"},
            {"key": "max", "label": {"en": "Max"}, "type": "number"},
        ],
        "defaults": {"title": "G", "min": 0, "max": 100},
        "inputs": [{"key": "value", "dataType": "number", "required": True}],
        "bindings": [
            {"input": "value", "allowedSources": ["data_source_signal", "static"]},
        ],
    }
    body.update(overrides)
    return body


def test_renderers_whitelist_includes_gauge_image_and_chart() -> None:
    ids = {r["rendererId"] for r in service.RENDERERS}
    assert ids == {
        "builtin.kpi-card@1",
        "builtin.gauge@1",
        "builtin.image@1",
        "builtin.chart@1",
        "builtin.map@1",
    }


def test_prepare_spec_accepts_gauge_and_fills_server_fields() -> None:
    definition_id = uuid.UUID("01929f3a-1000-7000-8000-00000000abcd")
    spec = service.prepare_spec(_base_body(), definition_id=definition_id, version="0.1.0", status="draft")
    assert spec["id"] == str(definition_id)
    assert spec["schemaVersion"] == 1
    assert spec["version"] == "0.1.0"
    assert spec["status"] == "draft"
    assert spec["rendererId"] == "builtin.gauge@1"


def test_prepare_spec_rejects_unknown_renderer() -> None:
    with pytest.raises(ApiError) as exc:
        service.prepare_spec(
            _base_body(rendererId="builtin.evil@1"),
            definition_id=uuid.uuid4(),
            version="0.1.0",
            status="draft",
        )
    assert exc.value.status == 422
    assert any(e.get("code") == "unknown_renderer" for e in (exc.value.errors or []))


def test_builtin_seed_files_validate() -> None:
    for name in (
        "kpi-card@1.2.0.json", "gauge@1.0.0.json", "gauge@1.1.0.json",
        "image@1.0.0.json", "chart@1.0.0.json", "map@1.0.0.json", "map@1.1.0.json",
    ):
        spec = json.loads((BUILTIN / name).read_text(encoding="utf-8"))
        assert spec["rendererId"] in service.RENDERER_IDS
        service.prepare_spec(
            {k: v for k, v in spec.items() if k not in {"id", "schemaVersion", "version", "status"}},
            definition_id=uuid.UUID(spec["id"]),
            version=spec["version"],
            status=spec["status"],
        )
