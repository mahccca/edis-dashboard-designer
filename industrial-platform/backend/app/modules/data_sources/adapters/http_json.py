"""HTTP JSON API adapter — Grafana-like named queries over REST endpoints.

Config (server-side; secrets never leave the API unredacted):
  {
    "baseUrl": "https://api.example.com",
    "headers": {"Authorization": "Bearer …"},   # optional
    "timeoutMs": 5000,
    "queries": [
      {
        "key": "plant/ac_power",
        "name": "توان AC",
        "method": "GET",
        "urlPath": "/v1/metrics/power",
        "resultMode": "scalar",           # scalar | json | options
        "jsonPath": "data.acPower",       # for scalar: leaf path; for json/options: optional subtree (empty/$ = whole body)
        "unit": "kW"
      },
      {
        "key": "watchlists/all",
        "name": "همه watchlistها",
        "method": "GET",
        "urlPath": "/api/public/subscriptions/watchlists",
        "resultMode": "json",
        "jsonPath": "$",
        "unit": ""
      },
      {
        "key": "watchlists/signals",
        "name": "سیگنال‌های watchlist",
        "method": "GET",
        "urlPath": "/api/public/subscriptions/watchlists",
        "resultMode": "options",
        "jsonPath": "$",
        "itemsPath": "signals",
        "refreshIntervalMs": 600000,  # optional: how often to call upstream (default 5000)
        "unit": ""
      }
    ]
  }
"""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse

DEFAULT_REFRESH_MS = 5_000
MIN_REFRESH_MS = 1_000
MAX_REFRESH_MS = 3_600_000  # 1 hour

from app.modules.data_sources.adapters.base import Reading
from app.modules.industrial_objects.units import UNITS

SIGNAL = re.compile(r"^[A-Za-z0-9_./:-]{1,255}$")
METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}
RESULT_MODES = {"scalar", "json", "options"}
SENSITIVE_HEADERS = {"authorization", "proxy-authorization", "cookie", "set-cookie", "x-api-key", "x-auth-token"}
MAX_JSON_BYTES = 512_000
MAX_OPTIONS = 500


def redact_config(config: dict[str, Any]) -> dict[str, Any]:
    """Return a copy safe to send to the browser (header secrets masked)."""
    out = dict(config)
    headers = config.get("headers")
    if isinstance(headers, dict):
        out["headers"] = {
            str(k): ("***" if str(k).lower() in SENSITIVE_HEADERS and v not in (None, "", "***") else v)
            for k, v in headers.items()
        }
    return out


def has_credentials(config: dict[str, Any]) -> bool:
    headers = config.get("headers")
    if not isinstance(headers, dict):
        return False
    return any(str(k).lower() in SENSITIVE_HEADERS and v not in (None, "", "***") for k, v in headers.items())


def refresh_interval_ms(query: dict[str, Any]) -> int:
    """How often this query may call the upstream API (admin-configured)."""
    raw = query.get("refreshIntervalMs", DEFAULT_REFRESH_MS)
    if not isinstance(raw, int) or isinstance(raw, bool):
        return DEFAULT_REFRESH_MS
    return max(MIN_REFRESH_MS, min(MAX_REFRESH_MS, raw))


def refresh_ttl_sec(query: dict[str, Any]) -> float:
    return refresh_interval_ms(query) / 1000.0


def _extract(data: Any, path: str) -> Any:
    cur: Any = data
    for part in path.split("."):
        if part == "":
            continue
        if isinstance(cur, dict):
            if part not in cur:
                raise KeyError(path)
            cur = cur[part]
        elif isinstance(cur, list):
            try:
                cur = cur[int(part)]
            except (ValueError, IndexError) as exc:
                raise KeyError(path) from exc
        else:
            raise KeyError(path)
    return cur


def _normalize_json_path(raw: str | None) -> str:
    path = (raw or "").strip()
    if path in ("", "$", "."):
        return ""
    if path.startswith("$."):
        path = path[2:]
    elif path.startswith("$"):
        path = path[1:].lstrip(".")
    return path


def _is_whole_path(raw: str | None) -> bool:
    return _normalize_json_path(raw) == ""


def _as_option(raw: Any) -> dict[str, str] | None:
    if isinstance(raw, str) and raw.strip():
        text = raw.strip()
        return {"value": text, "label": text}
    if isinstance(raw, bool):
        text = "true" if raw else "false"
        return {"value": text, "label": text}
    if isinstance(raw, (int, float)) and not isinstance(raw, bool):
        text = str(raw)
        return {"value": text, "label": text}
    if isinstance(raw, dict):
        value = raw.get("value")
        if value is None:
            value = raw.get("id")
        if value is None:
            value = raw.get("key")
        if value is None:
            value = raw.get("path")
        if value is None:
            return None
        label = raw.get("label")
        if label is None:
            label = raw.get("nameFa")
        if label is None:
            label = raw.get("name")
        if label is None:
            label = value
        return {"value": str(value), "label": str(label)}
    return None


def _dedupe_options(raw_items: list[Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in raw_items:
        opt = _as_option(raw)
        if opt is None or opt["value"] in seen:
            continue
        seen.add(opt["value"])
        out.append(opt)
        if len(out) >= MAX_OPTIONS:
            break
    return out


def _preview_scalar(value: Any) -> str:
    if isinstance(value, float):
        text = f"{value:.4g}"
        return text
    return str(value)


def _options_from_object(obj: dict[str, Any], *, field_path_prefix: str) -> list[dict[str, Any]]:
    """Turn an object of scalar fields (e.g. site.totals) into selectable options with live fieldPath."""
    out: list[dict[str, Any]] = []
    for key, raw in obj.items():
        if isinstance(raw, (dict, list)) or raw is None:
            continue
        if not isinstance(key, str) or not key.strip():
            continue
        path = f"{field_path_prefix}.{key}" if field_path_prefix else key
        label = f"{key} = {_preview_scalar(raw)}"
        out.append({
            "value": key,
            "label": label,
            "fieldPath": path,
            "sampleValue": raw,
        })
        if len(out) >= MAX_OPTIONS:
            break
    return out


def _children_options(nested: Any, *, field_path_prefix: str) -> list[dict[str, Any]]:
    if isinstance(nested, dict):
        return _options_from_object(nested, field_path_prefix=field_path_prefix)
    if isinstance(nested, list):
        return _dedupe_options(nested)
    opt = _as_option(nested)
    return [opt] if opt else []


def extract_options_from_value(value: Any, items_path: str | None) -> list[dict[str, Any]]:
    """Turn a JSON subtree into unique {value,label} options for the page builder."""
    field = (items_path or "").strip()
    if field:
        if isinstance(value, list):
            # Prefer first matching parent's children when field is an object map (totals);
            # for arrays (signals) flatten unique across parents.
            object_mode = False
            collected: list[Any] = []
            flat_from_objects: list[dict[str, Any]] = []
            for idx, item in enumerate(value):
                if not isinstance(item, dict) or field not in item:
                    continue
                nested = item[field]
                if isinstance(nested, dict):
                    object_mode = True
                    flat_from_objects.extend(
                        _options_from_object(nested, field_path_prefix=f"$[{idx}].{field}"),
                    )
                elif isinstance(nested, list):
                    collected.extend(nested)
                else:
                    collected.append(nested)
            if object_mode:
                # unique by value (field key), keep first site's path
                seen: set[str] = set()
                out: list[dict[str, Any]] = []
                for opt in flat_from_objects:
                    if opt["value"] in seen:
                        continue
                    seen.add(opt["value"])
                    out.append(opt)
                    if len(out) >= MAX_OPTIONS:
                        break
                return out
            return _dedupe_options(collected)
        if isinstance(value, dict) and field in value:
            return _children_options(value[field], field_path_prefix=f"$.{field}")
        return []
    if isinstance(value, list):
        return _dedupe_options(list(value))
    opt = _as_option(value)
    return [opt] if opt else []


def extract_option_groups_from_value(value: Any, items_path: str | None) -> list[dict[str, Any]]:
    """Parent → child option groups when itemsPath points at a nested list/object on each parent.

    Nested list (e.g. signals) → child options are list items.
    Nested object (e.g. totals) → child options are scalar keys, with fieldPath for live bind.

    One parent → a single group (UI skips parent pick).
    Several parents → UI asks for parent first, then items.
    """
    field = (items_path or "").strip()
    if not field:
        return []

    parents: list[tuple[dict[str, str], Any, str]] = []
    if isinstance(value, list):
        for idx, item in enumerate(value):
            if not isinstance(item, dict) or field not in item:
                continue
            parent = _as_option(item)
            if parent is None:
                parent = {"value": str(idx), "label": f"item {idx}"}
            prefix = f"$[{idx}].{field}"
            parents.append((parent, item[field], prefix))
    elif isinstance(value, dict) and field in value:
        parent = _as_option(value) or {"value": "_", "label": "root"}
        parents.append((parent, value[field], f"$.{field}"))
    else:
        return []

    groups: list[dict[str, Any]] = []
    seen_parents: set[str] = set()
    for parent, nested, prefix in parents:
        if parent["value"] in seen_parents:
            continue
        options = _children_options(nested, field_path_prefix=prefix)
        if not options:
            continue
        seen_parents.add(parent["value"])
        groups.append({"value": parent["value"], "label": parent["label"], "options": options})
        if len(groups) >= MAX_OPTIONS:
            break
    return groups


class HttpJsonAdapter:
    kind = "http_json"
    is_test_data = False
    data_origin = "live"

    def validate_config(self, config: dict[str, Any]) -> list[dict[str, str]]:
        errors: list[dict[str, str]] = []
        for key in sorted(set(config) - {"baseUrl", "headers", "timeoutMs", "queries", "enabled"}):
            errors.append({"pointer": f"/config/{key}", "code": "additional_properties", "message": "not allowed"})

        base = config.get("baseUrl")
        if not isinstance(base, str) or not base.strip():
            errors.append({"pointer": "/config/baseUrl", "code": "required", "message": "non-empty URL required"})
        else:
            parsed = urlparse(base.strip())
            if parsed.scheme not in ("http", "https") or not parsed.netloc:
                errors.append({"pointer": "/config/baseUrl", "code": "format", "message": "http(s) URL with host required"})

        timeout = config.get("timeoutMs", 5000)
        if not isinstance(timeout, int) or isinstance(timeout, bool) or not 500 <= timeout <= 60000:
            errors.append({"pointer": "/config/timeoutMs", "code": "range", "message": "integer 500..60000"})

        headers = config.get("headers", {})
        if not isinstance(headers, dict):
            errors.append({"pointer": "/config/headers", "code": "type", "message": "object expected"})
        else:
            for hk, hv in headers.items():
                if not isinstance(hk, str) or not hk.strip():
                    errors.append({"pointer": "/config/headers", "code": "pattern", "message": "header names must be strings"})
                if not isinstance(hv, str):
                    errors.append({"pointer": f"/config/headers/{hk}", "code": "type", "message": "string expected"})

        queries = config.get("queries")
        if not isinstance(queries, list) or not queries:
            return errors + [{"pointer": "/config/queries", "code": "required", "message": "non-empty list required"}]

        seen: set[str] = set()
        for i, q in enumerate(queries):
            p = f"/config/queries/{i}"
            allowed = {
                "key", "name", "method", "urlPath", "jsonPath", "unit", "body",
                "resultMode", "itemsPath", "queryParams", "refreshIntervalMs",
            }
            if not isinstance(q, dict) or set(q) - allowed:
                errors.append({"pointer": p, "code": "shape",
                               "message": "fields: key, name, method, urlPath, resultMode?, jsonPath?, itemsPath?, "
                                          "queryParams?, refreshIntervalMs?, unit, body?"})
                continue
            key = q.get("key")
            if not isinstance(key, str) or not SIGNAL.match(key) or key in seen:
                errors.append({"pointer": f"{p}/key", "code": "pattern", "message": "invalid or duplicate query key"})
            seen.add(key if isinstance(key, str) else "")
            if not isinstance(q.get("name"), str) or not 1 <= len(q["name"]) <= 120:
                errors.append({"pointer": f"{p}/name", "code": "required", "message": "1..120 characters"})
            method = q.get("method", "GET")
            if method not in METHODS:
                errors.append({"pointer": f"{p}/method", "code": "enum", "message": f"one of {sorted(METHODS)}"})
            url_path = q.get("urlPath")
            if not isinstance(url_path, str) or not url_path.startswith("/"):
                errors.append({"pointer": f"{p}/urlPath", "code": "format", "message": "must start with /"})
            mode = q.get("resultMode", "scalar")
            if mode not in RESULT_MODES:
                errors.append({"pointer": f"{p}/resultMode", "code": "enum", "message": "scalar, json, or options"})
            jp = q.get("jsonPath", "$" if mode in ("json", "options") else None)
            if mode == "scalar":
                if not isinstance(jp, str) or not jp.strip() or _is_whole_path(jp):
                    errors.append({"pointer": f"{p}/jsonPath", "code": "required",
                                   "message": "dotted path to a scalar field required (e.g. 0.name or data.value)"})
            elif jp is not None and not isinstance(jp, str):
                errors.append({"pointer": f"{p}/jsonPath", "code": "type", "message": "string expected"})
            items_path = q.get("itemsPath")
            if mode == "options":
                if items_path is not None and not isinstance(items_path, str):
                    errors.append({"pointer": f"{p}/itemsPath", "code": "type", "message": "string expected"})
            elif items_path not in (None, ""):
                errors.append({"pointer": f"{p}/itemsPath", "code": "unexpected",
                               "message": "itemsPath is only valid when resultMode=options"})
            if q.get("unit") not in UNITS:
                errors.append({"pointer": f"{p}/unit", "code": "unknown_unit", "message": f"unknown unit {q.get('unit')!r}"})
            refresh = q.get("refreshIntervalMs", DEFAULT_REFRESH_MS)
            if refresh is not None and (
                not isinstance(refresh, int) or isinstance(refresh, bool)
                or not MIN_REFRESH_MS <= refresh <= MAX_REFRESH_MS
            ):
                errors.append({"pointer": f"{p}/refreshIntervalMs", "code": "range",
                               "message": f"integer {MIN_REFRESH_MS}..{MAX_REFRESH_MS} (ms)"})
            if "body" in q and q["body"] is not None and not isinstance(q["body"], (dict, list, str, int, float, bool)):
                errors.append({"pointer": f"{p}/body", "code": "type", "message": "JSON value expected"})
            qp = q.get("queryParams")
            if qp is not None:
                if not isinstance(qp, dict):
                    errors.append({"pointer": f"{p}/queryParams", "code": "type", "message": "object expected"})
                else:
                    for qk, qv in qp.items():
                        if not isinstance(qk, str) or not isinstance(qv, (str, int, float, bool)):
                            errors.append({"pointer": f"{p}/queryParams/{qk}", "code": "type",
                                           "message": "string keys and primitive values expected"})
        return errors

    def _query_map(self, config: dict[str, Any]) -> dict[str, dict[str, Any]]:
        return {q["key"]: q for q in config.get("queries", [])}

    def _url(self, config: dict[str, Any], url_path: str) -> str:
        parsed = urlparse(config["baseUrl"].strip())
        base_path = parsed.path.rstrip("/")
        path = url_path if url_path.startswith("/") else f"/{url_path}"
        if base_path and not path.startswith(base_path):
            path = f"{base_path}{path}"
        return f"{parsed.scheme}://{parsed.netloc}{path}"

    def _fetch_raw(self, config: dict[str, Any], query: dict[str, Any]) -> dict[str, Any]:
        from urllib.parse import urlencode

        url = self._url(config, query["urlPath"])
        qp = query.get("queryParams")
        if isinstance(qp, dict) and qp:
            # Phase 5: allow {{binding:uuid}} placeholders resolved by caller via query._resolvedParams
            resolved = query.get("_resolvedParams") if isinstance(query.get("_resolvedParams"), dict) else {}
            flat = {}
            for k, v in qp.items():
                text = str(v)
                for bk, bv in resolved.items():
                    text = text.replace(f"{{{{binding:{bk}}}}}", str(bv))
                flat[str(k)] = text
            url = f"{url}{'&' if '?' in url else '?'}{urlencode(flat)}"
        headers = {"Accept": "application/json", **{str(k): str(v) for k, v in (config.get("headers") or {}).items()
                                                    if str(v) != "***"}}
        method = query.get("method", "GET")
        body = None
        if method in {"POST", "PUT", "PATCH"} and "body" in query and query["body"] is not None:
            body = json.dumps(query["body"]).encode("utf-8")
            headers.setdefault("Content-Type", "application/json")
        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        timeout = (config.get("timeoutMs") or 5000) / 1000
        started = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 — URL validated as http(s)
                raw = resp.read(MAX_JSON_BYTES + 1)
                latency = int((time.perf_counter() - started) * 1000)
                status = getattr(resp, "status", None) or getattr(resp, "code", None) or 200
                raw_headers = getattr(resp, "headers", None) or {}
                try:
                    header_items = dict(raw_headers).items()
                except Exception:  # noqa: BLE001 — mock/test responses may lack mapping headers
                    header_items = []
                resp_headers = {str(k): ("***" if str(k).lower() in SENSITIVE_HEADERS else v)
                                for k, v in header_items}
                if len(raw) > MAX_JSON_BYTES:
                    return {"ok": False, "statusCode": status, "headers": resp_headers, "body": None,
                            "latencyMs": latency, "byteSize": len(raw),
                            "message": f"response larger than {MAX_JSON_BYTES} bytes"}
                parsed = None if not raw else json.loads(raw.decode("utf-8"))
                return {"ok": True, "statusCode": status, "headers": resp_headers, "body": parsed,
                        "latencyMs": latency, "byteSize": len(raw), "message": "OK"}
        except urllib.error.HTTPError as exc:
            latency = int((time.perf_counter() - started) * 1000)
            raw = exc.read(MAX_JSON_BYTES) if hasattr(exc, "read") else b""
            try:
                parsed = json.loads(raw.decode("utf-8")) if raw else None
            except json.JSONDecodeError:
                parsed = raw.decode("utf-8", errors="replace") if raw else None
            return {"ok": False, "statusCode": exc.code, "headers": {}, "body": parsed,
                    "latencyMs": latency, "byteSize": len(raw or b""), "message": str(exc)}
        except Exception as exc:  # noqa: BLE001
            latency = int((time.perf_counter() - started) * 1000)
            return {"ok": False, "statusCode": None, "headers": {}, "body": None,
                    "latencyMs": latency, "byteSize": 0, "message": str(exc)}

    def _fetch_cached(self, config: dict[str, Any], query: dict[str, Any], *, use_cache: bool = True) -> dict[str, Any]:
        """Fetch query body, honoring per-query refreshIntervalMs as cache TTL."""
        from app.modules.data_sources import cache as exec_cache

        key = exec_cache.cache_key(str(config.get("baseUrl")), query["key"])
        if use_cache:
            hit = exec_cache.get(key)
            if isinstance(hit, dict):
                return {**hit, "cached": True, "queryKey": query["key"],
                        "refreshIntervalMs": refresh_interval_ms(query)}
        result = {
            **self._fetch_raw(config, query),
            "queryKey": query["key"],
            "cached": False,
            "refreshIntervalMs": refresh_interval_ms(query),
        }
        if result.get("ok"):
            exec_cache.put(key, result, ttl=refresh_ttl_sec(query))
        return result

    def _fetch(self, config: dict[str, Any], query: dict[str, Any]) -> tuple[Any, int]:
        result = self._fetch_cached(config, query, use_cache=True)
        if not result["ok"]:
            raise urllib.error.URLError(result["message"] or "request failed")
        return result["body"], int(result["latencyMs"] or 0)

    def execute_query(self, config: dict[str, Any], query_key: str, *, use_cache: bool = True) -> dict[str, Any]:
        by_key = self._query_map(config)
        if query_key not in by_key:
            return {"ok": False, "statusCode": None, "headers": {}, "body": None,
                    "latencyMs": None, "byteSize": 0, "message": f"unknown query {query_key!r}", "queryKey": query_key}
        return self._fetch_cached(config, by_key[query_key], use_cache=use_cache)

    def _pick(self, payload: Any, query: dict[str, Any]) -> Any:
        path = _normalize_json_path(query.get("jsonPath"))
        return payload if path == "" else _extract(payload, path)

    def extract_options(self, config: dict[str, Any], query: dict[str, Any]) -> list[dict[str, str]]:
        try:
            payload, _ = self._fetch(config, query)
            value = self._pick(payload, query)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, KeyError, TypeError, ValueError):
            return []
        return extract_options_from_value(value, query.get("itemsPath"))

    def extract_option_groups(self, config: dict[str, Any], query: dict[str, Any]) -> list[dict[str, Any]]:
        try:
            payload, _ = self._fetch(config, query)
            value = self._pick(payload, query)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, KeyError, TypeError, ValueError):
            return []
        return extract_option_groups_from_value(value, query.get("itemsPath"))

    def list_option_sets(self, config: dict[str, Any]) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for query in config.get("queries", []):
            if query.get("resultMode") != "options":
                continue
            try:
                payload, _ = self._fetch(config, query)
                value = self._pick(payload, query)
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, KeyError, TypeError, ValueError):
                value = None
            items_path = query.get("itemsPath")
            options = extract_options_from_value(value, items_path) if value is not None else []
            groups = extract_option_groups_from_value(value, items_path) if value is not None else []
            out.append({
                "key": query["key"],
                "name": query.get("name") or query["key"],
                "options": options,
                "groups": groups,
            })
        return out

    def read_binding_value(
        self, config: dict[str, Any], signal: str, now: datetime, field_path: str | None = None,
    ) -> Reading | None:
        """Resolve a binding: raw query subtree, then optional fieldPath (before resultMode options/scalar)."""
        from app.modules.data_sources.jsonpath import PathError, resolve_path

        by_key = self._query_map(config)
        query = by_key.get(signal)
        if query is None:
            return None
        unit = query.get("unit") or ""
        try:
            payload, _ = self._fetch(config, query)
            base = self._pick(payload, query)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, KeyError, TypeError, ValueError):
            return None
        if field_path:
            try:
                value = resolve_path(base, field_path)
            except PathError:
                return None
            if isinstance(value, (dict, list, str, bool)) or value is None:
                return Reading(value, unit, now)
            if isinstance(value, (int, float)):
                return Reading(float(value), unit, now)
            return None
        # No fieldPath → honor resultMode (scalar / json / options)
        return self._reading_from_value(query, base, unit, now)

    def _reading_from_value(self, query: dict[str, Any], value: Any, unit: str, now: datetime) -> Reading | None:
        mode = query.get("resultMode", "scalar")
        if mode == "options":
            return Reading(extract_options_from_value(value, query.get("itemsPath")), unit, now)
        if mode == "json":
            if isinstance(value, (dict, list, str, bool)) or value is None:
                return Reading(value, unit, now)
            if isinstance(value, (int, float)):
                return Reading(float(value), unit, now)
            return None
        if isinstance(value, (dict, list)):
            return None
        if isinstance(value, bool) or value is None:
            return Reading(value, unit, now)
        if isinstance(value, (int, float)):
            return Reading(float(value), unit, now)
        if isinstance(value, str):
            try:
                return Reading(float(value), unit, now)
            except ValueError:
                return Reading(value, unit, now)
        return None

    def _reading(self, config: dict[str, Any], query: dict[str, Any], now: datetime) -> Reading | None:
        return self.read_binding_value(config, query["key"], now, field_path=None)

    def test(self, config: dict[str, Any]) -> dict[str, Any]:
        queries = config.get("queries") or []
        if not queries:
            return {"ok": False, "latencyMs": None, "authenticated": has_credentials(config),
                    "message": "No queries configured."}
        try:
            _, latency = self._fetch(config, queries[0])
            return {"ok": True, "latencyMs": latency, "authenticated": has_credentials(config),
                    "message": f"HTTP OK — first query {queries[0]['key']!r} reachable."}
        except Exception as exc:  # noqa: BLE001 — surface connection errors to the UI
            return {"ok": False, "latencyMs": None, "authenticated": has_credentials(config),
                    "message": f"HTTP request failed: {exc}"}

    def search_signals(self, config: dict[str, Any], q: str | None, limit: int) -> list[dict[str, Any]]:
        now = datetime.now(UTC).replace(microsecond=0)
        out: list[dict[str, Any]] = []
        for query in config.get("queries", []):
            key, name = query["key"], query.get("name") or query["key"]
            hay = f"{key} {name}".lower()
            if q and q.lower() not in hay:
                continue
            mode = query.get("resultMode", "scalar")
            reading = self._reading(config, query, now)
            out.append({
                "path": key,
                "name": name,
                "unit": query.get("unit") or "",
                "resultMode": mode,
                "itemsPath": query.get("itemsPath") or "",
                "refreshIntervalMs": refresh_interval_ms(query),
                "lastValue": None if reading is None else reading.value,
                "lastSeen": None if reading is None else reading.ts.isoformat(),
                "isTestData": False,
            })
            if len(out) >= limit:
                break
        return out

    def read_latest(self, config: dict[str, Any], signals: list[str], now: datetime | None = None) -> dict[str, Reading | None]:
        ts = (now or datetime.now(UTC)).replace(microsecond=0)
        by_key = self._query_map(config)
        return {path: self._reading(config, by_key[path], ts) if path in by_key else None for path in signals}
