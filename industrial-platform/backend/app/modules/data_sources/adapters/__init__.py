from app.core.config import get_settings
from app.core.errors import ApiError
from app.modules.data_sources.adapters.base import Adapter, Reading
from app.modules.data_sources.adapters.http_json import HttpJsonAdapter
from app.modules.data_sources.adapters.scada_http_ws import ScadaHttpWsAdapter
from app.modules.data_sources.adapters.simulated import SimulatedAdapter

_ADAPTERS: dict[str, Adapter] = {
    "simulated": SimulatedAdapter(),
    "http_json": HttpJsonAdapter(),
    "scada_http_ws": ScadaHttpWsAdapter(),
}

__all__ = ["Adapter", "Reading", "adapter_for", "creatable_kinds"]


def creatable_kinds() -> set[str]:
    kinds = {"simulated", "http_json"}
    if get_settings().feature_scada_adapter:
        kinds.add("scada_http_ws")
    return kinds


def adapter_for(kind: str) -> Adapter:
    try:
        return _ADAPTERS[kind]
    except KeyError:
        raise ApiError(422, "adapter_not_available", f"No adapter for data source kind {kind!r}") from None
