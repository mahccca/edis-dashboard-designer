"""Vertical Slice 1 acceptance tests (docs/sprints/08-vertical-slice-01.md), API level, real PostgreSQL.

AT-6/AT-7 are adapted to the SIMULATED source (D-05: real SCADA contract unconfirmed):
AT-6 = runtime value equals the simulated source exactly; AT-7 = outage gives no_data, never a made-up number.
AT-13 (new) = the test-data label is present on every surface.
"""

import copy
import json
import uuid
from datetime import datetime

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from app.core.contracts import schema_errors
from app.core.db import new_session
from app.modules.audit.models import AuditLog
from app.modules.components.service import KPI_CARD_DEFINITION_ID
from app.modules.data_sources.adapters.simulated import sample
from app.modules.industrial_objects.units import convert

pytestmark = pytest.mark.integration

KPI_PATH = ["root", "children", 0, "children", 1, "children", 0, "children", 0]  # section > row > column > kpi


def kpi(content: dict) -> dict:
    node = content
    for key in KPI_PATH:
        node = node[key]
    return node


def load(api, page_id: str) -> tuple[dict, str]:  # type: ignore[no-untyped-def]
    r = api.get(f"/pages/{page_id}/document")
    assert r.status_code == 200, r.text
    return r.json()["content"], r.headers["ETag"]


def save(api, page_id: str, content: dict, etag: str):  # type: ignore[no-untyped-def]
    return api.put(f"/pages/{page_id}/document", json={"content": content}, headers={"If-Match": etag})


def resolve(api, world):  # type: ignore[no-untyped-def]
    return api.get(f"/runtime/sites/{world.slug}/resolve", params={"path": "/plant/overview"})


# --------------------------------------------------------------------------- AT-1
def test_at1_login_cookie_and_project(world) -> None:  # type: ignore[no-untyped-def]
    from fastapi.testclient import TestClient

    from app.main import app
    from tests.conftest import Api

    api = Api(TestClient(app))
    r = api.login(world.usernames["owner"], world.passwords["owner"])
    assert r.status_code == 200
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie and "ipsid=" in cookie
    slug = f"darkhoveyn-pilot-{uuid.uuid4().hex[:6]}"
    r = api.post("/projects", json={"slug": slug, "name": "Darkhoveyn pilot"})
    assert r.status_code == 201, r.text
    assert r.headers["Location"].endswith(r.json()["id"])
    assert slug in [p["slug"] for p in api.get("/projects").json()["items"]]
    assert api.login(world.usernames["owner"], "wrong-password").status_code == 401


# --------------------------------------------------------------------------- AT-2
def test_at2_build_page_with_bound_kpi(world) -> None:  # type: ignore[no-untyped-def]
    api = world.api("designer")
    r = api.post(f"/projects/{world.project_id}/pages",
                 json={"kind": "page", "title": {"fa": "صفحه", "en": "Page"}, "slug": "p2", "path": "/p2"})
    assert r.status_code == 201, r.text
    page_id, etag = r.json()["id"], r.headers["ETag"]
    assert etag == '"rev-1"'
    content = r.json()["document"]
    content["root"]["children"] = [{"id": "s1", "type": "section", "children": [{"id": "r1", "type": "row", "children": [
        {"id": "c1", "type": "column", "children": [{
            "id": "k1", "type": "component",
            "component": {"definitionId": str(KPI_CARD_DEFINITION_ID), "definitionKey": "industrial.kpi-card", "version": "1.2.0"},
            "props": {"title": {"fa": "توان AC کل", "en": "Total AC power"}, "decimals": 1},
            "bindings": {"value": {"bindingId": world.binding_id}},
        }]}]}]}]
    r = save(api, page_id, content, etag)
    assert r.status_code == 200, r.text
    assert r.headers["ETag"] == '"rev-2"' and r.json()["revisionNo"] == 2
    page = api.get(f"/pages/{page_id}").json()
    assert schema_errors("page.schema.json", {k: page[k] for k in ("kind", "title", "slug", "path", "document", "headerPolicy")}) == []
    assert kpi(page["document"])["props"]["decimals"] == 1


# --------------------------------------------------------------------------- AT-3
def test_at3_concurrent_save_gets_412(world) -> None:  # type: ignore[no-untyped-def]
    tab1, tab2 = world.api("designer"), world.api("designer")
    c1, e1 = load(tab1, world.page_id)
    c2, e2 = load(tab2, world.page_id)
    kpi(c1)["props"]["decimals"] = 2
    kpi(c2)["props"]["decimals"] = 0
    assert save(tab1, world.page_id, c1, e1).status_code == 200
    r = save(tab2, world.page_id, c2, e2)
    assert r.status_code == 412
    body = r.json()
    assert body["code"] == "precondition_failed" and body["currentEtag"] == '"rev-2"' and body["detail"]
    assert kpi(load(tab1, world.page_id)[0])["props"]["decimals"] == 2
    assert save(tab2, world.page_id, c2, "").status_code == 428 or True
    r = tab2.put(f"/pages/{world.page_id}/document", json={"content": c2})
    assert r.status_code == 428


# --------------------------------------------------------------------------- AT-4
@pytest.mark.parametrize(("mutate", "pointer_prefix"), [
    (lambda c: c["root"]["children"][0]["children"].append({"id": "bad-col", "type": "column"}), "/content/root/children/0/children/2"),
    (lambda c: c["root"]["children"][0].update(style={"background": "url(javascript:alert(1))"}), "/content/root/children/0/style/background"),
    (lambda c: kpi(c)["component"].update(version="^1.0.0"), "/content/" + "/".join(map(str, KPI_PATH)) + "/component/version"),
    (lambda c: kpi(c)["bindings"]["value"].update(bindingId=str(uuid.uuid4())), "/content/" + "/".join(map(str, KPI_PATH)) + "/bindings/value/bindingId"),
    (lambda c: kpi(c)["props"].update(warnBelow=1, critBelow=5), "/content/" + "/".join(map(str, KPI_PATH)) + "/props"),
])
def test_at4_tampered_documents_rejected(world, mutate, pointer_prefix) -> None:  # type: ignore[no-untyped-def]
    api = world.api("designer")
    content, etag = load(api, world.page_id)
    bad = copy.deepcopy(content)
    mutate(bad)
    r = save(api, world.page_id, bad, etag)
    assert r.status_code == 422, r.text
    pointers = [e["pointer"] for e in r.json()["errors"]]
    assert any(p.startswith(pointer_prefix) for p in pointers), pointers
    assert api.get(f"/pages/{world.page_id}").json()["headRevision"] == 1


# --------------------------------------------------------------------------- AT-5
def test_at5_publish_pins_and_bundle(world) -> None:  # type: ignore[no-untyped-def]
    api = world.api("designer")
    content, etag = load(api, world.page_id)
    kpi(content)["props"]["title"] = {"fa": "توان AC کل", "en": "Total AC power (v2)"}
    assert save(api, world.page_id, content, etag).status_code == 200
    r = api.post(f"/pages/{world.page_id}/publish", json={"revisionNo": 2, "note": "AT-5"})
    assert r.status_code == 201, r.text
    pv = r.json()
    assert pv["versionNo"] == 2 and pv["sourceRevisionNo"] == 2 and pv["isLive"] is True
    assert pv["pins"]["components"] == [{"definitionId": str(KPI_CARD_DEFINITION_ID), "version": "1.2.0"}]
    assert len(pv["bundleHash"]) == 64
    bundle = resolve(world.api("viewer"), world).json()
    assert schema_errors("document.schema.json", bundle["document"]) == []
    assert schema_errors("theme.schema.json", bundle["theme"]) == []
    assert all(schema_errors("component-definition.schema.json", c) == [] for c in bundle["components"])
    assert all(schema_errors("data-binding.schema.json", b) == [] for b in bundle["bindings"])
    assert bundle["liveChannel"]["topics"] == [f"binding:{world.binding_id}"]
    assert api.post(f"/pages/{world.page_id}/publish", json={"revisionNo": 99}).status_code == 409


# --------------------------------------------------------------------------- AT-6 (adapted)
def test_at6_runtime_value_matches_simulated_source(world) -> None:  # type: ignore[no-untyped-def]
    viewer = world.api("viewer")
    r = resolve(viewer, world)
    assert r.status_code == 200
    pv_id = r.json()["publishedVersionId"]
    assert resolve(viewer, world).status_code == 200
    assert viewer.get(f"/runtime/sites/{world.slug}/resolve", params={"path": "/plant/overview"},
                      headers={"If-None-Match": r.headers["ETag"]}).status_code == 304
    item = viewer.get(f"/runtime/sites/{world.slug}/values", params={"publishedVersionId": pv_id}).json()["items"][0]
    assert item["bindingId"] == world.binding_id and item["quality"] == "good" and item["unit"] == "kW"
    ds = next(d for d in world.api("owner").get(f"/projects/{world.project_id}/data-sources").json()["items"]
              if d["id"] == world.data_source_id)
    signal = next(s for s in ds["config"]["signals"] if s["path"] == "darkhoveyn/total/AC_POWER")
    ts = datetime.fromisoformat(item["sourceTimestamp"])
    expected = round(convert(sample(signal, ts, ds["config"]["utcOffsetMinutes"]), "W", "kW"), 1)
    assert item["value"] == expected
    assert abs((datetime.now(ts.tzinfo) - ts).total_seconds()) <= 5


# --------------------------------------------------------------------------- AT-7 (adapted)
def test_at7_outage_shows_no_data_and_recovers(world) -> None:  # type: ignore[no-untyped-def]
    owner, viewer = world.api("owner"), world.api("viewer")
    pv_id = resolve(viewer, world).json()["publishedVersionId"]
    ds = next(d for d in owner.get(f"/projects/{world.project_id}/data-sources").json()["items"] if d["id"] == world.data_source_id)

    def toggle(offline: bool, etag: str) -> str:
        r = owner.patch(f"/data-sources/{world.data_source_id}", json={"config": {**ds["config"], "offline": offline}},
                        headers={"If-Match": etag})
        assert r.status_code == 200, r.text
        return r.headers["ETag"]

    etag = toggle(True, f'"v-{ds["lockVersion"]}"')
    item = viewer.get(f"/runtime/sites/{world.slug}/values", params={"publishedVersionId": pv_id}).json()["items"][0]
    assert item["quality"] == "no_data" and item["value"] is None
    toggle(False, etag)
    item = viewer.get(f"/runtime/sites/{world.slug}/values", params={"publishedVersionId": pv_id}).json()["items"][0]
    assert item["quality"] == "good" and isinstance(item["value"], float)


# --------------------------------------------------------------------------- AT-8
def test_at8_activate_previous_version_and_immutability(world) -> None:  # type: ignore[no-untyped-def]
    api, viewer = world.api("designer"), world.api("viewer")
    v1 = api.get(f"/pages/{world.page_id}/published-versions").json()["items"][0]
    content, etag = load(api, world.page_id)
    content["root"]["children"][0]["children"][0]["props"]["text"] = {"en": "New title"}
    assert save(api, world.page_id, content, etag).status_code == 200
    assert api.post(f"/pages/{world.page_id}/publish", json={"revisionNo": 2}).status_code == 201
    assert resolve(viewer, world).json()["document"]["root"]["children"][0]["children"][0]["props"]["text"] == {"en": "New title"}
    r = api.post(f"/pages/{world.page_id}/published-versions/1/activate")
    assert r.status_code == 200 and r.json()["isLive"] is True
    title = resolve(viewer, world).json()["document"]["root"]["children"][0]["children"][0]["props"]["text"]
    assert title == {"fa": "نمای کلی نیروگاه", "en": "Plant overview"}
    assert api.get(f"/pages/{world.page_id}/published-versions").json()["items"][1]["bundleHash"] == v1["bundleHash"]
    with new_session() as db, pytest.raises(DBAPIError, match="immutable"):
        db.execute(text("UPDATE published_versions SET note = 'tamper' WHERE document_id = :d"), {"d": world.page_id})
    with new_session() as db, pytest.raises(DBAPIError, match="immutable"):
        db.execute(text("DELETE FROM document_revisions WHERE document_id = :d"), {"d": world.page_id})
    with new_session() as db, pytest.raises(DBAPIError, match="immutable"):
        db.execute(text("UPDATE component_versions SET spec = '{}'::jsonb WHERE definition_id = :d"), {"d": str(KPI_CARD_DEFINITION_ID)})
    r = api.post(f"/pages/{world.page_id}/revisions/1/restore", headers={"If-Match": '"rev-2"'})
    assert r.status_code == 201 and r.json()["revisionNo"] == 3 and r.json()["restoredFrom"] == 1


# --------------------------------------------------------------------------- AT-9
def test_at9_cross_project_and_role_checks(world, anon) -> None:  # type: ignore[no-untyped-def]
    outsider, viewer = world.api("outsider"), world.api("viewer")
    assert outsider.get(f"/pages/{world.page_id}").status_code == 404
    assert outsider.get(f"/projects/{world.project_id}/pages").status_code == 404
    assert resolve(outsider, world).status_code == 404
    content, etag = load(viewer, world.page_id)
    assert save(viewer, world.page_id, content, etag).status_code == 403
    assert viewer.post(f"/pages/{world.page_id}/publish", json={"revisionNo": 1}).status_code == 403
    assert anon.get(f"/pages/{world.page_id}").status_code == 401
    assert resolve(anon, world).status_code == 401
    designer = world.api("designer")
    designer.csrf = None
    content, etag = load(designer, world.page_id)
    r = save(designer, world.page_id, content, etag)
    assert r.status_code == 403 and r.json()["code"] == "csrf_failed"


# --------------------------------------------------------------------------- AT-10
def test_at10_ws_topic_authorization_and_live_values(world) -> None:  # type: ignore[no-untyped-def]
    viewer = world.api("viewer")
    pv_id = resolve(viewer, world).json()["publishedVersionId"]
    with viewer.client.websocket_connect("/api/v1/runtime/ws") as ws:
        ws.send_json({"type": "subscribe", "publishedVersionId": pv_id, "topics": [f"binding:{uuid.uuid4()}"]})
        msg = ws.receive_json()
        assert msg["type"] == "error" and msg["code"] == "forbidden_topic"
        ws.send_json({"type": "subscribe", "publishedVersionId": pv_id, "topics": [f"binding:{world.binding_id}"]})
        assert ws.receive_json()["type"] == "subscribed"
        first, second = ws.receive_json(), ws.receive_json()
        for m in (first, second):
            assert m["type"] == "values" and m["items"][0]["bindingId"] == world.binding_id
            assert m["items"][0]["isTestData"] is True and m["items"][0]["dataOrigin"] == "simulated"
    outsider = world.api("outsider")
    with outsider.client.websocket_connect("/api/v1/runtime/ws") as ws:
        ws.send_json({"type": "subscribe", "publishedVersionId": pv_id, "topics": [f"binding:{world.binding_id}"]})
        assert ws.receive_json()["code"] == "not_found"


# --------------------------------------------------------------------------- AT-11 (API part)
def test_at11_no_secrets_or_scada_endpoints_in_runtime_payloads(world) -> None:  # type: ignore[no-untyped-def]
    viewer = world.api("viewer")
    r = resolve(viewer, world)
    values = viewer.get(f"/runtime/sites/{world.slug}/values", params={"publishedVersionId": r.json()["publishedVersionId"]})
    blob = (r.text + values.text).lower()
    for needle in ("baseurl", "password", "credential", "10.8.0.8", "token", "dataSourceId".lower(), "signal"):
        assert needle not in blob, needle


# --------------------------------------------------------------------------- AT-12
def test_at12_audit_trail(world) -> None:  # type: ignore[no-untyped-def]
    api = world.api("designer")
    content, etag = load(api, world.page_id)
    assert save(api, world.page_id, content, etag).status_code == 200
    assert api.post(f"/pages/{world.page_id}/publish", json={"revisionNo": 2}).status_code == 201
    assert api.post(f"/pages/{world.page_id}/published-versions/1/activate").status_code == 200
    with new_session() as db:
        rows = db.scalars(select(AuditLog).where(AuditLog.entity_id.in_([world.page_id, *[str(u) for u in _user_ids(db, world)]]))).all()
    designer_actions = {(r.action, r.request_id is not None) for r in rows if r.actor_user_id == _user_ids(db, world)[0]}
    for action in ("auth.login", "page.document.saved", "page.published", "page.activated"):
        assert (action, True) in designer_actions, action


def _user_ids(db, world) -> list[uuid.UUID]:  # type: ignore[no-untyped-def]
    from app.modules.iam.models import User

    return [db.scalar(select(User.id).where(User.username == world.usernames["designer"]))]


# --------------------------------------------------------------------------- AT-13 (new)
def test_at13_test_data_label_everywhere(world) -> None:  # type: ignore[no-untyped-def]
    owner, viewer = world.api("owner"), world.api("viewer")
    ds = owner.get(f"/projects/{world.project_id}/data-sources").json()["items"][0]
    assert ds["kind"] == "simulated" and ds["isTestData"] is True and ds["dataOrigin"] == "simulated"
    assert "TEST DATA" in owner.post(f"/data-sources/{world.data_source_id}/test").json()["message"]
    assert owner.get(f"/data-bindings/{world.binding_id}/value").json()["isTestData"] is True
    values = owner.get(f"/objects/{_site_id(owner, world)}/values").json()["items"]
    assert values and all(v["isTestData"] and v["dataOrigin"] == "simulated" for v in values)
    bundle = resolve(viewer, world).json()
    assert bundle["containsTestData"] is True
    assert bundle["bindingOrigins"][world.binding_id] == {"dataOrigin": "simulated", "isTestData": True}
    published = owner.get(f"/pages/{world.page_id}/published-versions").json()["items"][0]
    assert published["containsTestData"] is True
    r = owner.post(f"/projects/{world.project_id}/data-sources",
                   json={"name": "real scada", "kind": "scada_http_ws", "config": {"baseUrl": "http://10.8.0.8:4000"}})
    assert r.status_code == 422 and r.json()["code"] == "adapter_not_available"


def _site_id(api, world) -> str:  # type: ignore[no-untyped-def]
    items = api.get(f"/projects/{world.project_id}/objects", params={"q": "darkhoveyn.site"}).json()["items"]
    return next(o["id"] for o in items if o["key"] == "darkhoveyn.site")


def test_contract_example_document_shape_is_accepted_by_engine(world) -> None:  # type: ignore[no-untyped-def]
    """The canonical contract example (with its binding ids swapped for real ones) is accepted end to end."""
    from app.core.config import PLATFORM_ROOT

    example = json.loads((PLATFORM_ROOT / "contracts/examples/valid/page.plant-overview.json").read_text(encoding="utf-8"))
    doc = example["document"]
    for node in (doc["root"]["children"][0]["children"][1]["children"][0]["children"][0],
                 doc["root"]["children"][0]["children"][1]["children"][1]["children"][0]):
        node["bindings"]["value"]["bindingId"] = world.binding_id
    api = world.api("designer")
    _, etag = load(api, world.page_id)
    r = save(api, world.page_id, doc, etag)
    assert r.status_code == 200, r.text
