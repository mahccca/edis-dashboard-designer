"""Integration tests run against a real PostgreSQL.

Set IP_TEST_DATABASE_URL to a URL of a role that may CREATE DATABASE, e.g.
    postgresql+psycopg://postgres:<pw>@localhost:5432/postgres
A throw-away database is created, migrated with Alembic (the real migration, triggers included) and dropped.
Without it, integration tests are skipped with an explicit reason — they are never faked with SQLite.
"""

import os
import secrets
import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest

os.environ.setdefault("IP_DATABASE_URL", "postgresql+psycopg://unit-tests-do-not-connect@127.0.0.1:1/none")

BACKEND = Path(__file__).resolve().parents[1]
UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if os.environ.get("IP_TEST_DATABASE_URL"):
        return
    skip = pytest.mark.skip(reason="IP_TEST_DATABASE_URL not set: no PostgreSQL available for integration tests")
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip)


def _reset_caches() -> None:
    from app.core import contracts, db
    from app.core.config import get_settings

    get_settings.cache_clear()
    db.get_engine.cache_clear()
    db._session_factory.cache_clear()
    contracts._schemas.cache_clear()
    contracts._validator.cache_clear()


@pytest.fixture(scope="session")
def database_url() -> Iterator[str]:
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import make_url

    admin_url = os.environ["IP_TEST_DATABASE_URL"]
    name = f"ip_test_{uuid.uuid4().hex[:10]}"
    admin = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        c.execute(text(f'CREATE DATABASE "{name}"'))
    url = make_url(admin_url).set(database=name).render_as_string(hide_password=False)
    os.environ.update(IP_DATABASE_URL=url, IP_COOKIE_SECURE="false", IP_WS_PUSH_INTERVAL_SECONDS="0.2")
    _reset_caches()
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.attributes["database_url"] = url
    command.upgrade(cfg, "head")
    try:
        yield url
    finally:
        from app.core.db import get_engine

        get_engine().dispose()
        with admin.connect() as c:
            c.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        admin.dispose()


class Api:
    """One browser: own cookie jar + CSRF token."""

    def __init__(self, client: Any):
        self.client = client
        self.csrf: str | None = None

    def login(self, username: str, password: str) -> Any:
        r = self.client.post("/api/v1/auth/login", json={"username": username, "password": password})
        if r.status_code == 200:
            self.csrf = r.json()["csrfToken"]
        return r

    def request(self, method: str, url: str, **kw: Any) -> Any:
        headers = dict(kw.pop("headers", {}) or {})
        if self.csrf and method.upper() in UNSAFE:
            headers.setdefault("X-CSRF-Token", self.csrf)
        return self.client.request(method, "/api/v1" + url, headers=headers, **kw)

    def get(self, url: str, **kw: Any) -> Any:
        return self.request("GET", url, **kw)

    def post(self, url: str, **kw: Any) -> Any:
        return self.request("POST", url, **kw)

    def put(self, url: str, **kw: Any) -> Any:
        return self.request("PUT", url, **kw)

    def patch(self, url: str, **kw: Any) -> Any:
        return self.request("PATCH", url, **kw)

    def delete(self, url: str, **kw: Any) -> Any:
        return self.request("DELETE", url, **kw)


@dataclass
class World:
    project_id: str
    slug: str
    page_id: str
    binding_id: str
    data_source_id: str
    passwords: dict[str, str]
    usernames: dict[str, str]
    other_project_id: str

    def api(self, who: str) -> Api:
        from fastapi.testclient import TestClient

        from app.main import app

        api = Api(TestClient(app))
        r = api.login(self.usernames[who], self.passwords[who])
        assert r.status_code == 200, r.text
        return api


@pytest.fixture
def anon(database_url: str) -> Api:
    from fastapi.testclient import TestClient

    from app.main import app

    return Api(TestClient(app))


@pytest.fixture
def world(database_url: str) -> World:
    """Pilot project on the SIMULATED source, plus users: owner/designer/viewer/outsider."""
    from app.cli import seed_pilot
    from app.core.db import new_session
    from app.modules.iam.service import add_member, create_user, login_limiter
    from app.modules.projects.models import Project

    login_limiter._failures.clear()
    tag = uuid.uuid4().hex[:8]
    roles = {"owner": None, "designer": "designer", "viewer": "viewer", "outsider": None}
    usernames = {k: f"{k}-{tag}" for k in roles}
    passwords = {k: secrets.token_urlsafe(16) for k in roles}
    with new_session() as db:
        users = {k: create_user(db, usernames[k], passwords[k], k.title(), is_platform_admin=(k == "owner")) for k in roles}
        result = seed_pilot(db, f"pilot-{tag}", users["owner"])
        project_id = uuid.UUID(result["projectId"])
        for k, role in roles.items():
            if role:
                add_member(db, project_id, users[k].id, role)
        other = Project(slug=f"other-{tag}", name="Other project", created_by=users["outsider"].id)
        db.add(other)
        db.flush()
        add_member(db, other.id, users["outsider"].id, "owner")
        db.commit()
    return World(project_id=result["projectId"], slug=f"pilot-{tag}", page_id=result["pageId"],
                 binding_id=result["bindingId"], data_source_id=result["dataSourceId"], passwords=passwords,
                 usernames=usernames, other_project_id=str(other.id))
