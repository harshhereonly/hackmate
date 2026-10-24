"""Builds candidate pools from MongoDB and ranks them with the pure scoring functions."""

from __future__ import annotations

from typing import Any

from bson import ObjectId
from pymongo.database import Database

from app.core.errors import forbidden
from app.dependencies.auth import CurrentUser
from app.services import profiles as profile_service
from app.services.matching.scoring import (
    Person,
    TeamNeed,
    score_for_project,
    score_opportunity,
    score_teammate,
)
from app.services.opportunities.catalog import timing_query, timing_status
from app.services.taxonomy import domains_for_roles, domains_for_skills, skill_keys, tag_keys
from app.utils import utcnow

METHOD = "rule_based"
METHOD_DESCRIPTION = (
    "Rule-based, explainable scoring (no AI model). Points come from covering your team's missing skills, "
    "complementary expertise, role fit, shared interests, experience, availability and collaboration mode. "
    "The weights are documented in docs/MATCHING.md."
)
VISIBLE_PROFILES = {"is_active": True, "visibility": {"$in": ["public", "members"]}}
POOL_LIMIT = 300
MIN_POOL = 40


def _pool(db: Database, exclude: set[ObjectId], prefilter: list[dict[str, Any]]) -> list[dict[str, Any]]:
    base = {**VISIBLE_PROFILES, "open_to_collaborate": True, "user_id": {"$nin": list(exclude)}}
    docs: list[dict[str, Any]] = []
    if prefilter:
        docs = list(db.profiles.find({**base, "$or": prefilter}).limit(POOL_LIMIT))
    if len(docs) < MIN_POOL:  # widen with recently active members so sparse data still gets suggestions
        seen = [d["_id"] for d in docs]
        docs += list(db.profiles.find({**base, "_id": {"$nin": seen}}).sort("updated_at", -1).limit(100))
    return docs


def _suggestion(profile: dict[str, Any], score) -> dict[str, Any]:
    return {
        "person": profile_service.to_card(profile),
        "score": score.total,
        "confidence": score.confidence,
        "reasons": score.reasons,
        "cautions": score.cautions,
        "breakdown": score.breakdown,
    }


def _ranked(scored: list[tuple[dict[str, Any], Any]], limit: int) -> list[dict[str, Any]]:
    scored = [pair for pair in scored if pair[1].total > 0]
    scored.sort(key=lambda pair: (-pair[1].total, pair[0]["name"].lower()))
    return [_suggestion(profile, score) for profile, score in scored[:limit]]


def _response(items: list[dict[str, Any]], notice: str | None = None) -> dict[str, Any]:
    return {"items": items, "method": METHOD, "method_description": METHOD_DESCRIPTION, "notice": notice}


def _my_profile(db: Database, user: CurrentUser) -> dict[str, Any]:
    return profile_service.get_profile_by_user(db, user.id)


# --- Project -> candidates ----------------------------------------------------

def project_need(db: Database, project: dict[str, Any]) -> tuple[TeamNeed, set[ObjectId]]:
    memberships = list(db.team_memberships.find({"project_id": project["_id"]}))
    member_ids = {m["user_id"] for m in memberships}
    member_profiles = list(db.profiles.find({"user_id": {"$in": list(member_ids)}}))
    team_skills: set[str] = set()
    team_roles: set[str] = {m["functional_role"] for m in memberships if m.get("functional_role")}
    owner_profile: dict[str, Any] = {}
    for profile in member_profiles:
        team_skills |= set(skill_keys(profile.get("skills")))
        team_roles |= set(profile.get("preferred_roles") or [])
        if profile["user_id"] == project["owner_id"]:
            owner_profile = profile
    required = project.get("required_skills") or []
    need = TeamNeed(
        required_skills=set(skill_keys(required)),
        required_names=dict(zip(skill_keys(required), required)),
        team_skills=team_skills,
        team_roles=team_roles,
        roles_needed=set(project.get("roles_needed") or []),
        interests=set(tag_keys((owner_profile.get("interests") or []) + [project["category"].replace("_", " ")])),
        preferred_experience=project.get("preferred_experience", "any"),
        availability=owner_profile.get("availability"),
        mode=project.get("collaboration_mode"),
    )
    return need, member_ids


def candidates_for_project(db: Database, project: dict[str, Any], user: CurrentUser, limit: int) -> dict[str, Any]:
    need, member_ids = project_need(db, project)
    if user.id not in member_ids and not user.is_admin:
        raise forbidden("Only this project's team can see candidate suggestions.")
    pending = set(db.join_requests.distinct("user_id", {"project_id": project["_id"], "status": "pending"}))
    prefilter: list[dict[str, Any]] = [{"skills_key": {"$in": sorted(need.required_skills)}}]
    if need.roles_needed:
        prefilter.append({"preferred_roles": {"$in": sorted(need.roles_needed)}})
    if need.interests:
        prefilter.append({"interests_key": {"$in": sorted(need.interests)}})
    pool = _pool(db, member_ids | pending, prefilter)
    scored = [(p, score_for_project(need, Person.from_profile(p))) for p in pool]
    notice = None
    if not need.missing_skills:
        notice = ("Your team already covers every required skill, so suggestions focus on complementary "
                  "expertise, roles and fit.")
    return _response(_ranked(scored, limit), notice)


# --- User -> teammates ------------------------------------------------------------

def teammates_for_user(db: Database, user: CurrentUser, limit: int) -> dict[str, Any]:
    profile = _my_profile(db, user)
    me = Person.from_profile(profile)
    teammates = set(db.team_memberships.distinct("user_id", {
        "project_id": {"$in": db.team_memberships.distinct("project_id", {"user_id": user.id})}}))
    exclude = {user.id} | teammates

    if not me.skills and not me.interests and not me.roles:
        # Transparent fallback: no profile signals means no meaningful score to compute.
        docs = list(db.profiles.find({**VISIBLE_PROFILES, "open_to_collaborate": True,
                                      "user_id": {"$nin": list(exclude)}}).sort("updated_at", -1).limit(limit))
        items = [{"person": profile_service.to_card(d), "score": None, "confidence": "low",
                  "reasons": ["Recently active member"], "cautions": [], "breakdown": []} for d in docs]
        return _response(items, "Add skills, interests and preferred roles to your profile to get scored, "
                                "explained suggestions. Showing recently active members for now.")

    # Owned recruiting projects tell us which expertise the user is actively missing.
    extra_domains: set[str] = set()
    for project in db.projects.find({"owner_id": user.id, "status": "recruiting", "is_removed": {"$ne": True}}):
        extra_domains |= domains_for_skills(skill_keys(project.get("required_skills"))) | \
            domains_for_roles(project.get("roles_needed") or [])
    complementary_roles = [role for role in ("frontend", "backend", "fullstack", "mobile", "ml", "data", "design",
                                             "devops", "security", "blockchain", "hardware", "research", "product")
                           if not domains_for_roles([role]) <= me.domains]
    prefilter: list[dict[str, Any]] = []
    if me.interests:
        prefilter.append({"interests_key": {"$in": sorted(me.interests)}})
    if complementary_roles:
        prefilter.append({"preferred_roles": {"$in": complementary_roles}})
    pool = _pool(db, exclude, prefilter)
    scored = [(p, score_teammate(me, Person.from_profile(p), extra_domains)) for p in pool]
    notice = None
    if me.information_level() == "low":
        notice = "Your profile has limited information. Add more details for more accurate suggestions."
    return _response(_ranked(scored, limit), notice)


def teammates_for_opportunity(db: Database, opportunity: dict[str, Any], user: CurrentUser,
                              limit: int) -> dict[str, Any]:
    profile = _my_profile(db, user)
    me = Person.from_profile(profile)
    skills = opportunity.get("skills") or []
    need = TeamNeed(
        required_skills=set(skill_keys(skills)),
        required_names=dict(zip(skill_keys(skills), skills)),
        team_skills=me.skills,
        team_roles=me.roles,
        interests=set(tag_keys(opportunity.get("tags"))) | me.interests,
        availability=me.availability,
        mode="remote" if opportunity.get("mode") == "online" else opportunity.get("mode"),
    )
    prefilter: list[dict[str, Any]] = []
    if need.required_skills:
        prefilter.append({"skills_key": {"$in": sorted(need.required_skills)}})
    if need.interests:
        prefilter.append({"interests_key": {"$in": sorted(need.interests)}})
    pool = _pool(db, {user.id}, prefilter)
    scored = [(p, score_for_project(need, Person.from_profile(p))) for p in pool]
    notice = None if skills else "This listing has no skills listed, so suggestions rely on interests and fit."
    return _response(_ranked(scored, limit), notice)


# --- User -> opportunities -------------------------------------------------------

def opportunities_for_user(db: Database, user: CurrentUser, limit: int) -> dict[str, Any]:
    me = Person.from_profile(_my_profile(db, user))
    now = utcnow()
    items: list[tuple[dict[str, Any], Any]] = []

    query = {"$and": [{"is_removed": {"$ne": True}}, timing_query("active", now),
                      {"created_by": {"$ne": user.id}}]}
    for doc in db.opportunities.find(query).limit(POOL_LIMIT):
        skills = doc.get("skills") or []
        days = (doc["deadline"] - now).days if doc.get("deadline") else None
        timing = timing_status(doc, now)
        score = score_opportunity(me, set(skill_keys(skills)), dict(zip(skill_keys(skills), skills)),
                                  set(tag_keys(doc.get("tags"))), set(tag_keys(doc["title"].split())),
                                  doc.get("mode"), timing, days)
        items.append(({
            "kind": "opportunity", "id": str(doc["_id"]), "title": doc["title"], "summary": doc["summary"],
            "type": doc["type"], "path": f"/opportunities/{doc['_id']}", "timing": timing,
            "is_demo": bool(doc.get("is_demo")),
        }, score))

    my_projects = db.team_memberships.distinct("project_id", {"user_id": user.id})
    project_query = {"status": "recruiting", "is_removed": {"$ne": True}, "_id": {"$nin": my_projects},
                     "$expr": {"$lt": ["$member_count", "$max_team_size"]}}
    for project in db.projects.find(project_query).sort("created_at", -1).limit(POOL_LIMIT):
        skills = project.get("required_skills") or []
        score = score_opportunity(me, set(skill_keys(skills)), dict(zip(skill_keys(skills), skills)),
                                  set(tag_keys([project["category"].replace("_", " ")])),
                                  set(tag_keys(project["title"].split())), project.get("collaboration_mode"),
                                  "open", None)
        items.append(({
            "kind": "project", "id": str(project["_id"]), "title": project["title"],
            "summary": project["summary"], "type": "project", "path": f"/projects/{project['_id']}",
            "timing": "open", "is_demo": bool(project.get("is_demo")),
        }, score))

    items = [pair for pair in items if pair[1].total > 0]
    items.sort(key=lambda pair: (-pair[1].total, pair[0]["title"].lower()))
    out = [{**target, "score": score.total, "confidence": score.confidence, "reasons": score.reasons,
            "cautions": score.cautions, "breakdown": score.breakdown} for target, score in items[:limit]]
    notice = None
    if me.information_level() == "low":
        notice = "Add skills and interests to your profile for more relevant suggestions."
    return _response(out, notice)
