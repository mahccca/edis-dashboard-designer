"""Every HTTP route must resolve the caller through app.core.auth (server-side authz), except an explicit allow-list."""

from fastapi.routing import APIRoute

from app.core.auth import current, optional
from app.main import create_app

PUBLIC = {("POST", "/auth/login"), ("GET", "/health")}
OPTIONAL_AUTH = {"/runtime/sites/{project_slug}/resolve", "/runtime/sites/{project_slug}/values"}


def _deps(dependant) -> set:  # type: ignore[no-untyped-def]
    found = {d.call for d in dependant.dependencies}
    for d in dependant.dependencies:
        found |= _deps(d)
    return found


def _routes() -> list[APIRoute]:
    out: list[APIRoute] = []

    def walk(routes) -> None:  # type: ignore[no-untyped-def]
        for r in routes:
            if isinstance(r, APIRoute):
                out.append(r)
            elif hasattr(r, "original_router"):  # FastAPI >= 0.16x lazily included routers
                walk(r.original_router.routes)
            elif hasattr(r, "routes"):
                walk(r.routes)

    walk(create_app().router.routes)
    return out


def _path(route: APIRoute) -> str:
    return route.path.removeprefix("/api/v1")


def test_all_routes_are_authenticated() -> None:
    routes = _routes()
    assert len(routes) >= 30
    for route in routes:
        deps = _deps(route.dependant)
        for method in route.methods:
            if (method, _path(route)) in PUBLIC:
                continue
            if _path(route) in OPTIONAL_AUTH:
                assert optional in deps, route.path
            else:
                assert current in deps, f"{method} {route.path} is not authenticated"
