from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol

# Scalar or structured JSON (list/object) from HTTP adapters.
JsonValue = float | bool | str | dict[str, Any] | list[Any] | None


@dataclass(frozen=True)
class Reading:
    value: JsonValue
    unit: str
    ts: datetime


class Adapter(Protocol):
    """Contract every data-source adapter implements (ADR-0012). Runs server-side only."""

    kind: str
    is_test_data: bool
    data_origin: str  # "simulated" | "live"

    def validate_config(self, config: dict[str, Any]) -> list[dict[str, str]]: ...

    def test(self, config: dict[str, Any]) -> dict[str, Any]: ...

    def search_signals(self, config: dict[str, Any], q: str | None, limit: int) -> list[dict[str, Any]]: ...

    def read_latest(self, config: dict[str, Any], signals: list[str], now: datetime | None = None) -> dict[str, Reading | None]: ...
