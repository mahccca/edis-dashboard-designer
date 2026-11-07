"""Operator CLI.

    python -m app.cli create-user --username admin --display-name "Admin" --platform-admin
        (password from IP_NEW_USER_PASSWORD or an interactive prompt; never a CLI argument)
    python -m app.cli seed-pilot --project-slug darkhoveyn --owner admin
        (Darkhoveyn pilot on a SIMULATED data source — every value is labelled test data)
"""

import argparse
import getpass
import os
import sys
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import new_session
from app.modules.components.service import KPI_CARD_DEFINITION_ID
from app.modules.data_bindings import service as bindings
from app.modules.data_sources import service as data_sources
from app.modules.data_sources.models import DataSource
from app.modules.design import service as design
from app.modules.design.models import Page
from app.modules.iam.models import User
from app.modules.iam.service import add_member, create_user
from app.modules.industrial_objects import service as objects
from app.modules.industrial_objects.models import IndustrialObject, ObjectType
from app.modules.projects.models import Project

SIM_SOURCE_NAME = "Darkhoveyn simulator (TEST DATA)"
INVERTERS = ["INV-01", "INV-02", "INV-03", "INV-04"]


def simulated_config() -> dict[str, Any]:
    signals = [
        {"path": "darkhoveyn/total/AC_POWER", "unit": "W", "kind": "power", "peak": 400000},
        {"path": "darkhoveyn/total/ENERGY_TODAY", "unit": "Wh", "kind": "energy_today", "peak": 400000},
    ]
    for inv in INVERTERS:
        base = f"Darkhoveyn/JB-01/{inv}"
        signals += [
            {"path": f"{base}/AC_POWER", "unit": "W", "kind": "power", "peak": 100000},
            {"path": f"{base}/PV_POWER", "unit": "W", "kind": "power", "peak": 104000},
            {"path": f"{base}/ENERGY_TODAY", "unit": "Wh", "kind": "energy_today", "peak": 100000},
        ]
    return {"utcOffsetMinutes": 210, "signals": signals}


SITE_TYPE = {
    "key": "solar.site", "schemaVersion": 1, "version": "1.0.0", "status": "published", "category": "site",
    "name": {"fa": "نیروگاه خورشیدی", "en": "PV plant"},
    "parameters": [{"key": "dc_capacity", "name": {"en": "DC capacity"}, "dataType": "number", "unit": "kWp", "quantity": "power", "minimum": 0}],
    "variables": [
        {"key": "ac_power", "name": {"fa": "توان AC کل", "en": "Total AC power"}, "dataType": "number", "unit": "kW", "quantity": "power", "access": "read"},
        {"key": "energy_today", "name": {"fa": "انرژی امروز", "en": "Energy today"}, "dataType": "number", "unit": "kWh", "quantity": "energy", "access": "read"},
    ],
}

INVERTER_TYPE = {
    "key": "solar.inverter", "schemaVersion": 1, "version": "1.0.0", "status": "published", "category": "inverter",
    "name": {"fa": "اینورتر", "en": "PV inverter"},
    "parameters": [
        {"key": "rated_ac_power", "name": {"en": "Rated AC power"}, "dataType": "number", "unit": "kW", "quantity": "power", "required": True, "minimum": 0},
    ],
    "variables": [
        {"key": "ac_power", "name": {"fa": "توان AC", "en": "AC power"}, "dataType": "number", "unit": "kW", "quantity": "power", "access": "read"},
        {"key": "pv_power", "name": {"fa": "توان DC", "en": "PV (DC) power"}, "dataType": "number", "unit": "kW", "quantity": "power", "access": "read"},
        {"key": "energy_today", "name": {"en": "Energy today"}, "dataType": "number", "unit": "kWh", "quantity": "energy", "access": "read"},
    ],
}


def _type(db: Session, project_id: uuid.UUID, spec: dict[str, Any]) -> uuid.UUID:
    existing = db.scalar(select(ObjectType).where(ObjectType.project_id == project_id, ObjectType.key == spec["key"]))
    return existing.id if existing else objects.create_type(db, project_id, spec)[0].id


def _object(db: Session, project_id: uuid.UUID, body: dict[str, Any]) -> uuid.UUID:
    existing = db.scalar(select(IndustrialObject).where(IndustrialObject.project_id == project_id, IndustrialObject.key == body["key"]))
    return existing.id if existing else objects.create_object(db, project_id, body).id


def seed_pilot(db: Session, slug: str, owner: User) -> dict[str, Any]:
    project = db.scalar(select(Project).where(Project.slug == slug))
    if project is None:
        project = Project(slug=slug, name="Darkhoveyn PV (pilot)", created_by=owner.id)
        db.add(project)
        db.flush()
        add_member(db, project.id, owner.id, "owner")
    ds = db.scalar(select(DataSource).where(DataSource.project_id == project.id, DataSource.name == SIM_SOURCE_NAME))
    if ds is None:
        ds = data_sources.create(db, project.id, {"name": SIM_SOURCE_NAME, "kind": "simulated", "config": simulated_config()})
    site_type = _type(db, project.id, SITE_TYPE)
    inv_type = _type(db, project.id, INVERTER_TYPE)

    def signal(path: str) -> dict[str, Any]:
        return {"kind": "data_source_signal", "dataSourceId": str(ds.id), "signal": path, "sourceUnit": "W" if "ENERGY" not in path else "Wh"}

    site = _object(db, project.id, {
        "typeId": str(site_type), "typeVersion": "1.0.0", "key": "darkhoveyn.site", "status": "active",
        "name": {"fa": "نیروگاه دارخوین", "en": "Darkhoveyn PV plant"}, "tags": ["site:darkhoveyn", "test-data"],
        "variableSources": {"ac_power": signal("darkhoveyn/total/AC_POWER"), "energy_today": signal("darkhoveyn/total/ENERGY_TODAY")},
    })
    for inv in INVERTERS:
        base = f"Darkhoveyn/JB-01/{inv}"
        _object(db, project.id, {
            "typeId": str(inv_type), "typeVersion": "1.0.0", "key": f"jb-01.{inv.lower()}", "status": "active",
            "name": {"en": f"JB-01 / {inv}"}, "parentId": str(site), "parameters": {"rated_ac_power": 100},
            "tags": ["site:darkhoveyn", "jb:01", "test-data"],
            "variableSources": {"ac_power": signal(f"{base}/AC_POWER"), "pv_power": signal(f"{base}/PV_POWER"),
                                "energy_today": signal(f"{base}/ENERGY_TODAY")},
        })
    binding = next((b for b in bindings.list_for(db, project.id) if b.name == "Plant total AC power"), None)
    if binding is None:
        binding = bindings.create(db, project.id, {
            "name": "Plant total AC power", "source": {"kind": "object_variable", "objectId": str(site), "variable": "ac_power"},
            "transform": {"toUnit": "kW", "decimals": 1}, "delivery": {"mode": "live", "staleAfterMs": 60000},
        })
    page = db.scalar(select(Page).where(Page.project_id == project.id, Page.path == "/plant/overview"))
    if page is None:
        page, doc = design.create_page(db, project.id, {
            "kind": "dashboard", "title": {"fa": "نمای کلی نیروگاه", "en": "Plant overview"},
            "slug": "plant-overview", "path": "/plant/overview", "document": pilot_document(str(binding.id)),
        }, owner)
        design.publish(db, page, doc, {"revisionNo": doc.head_revision_no, "note": "pilot seed"}, owner)
    return {"projectId": str(project.id), "dataSourceId": str(ds.id), "bindingId": str(binding.id), "pageId": str(page.document_id)}


def pilot_document(binding_id: str) -> dict[str, Any]:
    return {
        "schemaVersion": 1, "documentType": "dashboard", "settings": {"layout": "fluid", "direction": "rtl"},
        "root": {"id": "root", "type": "root", "children": [{
            "id": "sec-kpis", "type": "section", "children": [
                {"id": "hd-title", "type": "heading", "props": {"text": {"fa": "نمای کلی نیروگاه", "en": "Plant overview"}, "level": 1}},
                {"id": "row-kpis", "type": "row", "children": [{
                    "id": "col-ac", "type": "column", "style": {"columnSpan": 6}, "children": [{
                        "id": "kpi-ac-power", "type": "component",
                        "component": {"definitionId": str(KPI_CARD_DEFINITION_ID), "definitionKey": "industrial.kpi-card", "version": "1.2.0"},
                        "props": {"title": {"fa": "توان AC کل", "en": "Total AC power"}, "decimals": 1, "warnBelow": 50, "critBelow": 10},
                        "bindings": {"value": {"bindingId": binding_id, "fallback": None}},
                    }],
                }]},
            ],
        }]},
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    cu = sub.add_parser("create-user")
    cu.add_argument("--username", required=True)
    cu.add_argument("--display-name", required=True)
    cu.add_argument("--platform-admin", action="store_true")
    sp = sub.add_parser("seed-pilot")
    sp.add_argument("--project-slug", default="darkhoveyn")
    sp.add_argument("--owner", required=True, help="username that becomes project owner")
    args = parser.parse_args(argv)

    with new_session() as db:
        if args.cmd == "create-user":
            password = os.environ.get("IP_NEW_USER_PASSWORD") or getpass.getpass("Password: ")
            if len(password) < 12:
                print("password must be at least 12 characters", file=sys.stderr)
                return 2
            user = create_user(db, args.username, password, args.display_name, args.platform_admin)
            db.commit()
            print(f"created user {user.username} ({user.id})")
        else:
            owner = db.scalar(select(User).where(User.username == args.owner.lower()))
            if owner is None:
                print(f"unknown user {args.owner}", file=sys.stderr)
                return 2
            result = seed_pilot(db, args.project_slug, owner)
            db.commit()
            print("seeded pilot on SIMULATED TEST DATA:", result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
