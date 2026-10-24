"""Projects and team membership."""

from __future__ import annotations

from typing import Any

from bson import ObjectId
from pymongo import ReturnDocument
from pymongo.database import Database

from app.core.errors import bad_request, forbidden, not_found
from app.dependencies.auth import CurrentUser
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.services import notifications
from app.services.conversations import delete_project_conversation, sync_project_conversation
from app.services.profiles import Viewer, summaries_for
from app.services.taxonomy import skill_keys
from app.utils import parse_object_id, try_object_id, utcnow

STATUS_LABELS = {"recruiting": "recruiting", "active": "active", "completed": "completed"}


def project_link(project_id: ObjectId) -> str:
    return f"/projects/{project_id}"


def get_project(db: Database, project_id: str | ObjectId, viewer: Viewer | None = None) -> dict[str, Any]:
    """Load a project. Removed projects are visible only to their owner and admins."""
    oid = parse_object_id(project_id, what="Project")
    project = db.projects.find_one({"_id": oid})
    if not project:
        raise not_found("Project not found.")
    if project.get("is_removed"):
        allowed = viewer is not None and viewer.user is not None and (
            viewer.is_admin or viewer.user.id == project["owner_id"]
        )
        if not allowed:
            raise not_found("Project not found.")
    return project


def require_owner(project: dict[str, Any], user: CurrentUser) -> None:
    if project["owner_id"] != user.id:
        raise forbidden("Only the project owner can do that.")


def member_ids(db: Database, project_id: ObjectId) -> list[ObjectId]:
    return db.team_memberships.distinct("user_id", {"project_id": project_id})


def is_member(db: Database, project_id: ObjectId, user_id: ObjectId) -> bool:
    return db.team_memberships.find_one({"project_id": project_id, "user_id": user_id}, {"_id": 1}) is not None


# --- Serialization ----------------------------------------------------------

def to_list_item(project: dict[str, Any], owner_summary: dict[str, Any]) -> dict[str, Any]:
    member_count = project.get("member_count", 1)
    return {
        "id": str(project["_id"]),
        "title": project["title"],
        "summary": project["summary"],
        "required_skills": project.get("required_skills", []),
        "roles_needed": project.get("roles_needed", []),
        "preferred_experience": project.get("preferred_experience", "any"),
        "status": project["status"],
        "category": project["category"],
        "collaboration_mode": project["collaboration_mode"],
        "member_count": member_count,
        "max_team_size": project["max_team_size"],
        "open_spots": max(0, project["max_team_size"] - member_count),
        "owner": owner_summary,
        "created_at": project["created_at"],
        "updated_at": project["updated_at"],
        "is_removed": bool(project.get("is_removed")),
    }


def to_list_items(db: Database, viewer: Viewer, projects: list[dict[str, Any]]) -> list[dict[str, Any]]:
    owners = summaries_for(db, viewer, [p["owner_id"] for p in projects])
    return [to_list_item(p, owners[p["owner_id"]]) for p in projects]


def viewer_state(db: Database, project: dict[str, Any], viewer: Viewer) -> dict[str, Any]:
    state: dict[str, Any] = {"is_owner": False, "is_member": False, "request": None,
                             "can_request": False, "cannot_request_reason": None}
    if viewer.user is None:
        state["cannot_request_reason"] = "Sign in to request to join."
        return state
    uid = viewer.user.id
    state["is_owner"] = project["owner_id"] == uid
    state["is_member"] = is_member(db, project["_id"], uid)
    latest = db.join_requests.find_one({"project_id": project["_id"], "user_id": uid}, sort=[("created_at", -1)])
    if latest:
        state["request"] = {"id": str(latest["_id"]), "kind": latest["kind"], "status": latest["status"]}

    if state["is_owner"]:
        reason = "You own this project."
    elif state["is_member"]:
        reason = "You're already on this team."
    elif latest and latest["status"] == "pending":
        reason = "You already have a pending request." if latest["kind"] == "application" \
            else "You've been invited. Respond from your requests page."
    elif project.get("is_removed"):
        reason = "This project was removed by moderators."
    elif project["status"] != "recruiting":
        reason = f"This project is {STATUS_LABELS[project['status']]} and not recruiting."
    elif project.get("member_count", 1) >= project["max_team_size"]:
        reason = "This team is full."
    else:
        reason = None
    state["can_request"] = reason is None
    state["cannot_request_reason"] = reason
    return state


def to_detail(db: Database, project: dict[str, Any], viewer: Viewer) -> dict[str, Any]:
    owner = summaries_for(db, viewer, [project["owner_id"]])[project["owner_id"]]
    opportunity = None
    if project.get("opportunity_id"):
        opp = db.opportunities.find_one({"_id": project["opportunity_id"], "is_removed": {"$ne": True}},
                                        {"title": 1, "type": 1})
        if opp:
            opportunity = {"id": str(opp["_id"]), "title": opp["title"], "type": opp["type"]}
    return {
        **to_list_item(project, owner),
        "description": project["description"],
        "repo_url": project.get("repo_url"),
        "opportunity": opportunity,
        "viewer": viewer_state(db, project, viewer),
        "removed_reason": project.get("removed_reason"),
    }


# --- Mutations --------------------------------------------------------------

def _resolve_opportunity(db: Database, raw_id: str | None) -> ObjectId | None:
    if not raw_id:
        return None
    oid = try_object_id(raw_id)
    if not oid or not db.opportunities.find_one({"_id": oid, "is_removed": {"$ne": True}}, {"_id": 1}):
        raise bad_request("The linked opportunity does not exist.", code="invalid_opportunity")
    return oid


def create_project(db: Database, user: CurrentUser, data: ProjectCreate) -> dict[str, Any]:
    now = utcnow()
    doc = {
        **data.model_dump(exclude={"opportunity_id"}),
        "opportunity_id": _resolve_opportunity(db, data.opportunity_id),
        "skills_key": skill_keys(data.required_skills),
        "owner_id": user.id,
        "member_count": 1,
        "is_removed": False,
        "removed_reason": None,
        "is_demo": False,
        "created_at": now,
        "updated_at": now,
    }
    doc["_id"] = db.projects.insert_one(doc).inserted_id
    db.team_memberships.insert_one({
        "project_id": doc["_id"], "user_id": user.id, "role": "owner",
        "functional_role": None, "joined_at": now,
    })
    return doc


def update_project(db: Database, project: dict[str, Any], user: CurrentUser, data: ProjectUpdate) -> dict[str, Any]:
    require_owner(project, user)
    changes = data.model_dump(exclude_unset=True)
    for key in ("title", "summary", "description", "required_skills", "preferred_experience",
                "max_team_size", "status", "category", "collaboration_mode"):
        if key in changes and changes[key] is None:
            del changes[key]  # required fields cannot be cleared
    if "roles_needed" in changes and changes["roles_needed"] is None:
        changes["roles_needed"] = []
    if "opportunity_id" in changes:
        changes["opportunity_id"] = _resolve_opportunity(db, changes["opportunity_id"])
    if "required_skills" in changes:
        if not changes["required_skills"]:
            raise bad_request("Add at least one required skill.", code="validation_error")
        changes["skills_key"] = skill_keys(changes["required_skills"])
    if "max_team_size" in changes and changes["max_team_size"] < project.get("member_count", 1):
        raise bad_request(
            f"The team already has {project['member_count']} members. Remove members before shrinking the team.",
            code="team_size_too_small",
        )
    changes["updated_at"] = utcnow()
    query: dict[str, Any] = {"_id": project["_id"]}
    if "max_team_size" in changes:
        # Guard against a concurrent accept raising member_count past the new limit.
        query["member_count"] = {"$lte": changes["max_team_size"]}
    updated = db.projects.find_one_and_update(query, {"$set": changes}, return_document=ReturnDocument.AFTER)
    if not updated:
        raise bad_request("The team grew while you were editing. Reload and try again.", code="team_size_too_small")

    if "status" in changes and changes["status"] != project["status"]:
        others = [uid for uid in member_ids(db, project["_id"]) if uid != user.id]
        notifications.notify_many(
            db, others, "project_status_changed",
            f"{updated['title']} is now {STATUS_LABELS[updated['status']]}",
            link=project_link(project["_id"]),
        )
    return updated


def delete_project(db: Database, project: dict[str, Any], user: CurrentUser) -> None:
    require_owner(project, user)
    others = [uid for uid in member_ids(db, project["_id"]) if uid != user.id]
    pending_applicants = db.join_requests.distinct("user_id", {"project_id": project["_id"], "status": "pending"})
    db.team_memberships.delete_many({"project_id": project["_id"]})
    db.join_requests.delete_many({"project_id": project["_id"]})
    delete_project_conversation(db, project["_id"])
    db.projects.delete_one({"_id": project["_id"]})
    notifications.notify_many(
        db, others + [uid for uid in pending_applicants if uid not in others], "project_deleted",
        f"{project['title']} was deleted by its owner", link="/projects",
    )


def list_members(db: Database, project: dict[str, Any], viewer: Viewer) -> list[dict[str, Any]]:
    memberships = list(db.team_memberships.find({"project_id": project["_id"]}).sort("joined_at", 1))
    people = summaries_for(db, viewer, [m["user_id"] for m in memberships])
    return [
        {
            "person": people[m["user_id"]],
            "role": m["role"],
            "functional_role": m.get("functional_role"),
            "joined_at": m["joined_at"],
            "is_you": viewer.id == m["user_id"],
        }
        for m in memberships
    ]


def remove_member(db: Database, project: dict[str, Any], actor: CurrentUser, target_id: ObjectId) -> None:
    """Owners can remove members; members can remove themselves (leave). Owners cannot leave."""
    if target_id == project["owner_id"]:
        raise bad_request("The owner can't leave their own project. Delete it or keep it.", code="owner_cannot_leave")
    leaving = actor.id == target_id
    if not leaving:
        require_owner(project, actor)
    result = db.team_memberships.delete_one({"project_id": project["_id"], "user_id": target_id})
    if not result.deleted_count:
        raise not_found("That person isn't on this team.")
    db.projects.update_one({"_id": project["_id"]}, {"$inc": {"member_count": -1}, "$set": {"updated_at": utcnow()}})
    sync_project_conversation(db, project["_id"])

    name = (db.profiles.find_one({"user_id": target_id}, {"name": 1}) or {}).get("name", "A member")
    link = project_link(project["_id"])
    if leaving:
        notifications.notify(db, project["owner_id"], "member_left", f"{name} left {project['title']}", link=link)
    else:
        notifications.notify(db, target_id, "member_removed", f"You were removed from {project['title']}", link=link)
