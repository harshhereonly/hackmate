"""Conversations and messages.

Two kinds of conversation exist:
  * direct: exactly two people. Starting one requires the sender to be allowed
    to message the recipient (profile visibility plus the recipient's
    "who can message me" setting).
  * project: the team chat of a project. Participants always equal the
    project's current members, kept in sync by `sync_project_conversation`.

Read state is a per-participant "read up to" timestamp stored on the
conversation (`reads.<user_id>`).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from bson import ObjectId
from pymongo import ReturnDocument
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

from app.core.errors import AppError, bad_request, forbidden, not_found
from app.dependencies.auth import CurrentUser
from app.services.profiles import Viewer, summaries_for
from app.utils import parse_object_id, utcnow

PREVIEW_LENGTH = 120


def direct_key(a: ObjectId, b: ObjectId) -> str:
    first, second = sorted((str(a), str(b)))
    return f"{first}:{second}"


def sync_project_conversation(db: Database, project_id: ObjectId) -> None:
    """Make the team chat's participants match current membership (if the chat exists)."""
    member_ids = db.team_memberships.distinct("user_id", {"project_id": project_id})
    db.conversations.update_one(
        {"kind": "project", "project_id": project_id},
        {"$set": {"participant_ids": member_ids, "updated_at": utcnow()}},
    )


def delete_project_conversation(db: Database, project_id: ObjectId) -> None:
    conversation = db.conversations.find_one({"kind": "project", "project_id": project_id}, {"_id": 1})
    if conversation:
        db.messages.delete_many({"conversation_id": conversation["_id"]})
        db.conversations.delete_one({"_id": conversation["_id"]})


# --- Access -----------------------------------------------------------------

def get_for_participant(db: Database, conversation_id: str, user: CurrentUser) -> dict[str, Any]:
    conversation = db.conversations.find_one({"_id": parse_object_id(conversation_id, what="Conversation")})
    if not conversation or user.id not in conversation.get("participant_ids", []):
        raise not_found("Conversation not found.")
    return conversation


def send_permission(db: Database, conversation: dict[str, Any], user: CurrentUser) -> str | None:
    """Return None if `user` may send, else a reason."""
    if conversation["kind"] == "project":
        project = db.projects.find_one({"_id": conversation["project_id"]}, {"is_removed": 1})
        if not project or project.get("is_removed"):
            return "This project is no longer available."
        return None
    others = [uid for uid in conversation["participant_ids"] if uid != user.id]
    other = db.profiles.find_one({"user_id": others[0]}, {"is_active": 1}) if others else None
    if not other or not other.get("is_active", True):
        return "This person is no longer available."
    return None


# --- Creation ---------------------------------------------------------------

def _new_conversation(kind: str, participants: list[ObjectId], **extra: Any) -> dict[str, Any]:
    now = utcnow()
    return {"kind": kind, "participant_ids": participants, "created_at": now, "updated_at": now,
            "last_message_at": None, "last_message": None, "reads": {}, **extra}


def get_or_create_direct(db: Database, user: CurrentUser, handle: str) -> dict[str, Any]:
    profile = db.profiles.find_one({"handle": handle.strip().lower()})
    viewer = Viewer(db, user)
    if not profile or not viewer.can_view(profile):
        raise not_found("Person not found.")
    if profile["user_id"] == user.id:
        raise bad_request("You can't start a conversation with yourself.", code="invalid_recipient")
    key = direct_key(user.id, profile["user_id"])
    existing = db.conversations.find_one({"kind": "direct", "direct_key": key})
    if existing:
        return existing
    if not viewer.can_message(profile):
        raise forbidden(f"{profile['name']} only accepts messages from people they collaborate with.",
                        code="messaging_not_allowed")
    doc = _new_conversation("direct", [user.id, profile["user_id"]], direct_key=key)
    try:
        doc["_id"] = db.conversations.insert_one(doc).inserted_id
    except DuplicateKeyError:  # created concurrently
        return db.conversations.find_one({"kind": "direct", "direct_key": key})
    return doc


def get_or_create_project_chat(db: Database, user: CurrentUser, project: dict[str, Any]) -> dict[str, Any]:
    if not db.team_memberships.find_one({"project_id": project["_id"], "user_id": user.id}, {"_id": 1}):
        raise forbidden("Only team members can open the team chat.")
    existing = db.conversations.find_one({"kind": "project", "project_id": project["_id"]})
    if existing:
        return existing
    members = db.team_memberships.distinct("user_id", {"project_id": project["_id"]})
    doc = _new_conversation("project", members, project_id=project["_id"])
    try:
        doc["_id"] = db.conversations.insert_one(doc).inserted_id
    except DuplicateKeyError:
        return db.conversations.find_one({"kind": "project", "project_id": project["_id"]})
    return doc


# --- Messages -----------------------------------------------------------------

def send_message(db: Database, conversation: dict[str, Any], user: CurrentUser, body: str) -> dict[str, Any]:
    reason = send_permission(db, conversation, user)
    if reason:
        raise AppError(403, "cannot_send", reason)
    now = utcnow()
    message = {"conversation_id": conversation["_id"], "sender_id": user.id, "body": body,
               "deleted": False, "created_at": now}
    message["_id"] = db.messages.insert_one(message).inserted_id
    preview = body if len(body) <= PREVIEW_LENGTH else body[: PREVIEW_LENGTH - 1] + "…"
    db.conversations.update_one(
        {"_id": conversation["_id"]},
        {"$set": {"last_message_at": now, "updated_at": now,
                  "last_message": {"sender_id": user.id, "preview": preview, "created_at": now},
                  f"reads.{user.id}": now}},
    )
    return message


def mark_read(db: Database, conversation: dict[str, Any], user: CurrentUser) -> dict[str, Any]:
    return db.conversations.find_one_and_update(
        {"_id": conversation["_id"]}, {"$set": {f"reads.{user.id}": utcnow()}},
        return_document=ReturnDocument.AFTER,
    )


def delete_message(db: Database, conversation: dict[str, Any], user: CurrentUser, message_id: str) -> dict[str, Any]:
    oid = parse_object_id(message_id, what="Message")
    message = db.messages.find_one({"_id": oid, "conversation_id": conversation["_id"]})
    if not message:
        raise not_found("Message not found.")
    if message["sender_id"] != user.id:
        raise forbidden("You can only delete your own messages.")
    return db.messages.find_one_and_update(
        {"_id": oid}, {"$set": {"deleted": True, "body": "", "deleted_at": utcnow()}},
        return_document=ReturnDocument.AFTER,
    )


def _read_at(conversation: dict[str, Any], user_id: ObjectId) -> datetime | None:
    return (conversation.get("reads") or {}).get(str(user_id))


def unread_count(db: Database, conversation: dict[str, Any], user_id: ObjectId) -> int:
    last = conversation.get("last_message")
    if not last:
        return 0
    read_at = _read_at(conversation, user_id)
    if read_at is not None and read_at >= last["created_at"]:
        return 0  # sending a message also advances your own read marker
    query: dict[str, Any] = {"conversation_id": conversation["_id"], "sender_id": {"$ne": user_id},
                             "deleted": {"$ne": True}}
    if read_at is not None:
        query["created_at"] = {"$gt": read_at}
    return db.messages.count_documents(query)


# --- Serialization ----------------------------------------------------------

def to_out_many(db: Database, conversations: list[dict[str, Any]], user: CurrentUser) -> list[dict[str, Any]]:
    viewer = Viewer(db, user)
    people = summaries_for(db, viewer, {uid for c in conversations for uid in c["participant_ids"]})
    project_ids = [c["project_id"] for c in conversations if c["kind"] == "project"]
    projects = {p["_id"]: p for p in db.projects.find({"_id": {"$in": project_ids}}, {"title": 1})}
    out = []
    for conversation in conversations:
        others = [people[uid] for uid in conversation["participant_ids"] if uid != user.id]
        project = projects.get(conversation.get("project_id"))
        if conversation["kind"] == "project":
            title = f"{project['title']} team" if project else "Project team"
        else:
            title = others[0]["name"] if others else "Conversation"
        last = conversation.get("last_message")
        reason = send_permission(db, conversation, user)
        out.append({
            "id": str(conversation["_id"]),
            "kind": conversation["kind"],
            "title": title,
            "participants": [people[uid] for uid in conversation["participant_ids"]],
            "project": {"id": str(project["_id"]), "title": project["title"]} if project else None,
            "last_message": {"preview": last["preview"], "sender_is_me": last["sender_id"] == user.id,
                             "created_at": last["created_at"]} if last else None,
            "unread_count": unread_count(db, conversation, user.id),
            "can_send": reason is None,
            "cannot_send_reason": reason,
            "updated_at": conversation.get("last_message_at") or conversation["updated_at"],
        })
    return out


def messages_out(db: Database, conversation: dict[str, Any], messages: list[dict[str, Any]],
                 user: CurrentUser) -> list[dict[str, Any]]:
    people = summaries_for(db, Viewer(db, user), {m["sender_id"] for m in messages})
    reads = {uid: _read_at(conversation, uid) for uid in conversation["participant_ids"] if uid != user.id}
    out = []
    for message in messages:
        mine = message["sender_id"] == user.id
        seen_by = sum(1 for read_at in reads.values() if read_at and read_at >= message["created_at"]) if mine else 0
        out.append({
            "id": str(message["_id"]),
            "sender": people[message["sender_id"]],
            "is_mine": mine,
            "body": "" if message.get("deleted") else message["body"],
            "deleted": bool(message.get("deleted")),
            "created_at": message["created_at"],
            "seen_by": seen_by,
        })
    return out
