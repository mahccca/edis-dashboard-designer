"""Minimal JSONPath-style resolver for binding fieldPath (ADR-0016).

Supports: $, $.a.b, a.b, arr.0, $[*], $.arr[*].name
"""

from __future__ import annotations

from typing import Any


class PathError(KeyError):
    pass


def _normalize(path: str) -> str:
    p = (path or "").strip()
    if p in ("", "$", "."):
        return ""
    if p.startswith("$."):
        p = p[2:]
    elif p.startswith("$"):
        p = p[1:].lstrip(".")
    return p


def _tokenize(path: str) -> list[str]:
    raw = _normalize(path)
    if not raw:
        return []
    tokens: list[str] = []
    buf = ""
    i = 0
    while i < len(raw):
        ch = raw[i]
        if ch == ".":
            if buf:
                tokens.append(buf)
                buf = ""
            i += 1
            continue
        if ch == "[":
            if buf:
                tokens.append(buf)
                buf = ""
            j = raw.find("]", i)
            if j < 0:
                raise PathError(path)
            tokens.append(raw[i : j + 1])
            i = j + 1
            continue
        buf += ch
        i += 1
    if buf:
        tokens.append(buf)
    return tokens


def resolve_path(data: Any, path: str) -> Any:
    tokens = _tokenize(path)
    if not tokens:
        return data

    cur: Any = data
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if tok == "[*]" or tok == "[]":
            if not isinstance(cur, list):
                raise PathError(path)
            if i == len(tokens) - 1:
                # Flatten one level when projecting through nested arrays:
                # $[*].signals[*] on [{signals:[a,b]}, ...] → [a,b,...] not [[a,b],...]
                if cur and all(isinstance(x, list) for x in cur):
                    flat: list[Any] = []
                    for nest in cur:
                        flat.extend(nest)
                    return flat
                return cur
            next_tok = tokens[i + 1]
            mapped: list[Any] = []
            for item in cur:
                try:
                    mapped.append(_step(item, next_tok, path))
                except PathError:
                    continue
            cur = mapped
            i += 2
            continue
        cur = _step(cur, tok, path)
        i += 1
    return cur


def _step(cur: Any, tok: str, path: str) -> Any:
    if tok.startswith("[") and tok.endswith("]"):
        inner = tok[1:-1]
        if not isinstance(cur, list):
            raise PathError(path)
        try:
            return cur[int(inner)]
        except (ValueError, IndexError) as exc:
            raise PathError(path) from exc
    if isinstance(cur, dict):
        if tok not in cur:
            raise PathError(path)
        return cur[tok]
    if isinstance(cur, list):
        # map property over list (implicit [*])
        out = []
        for item in cur:
            if isinstance(item, dict) and tok in item:
                out.append(item[tok])
        if out or all(isinstance(x, dict) for x in cur):
            return out
        try:
            return cur[int(tok)]
        except (ValueError, IndexError) as exc:
            raise PathError(path) from exc
    raise PathError(path)


def path_exists(data: Any, path: str) -> bool:
    try:
        resolve_path(data, path)
        return True
    except PathError:
        return False
