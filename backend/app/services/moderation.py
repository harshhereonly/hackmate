"""Reports and moderation actions. Every admin action is written to `moderation_actions`."""

from __future__ import annotations

from typing import Any

from bson import ObjectId
from pymongo import ReturnDocument
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

from app.core.errors import bad_request, conflict, forbidden, not_found
from app.dependencies.auth import CurrentUser
from app.schemas.report import ReportCreate
from app.services import notifications
from app.services.auth_service import revoke_all_sessions
from app.services.profiles import Viewer
from app.utils import parse_object_id, try_object_id, utcnow


def record_action(db: Database, admin: CurrentUser, action: str, target_type: str, target_id: ObjectId | str,
                  target_label: str, reason: str | None = None, details: dict[str, Any] | None = None) -> None:
    db.moderation_actions.insert_one({
        "admin_id": admin.id,
        "action": action,
        "target_type": target_type,
        "target_id": str(target_id),
        "target_label": target_label[:200],
        "reason": reason,
        "details": details or {},
        "created_at": utcnow(),
    })


# --- Reports ------------------------------------------------------------------

def resolve_target(db: Database, viewer: Viewer, target_type: str, target_id: str) -> tuple[ObjectId, str]:
    """Return (object id, human label) for something the reporter is allowed to see."""
    if target_type == "user":
        profile = db.profiles.find_one({"handle": target_id.strip().lower()})
        if not profile or not viewer.can_view(profile):
            raise not_found("Person not found.")
        if profile["user_id"] == viewer.id:
            raise bad_request("You can't report yourself.", code="invalid_target")
        return profile["user_id"], profile["name"]
    oid = try_object_id(target_id)
    if oid is None:
        raise not_found("The reported item was not found.")
    if target_type == "project":
        doc = db.projects.find_one({"_id": oid, "is_removed": {"$ne": True}}, {"title": 1, "owner_id": 1})
        if not doc:
            raise not_found("Project not found.")
        if doc["owner_id"] == viewer.id:
            raise bad_request("You can't report your own project.", code="invalid_target")
        return oid, doc["title"]
    if target_type == "opportunity":
        doc = db.opportunities.find_one({"_id": oid, "is_removed": {"$ne": True}}, {"title": 1, "created_by": 1})
        if not doc:
            raise not_found("Opportunity not found.")
        return oid, doc["title"]
    message = db.messages.find_one({"_id": oid})
    conversation = db.conversations.find_one({"_id": message["conversation_id"]}, {"participant_ids": 1}) \
        if message else None
    # Only participants can report a message (and therefore only they can see it).
    if not message or not conversation or viewer.id not in conversation["participant_ids"]:
        raise not_found("Message not found.")
    if message["sender_id"] == viewer.id:
        raise bad_request("You can't report your own message.", code="invalid_target")
    return oid, f"Message: {message['body'][:60]}"


def create_report(db: Database, user: CurrentUser, data: ReportCreate) -> dict[str, Any]:
    target_oid, label = resolve_target(db, Viewer(db, user), data.target_type, data.target_id)
    doc = {
        "reporter_id": user.id,
        "target_type": data.target_type,
        "target_id": target_oid,
        "target_label": label[:200],
        "reason": data.reason,
        "details": data.details,
        "status": "open",
        "created_at": utcnow(),
        "resolved_at": None,
        "resolved_by": None,
        "resolution_note": None,
    }
    try:
        doc["_id"] = db.reports.insert_one(doc).inserted_id
    except DuplicateKeyError:
        raise conflict("You've already reported this. Our moderators will review it.", code="duplicate_report") from None
    return doc


def report_out(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(doc["_id"]), "target_type": doc["target_type"], "reason": doc["reason"],
        "details": doc.get("details") or "", "status": doc["status"], "created_at": doc["created_at"],
        "resolved_at": doc.get("resolved_at"), "target_label": doc.get("target_label") or "",
    }


def resolve_report(db: Database, admin: CurrentUser, report_id: str, resolution: str, note: str) -> dict[str, Any]:
    now = utcnow()
    doc = db.reports.find_one_and_update(
        {"_id": parse_object_id(report_id, what="Report"), "status": "open"},
        {"$set": {"status": resolution, "resolved_at": now, "resolved_by": admin.id, "resolution_note": note or None}},
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        existing = db.reports.find_one({"_id": parse_object_id(report_id, what="Report")}, {"_id": 1})
        if not existing:
            raise not_found("Report not found.")
        raise conflict("This report was already handled.", code="report_closed")
    record_action(db, admin, f"report_{resolution}", "report", doc["_id"], doc.get("target_label") or "", note or None)
    notifications.notify(db, doc["reporter_id"], "report_reviewed",
                         "A moderator reviewed your report",
                         body="Thanks for helping keep HackMate safe." if resolution == "resolved"
                         else "After review, no action was needed.")
    return doc


# --- Listings -------------------------------------------------------------------

_COLLECTIONS = {"project": "projects", "opportunity": "opportunities"}


def set_listing_removed(db: Database, admin: CurrentUser, kind: str, listing_id: str, removed: bool,
                        reason: str | None) -> dict[str, Any]:
    collection = db[_COLLECTIONS[kind]]
    oid = parse_object_id(listing_id, what=kind.capitalize())
    doc = collection.find_one_and_update(
        {"_id": oid},
        {"$set": {"is_removed": removed, "removed_reason": reason if removed else None, "updated_at": utcnow()}},
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise not_found(f"{kind.capitalize()} not found.")
    record_action(db, admin, f"{kind}_{'removed' if removed else 'restored'}", kind, oid, doc["title"], reason)
    owner = doc.get("owner_id") if kind == "project" else doc.get("created_by")
    if owner:
        title = f"Your {kind} “{doc['title']}” was {'removed by moderators' if removed else 'restored'}"
        notifications.notify(db, owner, f"listing_{'removed' if removed else 'restored'}", title,
                             body=reason or "", link=f"/{'projects' if kind == 'project' else 'opportunities'}/{oid}")
    return doc


def remove_message(db: Database, admin: CurrentUser, message_id: str, reason: str) -> None:
    oid = parse_object_id(message_id, what="Message")
    doc = db.messages.find_one_and_update(
        {"_id": oid}, {"$set": {"deleted": True, "body": "", "removed_by_moderator": True, "deleted_at": utcnow()}},
    )
    if not doc:
        raise not_found("Message not found.")
    record_action(db, admin, "message_removed", "message", oid, f"Message: {doc['body'][:60]}", reason)


# --- Accounts -------------------------------------------------------------------

def set_user_status(db: Database, admin: CurrentUser, user_id: str, suspend: bool, reason: str | None) -> dict[str, Any]:
    oid = parse_object_id(user_id, what="User")
    target = db.users.find_one({"_id": oid})
    if not target:
        raise not_found("User not found.")
    if oid == admin.id:
        raise bad_request("You can't change your own account status.", code="invalid_target")
    if suspend and target.get("role") == "admin":
        raise forbidden("Administrators can't be suspended from the admin panel. Demote them first with the CLI.")
    status = "suspended" if suspend else "active"
    updated = db.users.find_one_and_update(
        {"_id": oid},
        {"$set": {"status": status, "suspended_reason": reason if suspend else None, "updated_at": utcnow()}},
        return_document=ReturnDocument.AFTER,
    )
    # Suspended members disappear from the directory, matching and messaging.
    db.profiles.update_one({"user_id": oid}, {"$set": {"is_active": not suspend}})
    if suspend:
        revoke_all_sessions(db, oid)
    profile = db.profiles.find_one({"user_id": oid}, {"name": 1}) or {}
    record_action(db, admin, "user_suspended" if suspend else "user_reactivated", "user", oid,
                  profile.get("name") or target["email"], reason)
    return updated
