from datetime import UTC, datetime

import pytest

from app.core.config import get_settings
from app.core.errors import ApiError
from app.modules.data_sources.adapters import adapter_for, creatable_kinds
from app.modules.data_sources.adapters.simulated import SimulatedAdapter, sample

CONFIG = {"utcOffsetMinutes": 210, "signals": [
    {"path": "darkhoveyn/total/AC_POWER", "unit": "W", "kind": "power", "peak": 400000},
    {"path": "darkhoveyn/total/ENERGY_TODAY", "unit": "Wh", "kind": "energy_today", "peak": 400000},
]}
NOON_LOCAL = datetime(2026, 6, 21, 8, 30, tzinfo=UTC)      # 12:00 at UTC+03:30
NIGHT_LOCAL = datetime(2026, 6, 21, 20, 30, tzinfo=UTC)    # 00:00 local


def test_simulated_is_labelled_test_data() -> None:
    a = adapter_for("simulated")
    assert a.is_test_data is True and a.data_origin == "simulated"
    assert "TEST DATA" in a.test(CONFIG)["message"]
    assert all(s["isTestData"] for s in a.search_signals(CONFIG, None, 10))


def test_simulated_is_deterministic_and_follows_the_sun() -> None:
    a = SimulatedAdapter()
    first = a.read_latest(CONFIG, ["darkhoveyn/total/AC_POWER"], NOON_LOCAL)["darkhoveyn/total/AC_POWER"]
    again = a.read_latest(CONFIG, ["darkhoveyn/total/AC_POWER"], NOON_LOCAL)["darkhoveyn/total/AC_POWER"]
    assert first == again and first is not None
    assert 0.95 * 400000 <= first.value <= 1.05 * 400000
    assert first.value == sample(CONFIG["signals"][0], NOON_LOCAL, 210)
    night = a.read_latest(CONFIG, ["darkhoveyn/total/AC_POWER"], NIGHT_LOCAL)["darkhoveyn/total/AC_POWER"]
    assert night is not None and night.value == 0.0
    energy = a.read_latest(CONFIG, ["darkhoveyn/total/ENERGY_TODAY"], NOON_LOCAL)["darkhoveyn/total/ENERGY_TODAY"]
    assert energy is not None and energy.value == pytest.approx(400000 * 12 / 3.141592653589793, rel=1e-6)


def test_simulated_unknown_signal_and_offline_give_no_value() -> None:
    a = SimulatedAdapter()
    assert a.read_latest(CONFIG, ["nope"], NOON_LOCAL) == {"nope": None}
    offline = {**CONFIG, "offline": True}
    assert a.read_latest(offline, ["darkhoveyn/total/AC_POWER"], NOON_LOCAL) == {"darkhoveyn/total/AC_POWER": None}
    assert a.test(offline)["ok"] is False


def test_simulated_config_validation() -> None:
    a = SimulatedAdapter()
    assert a.validate_config(CONFIG) == []
    bad = {"signals": [{"path": "a b", "unit": "parsec", "kind": "x", "peak": -1}], "baseUrl": "http://10.8.0.8:4000"}
    codes = {e["code"] for e in a.validate_config(bad)}
    assert {"pattern", "unknown_unit", "enum", "minimum", "additional_properties"} <= codes


def test_scada_adapter_is_not_creatable_and_never_returns_data() -> None:
    assert get_settings().feature_scada_adapter is False
    assert creatable_kinds() == {"simulated", "http_json"}
    scada = adapter_for("scada_http_ws")
    assert scada.is_test_data is False
    for call in (lambda: scada.test({}), lambda: scada.read_latest({}, ["x"]), lambda: scada.search_signals({}, None, 1)):
        with pytest.raises(ApiError) as exc:
            call()
        assert exc.value.status == 501 and exc.value.code == "adapter_not_implemented"


def test_http_json_config_and_extract(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.modules.data_sources.adapters.http_json import HttpJsonAdapter, redact_config

    cfg = {
        "baseUrl": "https://api.example.com/v1",
        "headers": {"Authorization": "Bearer secret", "X-Trace": "1"},
        "timeoutMs": 3000,
        "queries": [{
            "key": "plant/ac_power", "name": "توان AC", "method": "GET",
            "urlPath": "/metrics/power", "jsonPath": "$.data.acPower", "unit": "kW", "resultMode": "scalar",
        }],
    }
    a = HttpJsonAdapter()
    assert a.validate_config(cfg) == []
    assert a.is_test_data is False and a.data_origin == "live"
    redacted = redact_config(cfg)
    assert redacted["headers"]["Authorization"] == "***" and redacted["headers"]["X-Trace"] == "1"

    class _Resp:
        def read(self, _n: int = -1) -> bytes:
            return b'{"data":{"acPower":12.5},"items":[{"id":"a"},{"id":"b"}]}'

        def __enter__(self) -> "_Resp":
            return self

        def __exit__(self, *args: object) -> None:
            return None

    monkeypatch.setattr("urllib.request.urlopen", lambda *args, **kwargs: _Resp())
    reading = a.read_latest(cfg, ["plant/ac_power"], NOON_LOCAL)["plant/ac_power"]
    assert reading is not None and reading.value == 12.5 and reading.unit == "kW"
    signals = a.search_signals(cfg, "توان", 10)
    assert signals[0]["path"] == "plant/ac_power" and signals[0]["lastValue"] == 12.5
    assert a.test(cfg)["ok"] is True

    json_cfg = {
        "baseUrl": "https://api.example.com",
        "queries": [{
            "key": "watchlists/all", "name": "all", "method": "GET",
            "urlPath": "/watchlists", "resultMode": "json", "jsonPath": "$", "unit": "",
        }],
    }
    assert a.validate_config(json_cfg) == []
    whole = a.read_latest(json_cfg, ["watchlists/all"], NOON_LOCAL)["watchlists/all"]
    assert whole is not None and isinstance(whole.value, dict) and whole.value["items"][0]["id"] == "a"


def test_jsonpath_and_schema_infer() -> None:
    from app.modules.data_sources.jsonpath import resolve_path
    from app.modules.data_sources.schema_infer import infer_schema, schema_paths

    data = {
        "name": "Solar",
        "specifications": {"power": 550, "dimensions": {"width": 100}},
        "sensors": [{"name": "Temperature", "value": 32}, {"name": "Voltage", "value": 48}],
    }
    assert resolve_path(data, "$.specifications.power") == 550
    assert resolve_path(data, "$.sensors[*].name") == ["Temperature", "Voltage"]
    nested = [
        {"signals": ["INV-01/AC_POWER", "INV-01/DAILY_ENERGY"]},
        {"signals": ["INV-02/AC_POWER"]},
    ]
    assert resolve_path(nested, "$[*].signals[*]") == [
        "INV-01/AC_POWER", "INV-01/DAILY_ENERGY", "INV-02/AC_POWER",
    ]
    schema = infer_schema(data)
    assert schema["type"] == "object"
    assert "sensors" in schema["properties"]
    paths = {p["path"] for p in schema_paths(schema)}
    assert "$.specifications.power" in paths
    assert "$.sensors[*].name" in paths


def test_refresh_interval_ms_clamped() -> None:
    from app.modules.data_sources.adapters.http_json import refresh_interval_ms, refresh_ttl_sec

    assert refresh_interval_ms({}) == 5000
    assert refresh_interval_ms({"refreshIntervalMs": 600_000}) == 600_000
    assert refresh_interval_ms({"refreshIntervalMs": 100}) == 1000
    assert refresh_interval_ms({"refreshIntervalMs": 9_999_999}) == 3_600_000
    assert refresh_ttl_sec({"refreshIntervalMs": 10_000}) == 10.0


def test_http_json_options_flatten_unique(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.modules.data_sources.adapters.http_json import HttpJsonAdapter, extract_options_from_value

    payload = [
        {"id": "a", "signals": ["INV-01/AC_POWER", "INV-01/DAILY_ENERGY", "INV-01/AC_POWER"]},
        {"id": "b", "signals": ["INV-02/AC_POWER", "INV-01/AC_POWER"]},
    ]
    from app.modules.data_sources.adapters.http_json import extract_option_groups_from_value

    opts = extract_options_from_value(payload, "signals")
    assert [o["value"] for o in opts] == ["INV-01/AC_POWER", "INV-01/DAILY_ENERGY", "INV-02/AC_POWER"]
    assert opts[0]["label"] == "INV-01/AC_POWER"
    assert extract_options_from_value(["x", "y", "x"], None) == [
        {"value": "x", "label": "x"}, {"value": "y", "label": "y"},
    ]
    groups = extract_option_groups_from_value(payload, "signals")
    assert [g["value"] for g in groups] == ["a", "b"]
    assert [o["value"] for o in groups[0]["options"]] == ["INV-01/AC_POWER", "INV-01/DAILY_ENERGY"]
    assert [o["value"] for o in groups[1]["options"]] == ["INV-02/AC_POWER", "INV-01/AC_POWER"]
    single = extract_option_groups_from_value(
        [{"id": "only", "name": "Only", "signals": ["S1", "S2"]}], "signals",
    )
    assert len(single) == 1 and [o["value"] for o in single[0]["options"]] == ["S1", "S2"]
    sites = [
        {"id": "Darkhoveyn", "nameFa": "دارخوین", "totals": {"totalAcPower": 100.5, "efficiency": 97.7}},
        {"id": "Other", "name": "Other", "totals": {"totalAcPower": 50}},
    ]
    total_groups = extract_option_groups_from_value(sites, "totals")
    assert len(total_groups) == 2
    assert total_groups[0]["label"] == "دارخوین"
    assert total_groups[0]["options"][0]["value"] == "totalAcPower"
    assert total_groups[0]["options"][0]["fieldPath"] == "$[0].totals.totalAcPower"
    assert total_groups[0]["options"][0]["sampleValue"] == 100.5


    cfg = {
        "baseUrl": "https://api.example.com",
        "queries": [{
            "key": "watchlists/signals", "name": "signals", "method": "GET",
            "urlPath": "/watchlists", "resultMode": "options", "jsonPath": "$",
            "itemsPath": "signals", "unit": "",
        }],
    }
    a = HttpJsonAdapter()
    assert a.validate_config(cfg) == []

    class _Resp:
        def read(self, _n: int = -1) -> bytes:
            import json
            return json.dumps(payload).encode()

        def __enter__(self) -> "_Resp":
            return self

        def __exit__(self, *args: object) -> None:
            return None

    monkeypatch.setattr("urllib.request.urlopen", lambda *args, **kwargs: _Resp())
    sets = a.list_option_sets(cfg)
    assert len(sets) == 1 and sets[0]["key"] == "watchlists/signals"
    assert [o["value"] for o in sets[0]["options"]] == [
        "INV-01/AC_POWER", "INV-01/DAILY_ENERGY", "INV-02/AC_POWER",
    ]
    assert len(sets[0]["groups"]) == 2
    assert sets[0]["groups"][0]["value"] == "a"

    reading = a.read_latest(cfg, ["watchlists/signals"], NOON_LOCAL)["watchlists/signals"]
    assert reading is not None and reading.value == sets[0]["options"]
