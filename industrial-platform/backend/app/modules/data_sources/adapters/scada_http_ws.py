"""Real SCADA adapter — NOT IMPLEMENTED (follow-up, blocked on contract confirmation D-05 / T-110).

Expected behaviour (inferred from the legacy darkhoveyn-scada app, unconfirmed):
  * POST {baseUrl}/api/v1/auth/login -> bearer token (service account, credentials encrypted server-side)
  * REST {baseUrl}/api/v1/public/signals/search?query=&limit=
  * WS {baseUrl} with {"type":"subscribe","subscriptionId","signals":[...],"immediate":true}
    -> "subscription.snapshot" {data:{path:value}} and per-signal messages carrying "path".
Creation of this kind is rejected unless IP_FEATURE_SCADA_ADAPTER=true, and even then every call fails
with 501 so the platform can never claim a real-data connection it does not have.
"""

from datetime import datetime
from typing import Any

from app.core.errors import ApiError
from app.modules.data_sources.adapters.base import Reading


def _unavailable() -> ApiError:
    return ApiError(501, "adapter_not_implemented", "The SCADA adapter is not implemented yet",
                    "Use a 'simulated' data source (test data) until the SCADA contract is confirmed.")


class ScadaHttpWsAdapter:
    kind = "scada_http_ws"
    is_test_data = False
    data_origin = "live"

    def validate_config(self, config: dict[str, Any]) -> list[dict[str, str]]:
        return []

    def test(self, config: dict[str, Any]) -> dict[str, Any]:
        raise _unavailable()

    def search_signals(self, config: dict[str, Any], q: str | None, limit: int) -> list[dict[str, Any]]:
        raise _unavailable()

    def read_latest(self, config: dict[str, Any], signals: list[str], now: datetime | None = None) -> dict[str, Reading | None]:
        raise _unavailable()
