from fastapi import Request

from app.core.errors import ApiError


def etag(prefix: str, number: int) -> str:
    return f'"{prefix}-{number}"'


def require_if_match(request: Request, prefix: str, current: int) -> None:
    """Optimistic concurrency: 428 when missing, 412 (+currentEtag) when stale."""
    header = request.headers.get("if-match")
    if not header:
        raise ApiError(428, "precondition_required", "If-Match header is required")
    current_tag = etag(prefix, current)
    if header.strip() not in (current_tag, f"W/{current_tag}"):
        raise stale(current_tag)


def stale(current_tag: str | None) -> ApiError:
    """412 for a stale If-Match, and for a conditional update that matched nothing (lost race after the check)."""
    extra = {"currentEtag": current_tag} if current_tag else {}
    return ApiError(412, "precondition_failed", "Resource was modified by someone else",
                    "Reload the latest version and re-apply your changes.", **extra)


def page_params(limit: int | None) -> int:
    return max(1, min(limit or 50, 200))
