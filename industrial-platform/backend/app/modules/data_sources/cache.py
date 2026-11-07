"""Short-lived in-process cache for HTTP JSON execute results (ADR-0016 Phase 5)."""

from __future__ import annotations

import time
from typing import Any

_TTL_SEC = 5.0
_STORE: dict[str, tuple[float, Any]] = {}


def cache_key(data_source_id: str, query_key: str, body_hash: str = "") -> str:
    return f"{data_source_id}:{query_key}:{body_hash}"


def get(key: str) -> Any | None:
    row = _STORE.get(key)
    if row is None:
        return None
    expires, value = row
    if time.monotonic() > expires:
        _STORE.pop(key, None)
        return None
    return value


def put(key: str, value: Any, ttl: float = _TTL_SEC) -> None:
    _STORE[key] = (time.monotonic() + ttl, value)


def bust(prefix: str | None = None) -> None:
    if prefix is None:
        _STORE.clear()
        return
    for k in list(_STORE):
        if k.startswith(prefix):
            _STORE.pop(k, None)
