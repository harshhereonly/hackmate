"""Applications to community research/collaboration posts (when the poster enables them)."""

from __future__ import annotations

from typing import Any

from pymongo import ReturnDocument
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

from app.core.errors import conflict, forbidden, not_found
from app.dependencies.auth import CurrentUser
from app.services import notifications
from app.services.opportunities.catalog import viewer_state
from app.services.profiles import Viewer, summaries_for
from app.utils import parse_object_id, utcnow

LINK = "/opportunities/applications"


def _name(db: Database, user_id) -> str:
    profile = db.profiles.find_one({"user_id": user_id}, {"name": 1})
    return profile["name"] if profile else "A member"


def apply(db: Database, opportunity: dict[str, Any], user: CurrentUser, message: str) -> dict[str, Any]:
    state = viewer_state(db, opportunity, Viewer(db, user), saved=False)
    if not state["can_apply"]:
        raise conflict(state["cannot_apply_reason"] or "This opportunity isn't accepting applications.",
                       code="cannot_apply")
    now = utcnow()
    doc = {
        "opportunity_id": opportunity["_id"],
        "owner_id": opportunity["created_by"],
        "applicant_id": user.id,
        "message": message,
        "status": "pending",
        "created_at": now,
        "updated_at": now,
        "decided_at": None,
    }
    try:
        doc["_id"] = db.opportunity_applications.insert_one(doc).inserted_id
    except DuplicateKeyError:
        raise conflict("You've already applied.", code="duplicate_application") from None
    notifications.notify(db, opportunity["created_by"], "application_received",
                         f"{_name(db, user.id)} applied to {opportunity['title']}",
                         body=message[:200], link=f"{LINK}?box=incoming")
    return doc


def get_for_party(db: Database, application_id: str, user: CurrentUser) -> dict[str, Any]:
    doc = db.opportunity_applications.find_one({"_id": parse_object_id(application_id, what="Application")})
    if not doc or user.id not in (doc["owner_id"], doc["applicant_id"]):
        raise not_found("Application not found.")
    return doc


def _transition(db: Database, doc: dict[str, Any], status: str) -> dict[str, Any]:
    now = utcnow()
    updated = db.opportunity_applications.find_one_and_update(
        {"_id": doc["_id"], "status": "pending"},
        {"$set": {"status": status, "decided_at": now, "updated_at": now}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise conflict("This application was already handled.", code="application_not_pending")
    return updated


def decide(db: Database, doc: dict[str, Any], actor: CurrentUser, accept: bool) -> dict[str, Any]:
    if doc["owner_id"] != actor.id:
        raise forbidden("Only the person who posted this opportunity can decide.")
    updated = _transition(db, doc, "accepted" if accept else "declined")
    opportunity = db.opportunities.find_one({"_id": doc["opportunity_id"]}, {"title": 1}) or {"title": "an opportunity"}
    verb = "accepted" if accept else "declined"
    notifications.notify(db, doc["applicant_id"], f"application_{verb}",
                         f"Your application to {opportunity['title']} was {verb}",
                         link=f"/opportunities/{doc['opportunity_id']}")
    return updated


def withdraw(db: Database, doc: dict[str, Any], actor: CurrentUser) -> dict[str, Any]:
    if doc["applicant_id"] != actor.id:
        raise forbidden("Only the applicant can withdraw.")
    return _transition(db, doc, "withdrawn")


def to_out_many(db: Database, docs: list[dict[str, Any]], user: CurrentUser) -> list[dict[str, Any]]:
    viewer = Viewer(db, user)
    opportunities = {o["_id"]: o for o in db.opportunities.find(
        {"_id": {"$in": list({d["opportunity_id"] for d in docs})}}, {"title": 1, "type": 1})}
    counterparts = [d["applicant_id"] if d["owner_id"] == user.id else d["owner_id"] for d in docs]
    people = summaries_for(db, viewer, counterparts)
    out = []
    for doc, counterpart in zip(docs, counterparts):
        incoming = doc["owner_id"] == user.id
        opp = opportunities.get(doc["opportunity_id"])
        pending = doc["status"] == "pending"
        out.append({
            "id": str(doc["_id"]),
            "status": doc["status"],
            "direction": "incoming" if incoming else "outgoing",
            "message": doc.get("message") or "",
            "opportunity": {"id": str(opp["_id"]), "title": opp["title"], "type": opp["type"]} if opp else None,
            "person": people[counterpart],
            "created_at": doc["created_at"],
            "decided_at": doc.get("decided_at"),
            "can_decide": incoming and pending,
            "can_withdraw": (not incoming) and pending,
        })
    return out
