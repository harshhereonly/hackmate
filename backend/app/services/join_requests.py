"""Join request lifecycle: applications (person -> project) and invitations (owner -> person).

Each request has one decider (who may accept or reject) and one initiator
(who may withdraw):

    kind          initiator    decider
    application   applicant    project owner
    invitation    owner        invited person

Accepting reserves a seat with an atomic conditional increment, so a team can
never exceed max_team_size even when two people accept at the same time.
"""

from __future__ import annotations

from typing import Any

from bson import ObjectId
from pymongo import ReturnDocument
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

from app.core.errors import AppError, bad_request, conflict, forbidden, not_found
from app.dependencies.auth import CurrentUser
from app.schemas.request import InvitationCreate, JoinRequestCreate
from app.services import notifications
from app.services.conversations import sync_project_conversation
from app.services.profiles import Viewer, summaries_for
from app.services.projects import is_member, member_ids, project_link, require_owner, viewer_state
from app.utils import parse_object_id, utcnow

REQUESTS_LINK = "/requests"


def decider_id(request: dict[str, Any]) -> ObjectId:
    return request["owner_id"] if request["kind"] == "application" else request["user_id"]


def initiator_id(request: dict[str, Any]) -> ObjectId:
    return request["user_id"] if request["kind"] == "application" else request["owner_id"]


def _name(db: Database, user_id: ObjectId) -> str:
    profile = db.profiles.find_one({"user_id": user_id}, {"name": 1})
    return profile["name"] if profile else "A member"


def _new_request(project: dict[str, Any], user_id: ObjectId, kind: str, message: str, role: str | None) -> dict:
    now = utcnow()
    return {
        "project_id": project["_id"],
        "owner_id": project["owner_id"],
        "user_id": user_id,
        "kind": kind,
        "status": "pending",
        "message": message or "",
        "role": role,
        "created_at": now,
        "updated_at": now,
        "decided_at": None,
        "decided_by": None,
        "decision_note": None,
    }


def create_application(db: Database, project: dict[str, Any], user: CurrentUser,
                       data: JoinRequestCreate) -> dict[str, Any]:
    state = viewer_state(db, project, Viewer(db, user))
    if not state["can_request"]:
        raise conflict(state["cannot_request_reason"] or "You can't request to join this project.",
                       code="cannot_request")
    doc = _new_request(project, user.id, "application", data.message, data.role)
    try:
        doc["_id"] = db.join_requests.insert_one(doc).inserted_id
    except DuplicateKeyError:
        raise conflict("You already have a pending request for this project.", code="duplicate_request") from None
    notifications.notify(
        db, project["owner_id"], "request_received",
        f"{_name(db, user.id)} asked to join {project['title']}",
        body=(data.message or "")[:200], link=f"{REQUESTS_LINK}?box=incoming",
    )
    return doc


def create_invitation(db: Database, project: dict[str, Any], owner: CurrentUser,
                      data: InvitationCreate) -> dict[str, Any]:
    require_owner(project, owner)
    if project.get("is_removed"):
        raise conflict("This project was removed by moderators.", code="project_removed")
    if project["status"] == "completed":
        raise conflict("Completed projects can't invite new members.", code="project_completed")
    if project.get("member_count", 1) >= project["max_team_size"]:
        raise conflict("This team is full. Increase the team size first.", code="team_full")

    viewer = Viewer(db, owner)
    profile = db.profiles.find_one({"handle": data.handle.strip().lower()})
    if not profile or not viewer.can_view(profile) or not profile.get("is_active", True):
        raise not_found("Person not found.")
    if profile["user_id"] == owner.id:
        raise bad_request("You're already on this team.", code="invalid_invitee")
    if is_member(db, project["_id"], profile["user_id"]):
        raise conflict(f"{profile['name']} is already on this team.", code="already_member")
    if not profile.get("open_to_collaborate", True):
        raise conflict(f"{profile['name']} isn't open to new collaborations right now.", code="not_open")

    doc = _new_request(project, profile["user_id"], "invitation", data.message, data.role)
    try:
        doc["_id"] = db.join_requests.insert_one(doc).inserted_id
    except DuplicateKeyError:
        raise conflict(f"There's already a pending request or invitation between you and {profile['name']}.",
                       code="duplicate_request") from None
    notifications.notify(
        db, profile["user_id"], "invitation_received",
        f"{_name(db, owner.id)} invited you to join {project['title']}",
        body=(data.message or "")[:200], link=f"{REQUESTS_LINK}?box=incoming",
    )
    return doc


def get_request_for_party(db: Database, request_id: str, user: CurrentUser) -> dict[str, Any]:
    request = db.join_requests.find_one({"_id": parse_object_id(request_id, what="Request")})
    if not request or user.id not in (request["owner_id"], request["user_id"]):
        raise not_found("Request not found.")
    return request


def _ensure_pending(request: dict[str, Any]) -> None:
    if request["status"] != "pending":
        raise conflict(f"This request was already {request['status']}.", code="request_not_pending")


def _transition(db: Database, request: dict[str, Any], status: str, actor: CurrentUser,
                note: str | None = None) -> dict[str, Any]:
    now = utcnow()
    updated = db.join_requests.find_one_and_update(
        {"_id": request["_id"], "status": "pending"},
        {"$set": {"status": status, "decided_at": now, "decided_by": actor.id,
                  "decision_note": note or None, "updated_at": now}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise conflict("This request was already handled.", code="request_not_pending")
    return updated


def accept(db: Database, request: dict[str, Any], actor: CurrentUser) -> dict[str, Any]:
    if decider_id(request) != actor.id:
        who = "the project owner" if request["kind"] == "application" else "the invited person"
        raise forbidden(f"Only {who} can accept this.")
    _ensure_pending(request)
    project = db.projects.find_one({"_id": request["project_id"]})
    if not project or project.get("is_removed"):
        raise conflict("This project is no longer available.", code="project_unavailable")
    if project["status"] == "completed":
        raise conflict("This project is completed and no longer adding members.", code="project_completed")

    updated = _transition(db, request, "accepted", actor)
    now = utcnow()
    seat = db.projects.find_one_and_update(
        {"_id": project["_id"], "is_removed": {"$ne": True},
         "$expr": {"$lt": ["$member_count", "$max_team_size"]}},
        {"$inc": {"member_count": 1}, "$set": {"updated_at": now}},
        return_document=ReturnDocument.AFTER,
    )
    if not seat:
        db.join_requests.update_one(
            {"_id": request["_id"], "status": "accepted"},
            {"$set": {"status": "pending", "decided_at": None, "decided_by": None, "updated_at": now}},
        )
        raise AppError(409, "team_full", "The team is full. Increase the team size or remove a member first.")
    try:
        db.team_memberships.insert_one({
            "project_id": project["_id"], "user_id": request["user_id"], "role": "member",
            "functional_role": request.get("role"), "joined_at": now, "request_id": request["_id"],
        })
    except DuplicateKeyError:
        db.projects.update_one({"_id": project["_id"]}, {"$inc": {"member_count": -1}})  # already a member
    sync_project_conversation(db, project["_id"])

    newcomer = _name(db, request["user_id"])
    link = project_link(project["_id"])
    if request["kind"] == "application":
        notifications.notify(db, request["user_id"], "request_accepted",
                             f"You're in! Your request to join {project['title']} was accepted", link=link)
    else:
        notifications.notify(db, project["owner_id"], "invitation_accepted",
                             f"{newcomer} accepted your invitation to {project['title']}", link=link)
    teammates = [uid for uid in member_ids(db, project["_id"])
                 if uid not in (request["user_id"], project["owner_id"])]
    notifications.notify_many(db, teammates, "member_joined", f"{newcomer} joined {project['title']}", link=link)
    return updated


def reject(db: Database, request: dict[str, Any], actor: CurrentUser, note: str | None) -> dict[str, Any]:
    if decider_id(request) != actor.id:
        who = "the project owner" if request["kind"] == "application" else "the invited person"
        raise forbidden(f"Only {who} can decline this.")
    _ensure_pending(request)
    updated = _transition(db, request, "rejected", actor, note)
    project = db.projects.find_one({"_id": request["project_id"]}, {"title": 1}) or {"title": "the project"}
    if request["kind"] == "application":
        notifications.notify(db, request["user_id"], "request_rejected",
                             f"Your request to join {project['title']} was declined",
                             body=note or "", link=f"{REQUESTS_LINK}?box=outgoing")
    else:
        notifications.notify(db, request["owner_id"], "invitation_declined",
                             f"{_name(db, request['user_id'])} declined your invitation to {project['title']}",
                             link=f"{REQUESTS_LINK}?box=outgoing")
    return updated


def withdraw(db: Database, request: dict[str, Any], actor: CurrentUser) -> dict[str, Any]:
    if initiator_id(request) != actor.id:
        raise forbidden("Only the person who sent this can withdraw it.")
    _ensure_pending(request)
    updated = _transition(db, request, "withdrawn", actor)
    project = db.projects.find_one({"_id": request["project_id"]}, {"title": 1}) or {"title": "the project"}
    if request["kind"] == "application":
        notifications.notify(db, request["owner_id"], "request_withdrawn",
                             f"{_name(db, request['user_id'])} withdrew their request to join {project['title']}",
                             link=f"{REQUESTS_LINK}?box=incoming")
    else:
        notifications.notify(db, request["user_id"], "invitation_withdrawn",
                             f"The invitation to join {project['title']} was withdrawn",
                             link=f"{REQUESTS_LINK}?box=incoming")
    return updated


# --- Serialization ----------------------------------------------------------

def to_out_many(db: Database, requests: list[dict[str, Any]], user: CurrentUser) -> list[dict[str, Any]]:
    viewer = Viewer(db, user)
    project_ids = list({r["project_id"] for r in requests})
    projects = {p["_id"]: p for p in db.projects.find(
        {"_id": {"$in": project_ids}}, {"title": 1, "status": 1, "member_count": 1, "max_team_size": 1})}
    counterparts = [r["user_id"] if r["owner_id"] == user.id else r["owner_id"] for r in requests]
    people = summaries_for(db, viewer, counterparts)
    out = []
    for request, counterpart in zip(requests, counterparts):
        incoming = decider_id(request) == user.id
        project = projects.get(request["project_id"])
        pending = request["status"] == "pending"
        out.append({
            "id": str(request["_id"]),
            "kind": request["kind"],
            "status": request["status"],
            "direction": "incoming" if incoming else "outgoing",
            "message": request.get("message") or "",
            "role": request.get("role"),
            "project": {
                "id": str(project["_id"]), "title": project["title"], "status": project["status"],
                "member_count": project.get("member_count", 1), "max_team_size": project["max_team_size"],
            } if project else None,
            "person": people[counterpart],
            "created_at": request["created_at"],
            "decided_at": request.get("decided_at"),
            "decision_note": request.get("decision_note"),
            "can_decide": incoming and pending,
            "can_withdraw": (not incoming) and pending,
        })
    return out


def box_query(user_id: ObjectId, box: str) -> dict[str, Any]:
    if box == "incoming":
        return {"$or": [{"owner_id": user_id, "kind": "application"}, {"user_id": user_id, "kind": "invitation"}]}
    return {"$or": [{"user_id": user_id, "kind": "application"}, {"owner_id": user_id, "kind": "invitation"}]}
