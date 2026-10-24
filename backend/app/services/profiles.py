"""Profiles: creation, privacy rules, serialization and updates."""

from __future__ import annotations

import secrets
from typing import Any, Iterable

from bson import ObjectId
from pymongo import ReturnDocument
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

from app.core.errors import bad_request, conflict, not_found
from app.dependencies.auth import CurrentUser
from app.schemas.profile import ProfileUpdate
from app.services.taxonomy import skill_keys, tag_keys
from app.utils import slugify, utcnow

SUMMARY_PROJECTION = {
    "user_id": 1, "handle": 1, "name": 1, "headline": 1, "background": 1, "experience_level": 1,
    "avatar_version": 1, "visibility": 1, "is_active": 1,
}


# --- Creation ---------------------------------------------------------------

def generate_handle(db: Database, name: str) -> str:
    base = slugify(name, max_length=20) or "member"
    if len(base) < 3:
        base = f"{base}-dev".strip("-")
    for _ in range(10):
        candidate = f"{base}-{secrets.token_hex(2)}"
        if not db.profiles.find_one({"handle": candidate}, {"_id": 1}):
            return candidate
    return f"{base}-{secrets.token_hex(4)}"


def new_profile_document(user_id: ObjectId, name: str, handle: str) -> dict[str, Any]:
    now = utcnow()
    return {
        "user_id": user_id,
        "handle": handle,
        "name": name,
        "headline": "",
        "bio": "",
        "institution": "",
        "background": "",
        "skills": [],
        "skills_key": [],
        "interests": [],
        "interests_key": [],
        "experience_level": None,
        "preferred_roles": [],
        "availability": None,
        "collaboration_mode": None,
        "github_url": None,
        "portfolio_url": None,
        "linkedin_url": None,
        # Private by default: signed-in members only, never anonymous visitors.
        "visibility": "members",
        "allow_messages": "everyone",
        "open_to_collaborate": True,
        "avatar_version": None,
        "is_active": True,
        "is_demo": False,
        "created_at": now,
        "updated_at": now,
    }


def handle_taken(db: Database, handle: str) -> bool:
    return db.profiles.find_one({"handle": handle.lower()}, {"_id": 1}) is not None


def create_profile(db: Database, user_id: ObjectId, name: str, handle: str | None = None) -> dict[str, Any]:
    if handle:  # a username the person chose: never silently replaced
        doc = new_profile_document(user_id, name, handle)
        db.profiles.insert_one(doc)  # DuplicateKeyError means the username was taken
        return doc
    for _ in range(5):
        doc = new_profile_document(user_id, name, generate_handle(db, name))
        try:
            db.profiles.insert_one(doc)
            return doc
        except DuplicateKeyError:
            if db.profiles.find_one({"user_id": user_id}, {"_id": 1}):
                raise
    raise RuntimeError("Could not allocate a unique handle")


# --- Privacy ----------------------------------------------------------------

def get_related_user_ids(db: Database, user_id: ObjectId) -> set[ObjectId]:
    """People `user_id` actually collaborates with: teammates, request counterparts, chat partners."""
    related: set[ObjectId] = set()
    project_ids = db.team_memberships.distinct("project_id", {"user_id": user_id})
    if project_ids:
        related.update(db.team_memberships.distinct("user_id", {"project_id": {"$in": project_ids}}))
    active = {"$ne": "withdrawn"}
    related.update(db.join_requests.distinct("user_id", {"owner_id": user_id, "status": active}))
    related.update(db.join_requests.distinct("owner_id", {"user_id": user_id, "status": active}))
    related.update(db.opportunity_applications.distinct("applicant_id", {"owner_id": user_id, "status": active}))
    related.update(db.opportunity_applications.distinct("owner_id", {"applicant_id": user_id, "status": active}))
    for conv in db.conversations.find({"kind": "direct", "participant_ids": user_id}, {"participant_ids": 1}):
        related.update(conv["participant_ids"])
    related.discard(user_id)
    return related


class Viewer:
    """Who is looking, with lazily computed collaboration relationships."""

    def __init__(self, db: Database, user: CurrentUser | None) -> None:
        self.db = db
        self.user = user
        self._related: set[ObjectId] | None = None

    @property
    def id(self) -> ObjectId | None:
        return self.user.id if self.user else None

    @property
    def is_admin(self) -> bool:
        return bool(self.user and self.user.is_admin)

    def related_ids(self) -> set[ObjectId]:
        if self._related is None:
            self._related = get_related_user_ids(self.db, self.user.id) if self.user else set()
        return self._related

    def can_view(self, profile: dict[str, Any]) -> bool:
        if self.user and (profile["user_id"] == self.user.id or self.user.is_admin):
            return True
        if not profile.get("is_active", True):
            return False
        visibility = profile.get("visibility", "members")
        if visibility == "public":
            return True
        if self.user is None:
            return False
        if visibility == "members":
            return True
        return profile["user_id"] in self.related_ids()

    def can_message(self, profile: dict[str, Any]) -> bool:
        if not self.user or profile["user_id"] == self.user.id or not profile.get("is_active", True):
            return False
        if not self.can_view(profile):
            return False
        if profile.get("allow_messages", "everyone") == "everyone":
            return True
        return profile["user_id"] in self.related_ids()


def avatar_url(profile: dict[str, Any]) -> str | None:
    version = profile.get("avatar_version")
    return f"/api/profiles/{profile['handle']}/avatar?v={version}" if version else None


def person_summary(profile: dict[str, Any]) -> dict[str, Any]:
    return {
        "handle": profile["handle"],
        "name": profile["name"],
        "avatar_url": avatar_url(profile),
        "headline": profile.get("headline") or profile.get("background") or None,
        "experience_level": profile.get("experience_level"),
        "is_private": False,
    }


def private_summary() -> dict[str, Any]:
    return {"handle": None, "name": "HackMate member", "avatar_url": None, "headline": None,
            "experience_level": None, "is_private": True}


def summaries_for(db: Database, viewer: Viewer, user_ids: Iterable[ObjectId]) -> dict[ObjectId, dict[str, Any]]:
    ids = list({uid for uid in user_ids if uid is not None})
    result: dict[ObjectId, dict[str, Any]] = {uid: private_summary() for uid in ids}
    if ids:
        for profile in db.profiles.find({"user_id": {"$in": ids}}, SUMMARY_PROJECTION):
            if viewer.can_view(profile):
                result[profile["user_id"]] = person_summary(profile)
    return result


# --- Serialization ----------------------------------------------------------

_COMPLETENESS_CHECKS = (
    ("Headline", lambda p: bool(p.get("headline"))),
    ("Bio", lambda p: bool(p.get("bio"))),
    ("At least 3 skills", lambda p: len(p.get("skills") or []) >= 3),
    ("Interests", lambda p: bool(p.get("interests"))),
    ("Experience level", lambda p: bool(p.get("experience_level"))),
    ("Preferred roles", lambda p: bool(p.get("preferred_roles"))),
    ("Availability", lambda p: bool(p.get("availability"))),
    ("Collaboration mode", lambda p: bool(p.get("collaboration_mode"))),
    ("College or background", lambda p: bool(p.get("institution") or p.get("background"))),
    ("A GitHub, portfolio or LinkedIn link",
     lambda p: bool(p.get("github_url") or p.get("portfolio_url") or p.get("linkedin_url"))),
    ("Profile photo", lambda p: bool(p.get("avatar_version"))),
)


def completeness(profile: dict[str, Any]) -> dict[str, Any]:
    missing = [label for label, check in _COMPLETENESS_CHECKS if not check(profile)]
    done = len(_COMPLETENESS_CHECKS) - len(missing) + 1  # the name always counts
    return {"percent": round(100 * done / (len(_COMPLETENESS_CHECKS) + 1)), "missing": missing}


def to_card(profile: dict[str, Any]) -> dict[str, Any]:
    return {
        "handle": profile["handle"],
        "name": profile["name"],
        "headline": profile.get("headline") or None,
        "avatar_url": avatar_url(profile),
        "institution": profile.get("institution") or None,
        "skills": profile.get("skills") or [],
        "interests": profile.get("interests") or [],
        "experience_level": profile.get("experience_level"),
        "preferred_roles": profile.get("preferred_roles") or [],
        "availability": profile.get("availability"),
        "collaboration_mode": profile.get("collaboration_mode"),
        "open_to_collaborate": profile.get("open_to_collaborate", True),
    }


def to_public(profile: dict[str, Any], viewer: Viewer) -> dict[str, Any]:
    return {
        **to_card(profile),
        "bio": profile.get("bio") or None,
        "background": profile.get("background") or None,
        "github_url": profile.get("github_url"),
        "portfolio_url": profile.get("portfolio_url"),
        "linkedin_url": profile.get("linkedin_url"),
        "joined_at": profile["created_at"],
        "is_self": viewer.id == profile["user_id"],
        "can_message": viewer.can_message(profile),
    }


def to_me(profile: dict[str, Any], viewer: Viewer) -> dict[str, Any]:
    return {
        **to_public(profile, viewer),
        "visibility": profile.get("visibility", "members"),
        "allow_messages": profile.get("allow_messages", "everyone"),
        "completeness": completeness(profile),
    }


# --- Queries and updates ----------------------------------------------------

def get_profile_by_user(db: Database, user_id: ObjectId) -> dict[str, Any]:
    profile = db.profiles.find_one({"user_id": user_id})
    if not profile:
        raise not_found("Profile not found.")
    return profile


def get_visible_profile(db: Database, handle: str, viewer: Viewer) -> dict[str, Any]:
    profile = db.profiles.find_one({"handle": handle.lower()})
    # Profiles the viewer may not see are indistinguishable from missing ones.
    if not profile or not viewer.can_view(profile):
        raise not_found("Profile not found.")
    return profile


_NON_NULLABLE = {"visibility", "allow_messages", "open_to_collaborate", "handle"}


def update_profile(db: Database, user_id: ObjectId, update: ProfileUpdate) -> dict[str, Any]:
    data = update.model_dump(exclude_unset=True)
    if "name" in data and not data["name"]:
        raise bad_request("Name is required.", code="validation_error")
    for key in _NON_NULLABLE:
        if key in data and data[key] is None:
            del data[key]
    for list_field in ("skills", "interests", "preferred_roles"):
        if list_field in data and data[list_field] is None:
            data[list_field] = []
    for text_field in ("headline", "bio", "institution", "background"):
        if text_field in data and data[text_field] is None:
            data[text_field] = ""
    if "handle" in data and db.profiles.find_one({"handle": data["handle"], "user_id": {"$ne": user_id}}, {"_id": 1}):
        raise conflict("That handle is already taken.", code="handle_taken")
    if "skills" in data:
        data["skills_key"] = skill_keys(data["skills"])
    if "interests" in data:
        data["interests_key"] = tag_keys(data["interests"])
    data["updated_at"] = utcnow()
    try:
        profile = db.profiles.find_one_and_update(
            {"user_id": user_id}, {"$set": data}, return_document=ReturnDocument.AFTER
        )
    except DuplicateKeyError:
        raise conflict("That handle is already taken.", code="handle_taken") from None
    if not profile:
        raise not_found("Profile not found.")
    return profile
