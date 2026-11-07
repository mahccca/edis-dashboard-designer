"""Deterministic simulated source for development and tests.

Every value it produces is TEST DATA: the adapter declares is_test_data=True and data_origin="simulated",
and the API/runtime propagate that label to every surface. Values are a pure function of
(signal config, timestamp) so tests can recompute them exactly.
"""

import math
import re
import zlib
from datetime import UTC, datetime, timedelta
from typing import Any

from app.modules.data_sources.adapters.base import Reading
from app.modules.industrial_objects.units import UNITS

SIGNAL = re.compile(r"^[A-Za-z0-9_./:-]{1,255}$")
KINDS = {"power", "energy_today"}


def _local_hour(ts: datetime, offset_minutes: int) -> float:
    local = ts + timedelta(minutes=offset_minutes)
    return local.hour + local.minute / 60 + local.second / 3600


def sample(signal: dict[str, Any], ts: datetime, offset_minutes: int) -> float:
    """Clear-sky-like PV profile between 06:00 and 18:00 local time with a small deterministic ripple."""
    h = _local_hour(ts, offset_minutes)
    peak = float(signal["peak"])
    if signal["kind"] == "energy_today":
        hc = min(max(h, 6.0), 18.0)
        return round(peak * 12 / math.pi * (1 - math.cos(math.pi * (hc - 6) / 12)), 1)
    sun = math.sin(math.pi * (h - 6) / 12) if 6 <= h <= 18 else 0.0
    phase = (zlib.crc32(signal["path"].encode()) % 1000) / 1000 * 2 * math.pi
    ripple = 1 + 0.05 * math.sin(2 * math.pi * ts.timestamp() / 300 + phase)
    return round(max(0.0, peak * sun * ripple), 1)


class SimulatedAdapter:
    kind = "simulated"
    is_test_data = True
    data_origin = "simulated"

    def validate_config(self, config: dict[str, Any]) -> list[dict[str, str]]:
        errors: list[dict[str, str]] = []
        for key in sorted(set(config) - {"utcOffsetMinutes", "signals", "offline"}):
            errors.append({"pointer": f"/config/{key}", "code": "additional_properties", "message": "not allowed"})
        if not isinstance(config.get("offline", False), bool):
            errors.append({"pointer": "/config/offline", "code": "type", "message": "boolean expected"})
        if not isinstance(config.get("utcOffsetMinutes", 0), int):
            errors.append({"pointer": "/config/utcOffsetMinutes", "code": "type", "message": "integer expected"})
        signals = config.get("signals")
        if not isinstance(signals, list) or not signals:
            return errors + [{"pointer": "/config/signals", "code": "required", "message": "non-empty list required"}]
        seen = set()
        for i, s in enumerate(signals):
            p = f"/config/signals/{i}"
            if not isinstance(s, dict) or set(s) - {"path", "unit", "kind", "peak"}:
                errors.append({"pointer": p, "code": "shape", "message": "fields: path, unit, kind, peak"})
                continue
            if not SIGNAL.match(str(s.get("path", ""))) or s["path"] in seen:
                errors.append({"pointer": p + "/path", "code": "pattern", "message": "invalid or duplicate signal path"})
            seen.add(s.get("path"))
            if s.get("unit") not in UNITS:
                errors.append({"pointer": p + "/unit", "code": "unknown_unit", "message": f"unknown unit {s.get('unit')!r}"})
            if s.get("kind") not in KINDS:
                errors.append({"pointer": p + "/kind", "code": "enum", "message": f"one of {sorted(KINDS)}"})
            if not isinstance(s.get("peak"), (int, float)) or s["peak"] <= 0:
                errors.append({"pointer": p + "/peak", "code": "minimum", "message": "positive number required"})
        return errors

    def test(self, config: dict[str, Any]) -> dict[str, Any]:
        if config.get("offline"):
            return {"ok": False, "latencyMs": None, "authenticated": False,
                    "message": "Simulated source is switched offline (outage simulation). TEST DATA only."}
        return {"ok": True, "latencyMs": 0, "authenticated": False,
                "message": "Simulated source: TEST DATA only, not connected to any real SCADA."}

    def search_signals(self, config: dict[str, Any], q: str | None, limit: int) -> list[dict[str, Any]]:
        now = datetime.now(UTC).replace(microsecond=0)
        offset = config.get("utcOffsetMinutes", 0)
        out = []
        for s in config["signals"]:
            if q and q.lower() not in s["path"].lower():
                continue
            out.append({"path": s["path"], "unit": s["unit"], "lastValue": sample(s, now, offset),
                        "lastSeen": now.isoformat(), "isTestData": True})
        return out[:limit]

    def read_latest(self, config: dict[str, Any], signals: list[str], now: datetime | None = None) -> dict[str, Reading | None]:
        if config.get("offline"):
            return dict.fromkeys(signals)
        ts = (now or datetime.now(UTC)).replace(microsecond=0)
        by_path = {s["path"]: s for s in config["signals"]}
        offset = config.get("utcOffsetMinutes", 0)
        return {
            path: Reading(sample(by_path[path], ts, offset), by_path[path]["unit"], ts) if path in by_path else None
            for path in signals
        }
