"""Admin API. Every route requires a database-backed admin role (`require_admin`)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any, Literal, get_args

from fastapi import APIRouter, Depends, Query, Request, Response
from pymongo import ReturnDocument
from pymongo.database import Database

from app.core.errors import bad_request, forbidden, not_found
from app.db.connection import get_db
from app.dependencies.auth import CurrentUser, require_admin
from app.dependencies.common import Pagination
from app.dependencies.params import csv_choices
from app.schemas.admin import (
    AdminListingOut,
    AdminReportOut,
    AdminStats,
    AdminUserOut,
    AuditEntryOut,
    ReasonBody,
)
from app.schemas.common import Page
from app.schemas.enums import OpportunitySourceKind, OpportunityType
from app.schemas.opportunity import CuratedOpportunityCreate, OpportunityOut, OpportunityUpdate
from app.schemas.report import ReportResolve
from app.services import moderation
from app.services.opportunities import catalog
from app.services.opportunities.feeds import sync_feed
from app.services.profiles import Viewer, avatar_url
from app.utils import escape_regex, parse_object_id, utcnow

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def _summary(db: Database, user_ids) -> dict:
    return {p["user_id"]: {"handle": p["handle"], "name": p["name"], "avatar_url": avatar_url(p)}
            for p in db.profiles.find({"user_id": {"$in": list(user_ids)}},
                                      {"user_id": 1, "handle": 1, "name": 1, "avatar_version": 1})}


@router.get("/stats", response_model=AdminStats)
def stats(db: Database = Depends(get_db)):
    week_ago = utcnow() - timedelta(days=7)
    return {
        "users": {
            "total": db.users.count_documents({}),
            "active": db.users.count_documents({"status": "active"}),
            "suspended": db.users.count_documents({"status": "suspended"}),
            "admins": db.users.count_documents({"role": "admin"}),
            "new_last_7_days": db.users.count_documents({"created_at": {"$gte": week_ago}}),
        },
        "projects": {
            "total": db.projects.count_documents({}),
            "recruiting": db.projects.count_documents({"status": "recruiting", "is_removed": {"$ne": True}}),
            "active": db.projects.count_documents({"status": "active", "is_removed": {"$ne": True}}),
            "completed": db.projects.count_documents({"status": "completed", "is_removed": {"$ne": True}}),
            "removed": db.projects.count_documents({"is_removed": True}),
        },
        "requests": {
            "pending": db.join_requests.count_documents({"status": "pending"}),
            "accepted_last_7_days": db.join_requests.count_documents(
                {"status": "accepted", "decided_at": {"$gte": week_ago}}),
            "memberships": db.team_memberships.count_documents({"role": "member"}),
        },
        "opportunities": {
            "total": db.opportunities.count_documents({}),
            "curated": db.opportunities.count_documents({"source_kind": "curated"}),
            "community": db.opportunities.count_documents({"source_kind": "community"}),
            "feed": db.opportunities.count_documents({"source_kind": "feed"}),
            "demo": db.opportunities.count_documents({"is_demo": True}),
            "removed": db.opportunities.count_documents({"is_removed": True}),
        },
        "reports": {
            "open": db.reports.count_documents({"status": "open"}),
            "resolved": db.reports.count_documents({"status": "resolved"}),
            "dismissed": db.reports.count_documents({"status": "dismissed"}),
        },
        "messaging": {
            "conversations": db.conversations.count_documents({}),
            "messages_last_7_days": db.messages.count_documents({"created_at": {"$gte": week_ago}}),
        },
    }


# --- Users --------------------------------------------------------------------

@router.get("/users", response_model=Page[AdminUserOut])
def list_users(
    q: str | None = Query(None, max_length=120, description="Email, name or handle"),
    status: Literal["active", "suspended"] | None = None,
    role: Literal["user", "admin"] | None = None,
    pagination: Pagination = Depends(),
    db: Database = Depends(get_db),
):
    query: dict[str, Any] = {}
    if status:
        query["status"] = status
    if role:
        query["role"] = role
    if q and q.strip():
        pattern = {"$regex": escape_regex(q), "$options": "i"}
        profile_ids = db.profiles.distinct("user_id", {"$or": [{"name": pattern}, {"handle": pattern}]})
        query["$or"] = [{"email": pattern}, {"_id": {"$in": profile_ids}}]
    total = db.users.count_documents(query)
    users = list(db.users.find(query, {"password_hash": 0}).sort("created_at", -1)
                 .skip(pagination.skip).limit(pagination.page_size))
    ids = [u["_id"] for u in users]
    profiles = {p["user_id"]: p for p in db.profiles.find({"user_id": {"$in": ids}},
                                                           {"user_id": 1, "handle": 1, "name": 1, "is_demo": 1})}
    items = []
    for user in users:
        profile = profiles.get(user["_id"], {})
        items.append({
            "id": str(user["_id"]),
            "email": user["email"],
            "role": user.get("role", "user"),
            "status": user.get("status", "active"),
            "email_verified": bool(user.get("email_verified")),
            "created_at": user["created_at"],
            "last_login_at": user.get("last_login_at"),
            "suspended_reason": user.get("suspended_reason"),
            "handle": profile.get("handle"),
            "name": profile.get("name"),
            "projects_owned": db.projects.count_documents({"owner_id": user["_id"]}),
            "open_reports": db.reports.count_documents({"target_type": "user", "target_id": user["_id"],
                                                        "status": "open"}),
            "is_demo": bool(profile.get("is_demo")),
        })
    return pagination.response(items, total)


@router.post("/users/{user_id}/suspend", response_model=dict)
def suspend_user(user_id: str, payload: ReasonBody, admin: CurrentUser = Depends(require_admin),
                 db: Database = Depends(get_db)):
    updated = moderation.set_user_status(db, admin, user_id, True, payload.reason)
    return {"id": str(updated["_id"]), "status": updated["status"]}


@router.post("/users/{user_id}/reactivate", response_model=dict)
def reactivate_user(user_id: str, admin: CurrentUser = Depends(require_admin), db: Database = Depends(get_db)):
    updated = moderation.set_user_status(db, admin, user_id, False, None)
    return {"id": str(updated["_id"]), "status": updated["status"]}


# --- Reports ------------------------------------------------------------------

def _report_target(db: Database, report: dict[str, Any]) -> dict[str, Any]:
    oid, kind = report["target_id"], report["target_type"]
    if kind == "user":
        profile = db.profiles.find_one({"user_id": oid}, {"handle": 1, "name": 1})
        user = db.users.find_one({"_id": oid}, {"status": 1})
        return {"exists": bool(user), "label": profile["name"] if profile else report.get("target_label"),
                "path": f"/people/{profile['handle']}" if profile else None, "user_id": str(oid),
                "status": user.get("status") if user else None}
    if kind in ("project", "opportunity"):
        collection = db.projects if kind == "project" else db.opportunities
        doc = collection.find_one({"_id": oid}, {"title": 1, "is_removed": 1})
        return {"exists": bool(doc), "label": doc["title"] if doc else report.get("target_label"),
                "path": f"/{'projects' if kind == 'project' else 'opportunities'}/{oid}" if doc else None,
                "is_removed": bool(doc and doc.get("is_removed"))}
    message = db.messages.find_one({"_id": oid})
    sender = db.profiles.find_one({"user_id": message["sender_id"]}, {"name": 1, "handle": 1}) if message else None
    return {"exists": bool(message), "label": report.get("target_label"),
            "body": (message or {}).get("body") or "[deleted]",
            "deleted": bool(message and message.get("deleted")),
            "sender": {"name": sender["name"], "handle": sender["handle"]} if sender else None}


@router.get("/reports", response_model=Page[AdminReportOut])
def list_reports(status: Literal["open", "resolved", "dismissed", "all"] = "open",
                 target_type: Literal["user", "project", "opportunity", "message"] | None = None,
                 pagination: Pagination = Depends(), db: Database = Depends(get_db)):
    query: dict[str, Any] = {}
    if status != "all":
        query["status"] = status
    if target_type:
        query["target_type"] = target_type
    total = db.reports.count_documents(query)
    reports = list(db.reports.find(query).sort("created_at", -1).skip(pagination.skip).limit(pagination.page_size))
    people = _summary(db, {r["reporter_id"] for r in reports} | {r["resolved_by"] for r in reports if r.get("resolved_by")})
    items = [{
        "id": str(r["_id"]),
        "target_type": r["target_type"],
        "target_id": str(r["target_id"]),
        "target": _report_target(db, r),
        "reason": r["reason"],
        "details": r.get("details") or "",
        "status": r["status"],
        "reporter": people.get(r["reporter_id"], {"name": "Unknown"}),
        "created_at": r["created_at"],
        "resolved_at": r.get("resolved_at"),
        "resolution_note": r.get("resolution_note"),
        "resolved_by": (people.get(r["resolved_by"]) or {}).get("name") if r.get("resolved_by") else None,
    } for r in reports]
    return pagination.response(items, total)


@router.post("/reports/{report_id}/resolve", response_model=dict)
def resolve_report(report_id: str, payload: ReportResolve, admin: CurrentUser = Depends(require_admin),
                   db: Database = Depends(get_db)):
    doc = moderation.resolve_report(db, admin, report_id, payload.resolution, payload.note)
    return {"id": str(doc["_id"]), "status": doc["status"]}


# --- Listings -----------------------------------------------------------------

@router.get("/listings", response_model=Page[AdminListingOut], summary="Projects or opportunities, including removed")
def list_listings(kind: Literal["project", "opportunity"] = "project",
                  removed: bool | None = None,
                  q: str | None = Query(None, max_length=80),
                  pagination: Pagination = Depends(), db: Database = Depends(get_db)):
    query: dict[str, Any] = {}
    if removed is not None:
        query["is_removed"] = True if removed else {"$ne": True}
    if q and q.strip():
        query["title"] = {"$regex": escape_regex(q), "$options": "i"}
    collection = db.projects if kind == "project" else db.opportunities
    total = collection.count_documents(query)
    docs = list(collection.find(query).sort("created_at", -1).skip(pagination.skip).limit(pagination.page_size))
    owner_field = "owner_id" if kind == "project" else "created_by"
    owners = _summary(db, {d.get(owner_field) for d in docs if d.get(owner_field)})
    items = [{
        "id": str(d["_id"]),
        "kind": kind,
        "title": d["title"],
        "type": d.get("category") if kind == "project" else d["type"],
        "status": d.get("status") if kind == "project" else catalog.timing_status(d),
        "source_kind": d.get("source_kind"),
        "owner": owners.get(d.get(owner_field)),
        "is_removed": bool(d.get("is_removed")),
        "removed_reason": d.get("removed_reason"),
        "is_demo": bool(d.get("is_demo")),
        "verified": bool(d.get("verified")),
        "open_reports": db.reports.count_documents({"target_type": kind, "target_id": d["_id"], "status": "open"}),
        "created_at": d["created_at"],
    } for d in docs]
    return pagination.response(items, total)


@router.post("/projects/{project_id}/remove", response_model=dict, summary="Remove (hide) a project")
def remove_project(project_id: str, payload: ReasonBody, admin: CurrentUser = Depends(require_admin),
                   db: Database = Depends(get_db)):
    doc = moderation.set_listing_removed(db, admin, "project", project_id, True, payload.reason)
    return {"id": str(doc["_id"]), "is_removed": True}


@router.post("/projects/{project_id}/restore", response_model=dict)
def restore_project(project_id: str, admin: CurrentUser = Depends(require_admin), db: Database = Depends(get_db)):
    doc = moderation.set_listing_removed(db, admin, "project", project_id, False, None)
    return {"id": str(doc["_id"]), "is_removed": False}


@router.post("/opportunities/{opportunity_id}/remove", response_model=dict, summary="Remove (hide) an opportunity")
def remove_opportunity(opportunity_id: str, payload: ReasonBody, admin: CurrentUser = Depends(require_admin),
                       db: Database = Depends(get_db)):
    doc = moderation.set_listing_removed(db, admin, "opportunity", opportunity_id, True, payload.reason)
    return {"id": str(doc["_id"]), "is_removed": True}


@router.post("/opportunities/{opportunity_id}/restore", response_model=dict)
def restore_opportunity(opportunity_id: str, admin: CurrentUser = Depends(require_admin),
                        db: Database = Depends(get_db)):
    doc = moderation.set_listing_removed(db, admin, "opportunity", opportunity_id, False, None)
    return {"id": str(doc["_id"]), "is_removed": False}


@router.post("/messages/{message_id}/remove", response_model=dict)
def remove_message(message_id: str, payload: ReasonBody, admin: CurrentUser = Depends(require_admin),
                   db: Database = Depends(get_db)):
    moderation.remove_message(db, admin, message_id, payload.reason)
    return {"id": message_id, "deleted": True}


# --- Curated opportunities ----------------------------------------------------

_ADMIN_EDITABLE = {"curated", "demo", "feed"}


@router.get("/opportunities", response_model=Page[OpportunityOut])
def admin_opportunities(type: str | None = None, source: str | None = None,
                        pagination: Pagination = Depends(), admin: CurrentUser = Depends(require_admin),
                        db: Database = Depends(get_db)):
    query: dict[str, Any] = {}
    if types := csv_choices(type, get_args(OpportunityType)):
        query["type"] = {"$in": types}
    if sources := csv_choices(source, get_args(OpportunitySourceKind)):
        query["source_kind"] = {"$in": sources}
    total = db.opportunities.count_documents(query)
    docs = list(db.opportunities.find(query).sort("created_at", -1).skip(pagination.skip).limit(pagination.page_size))
    return pagination.response(catalog.to_out_many(db, docs, Viewer(db, admin), with_viewer=False), total)


@router.post("/opportunities", response_model=OpportunityOut, status_code=201,
             summary="Add a curated listing (verified, with an official link)")
def create_curated(payload: CuratedOpportunityCreate, admin: CurrentUser = Depends(require_admin),
                   db: Database = Depends(get_db)):
    if not payload.url:
        raise bad_request("Curated listings need the official registration or information link.",
                          code="validation_error", details=[{"field": "url", "message": "Required."}])
    data = payload.model_dump()
    data["accepts_applications"] = False  # curated listings link out to the organizer
    doc = catalog.new_document(data, source_kind="curated", created_by=admin.id, verified=True)
    doc["_id"] = db.opportunities.insert_one(doc).inserted_id
    moderation.record_action(db, admin, "opportunity_created", "opportunity", doc["_id"], doc["title"])
    return catalog.to_out_many(db, [doc], Viewer(db, admin), with_viewer=False)[0]


@router.patch("/opportunities/{opportunity_id}", response_model=OpportunityOut)
def update_curated(opportunity_id: str, payload: OpportunityUpdate, admin: CurrentUser = Depends(require_admin),
                   db: Database = Depends(get_db)):
    doc = db.opportunities.find_one({"_id": parse_object_id(opportunity_id, what="Opportunity")})
    if not doc:
        raise not_found("Opportunity not found.")
    if doc.get("source_kind") not in _ADMIN_EDITABLE:
        raise forbidden("Member posts can be removed or restored, but only their author can edit them.")
    changes = payload.model_dump(exclude_unset=True)
    for key in ("title", "summary", "accepts_applications"):
        if key in changes and changes[key] is None:
            del changes[key]
    changes.pop("accepts_applications", None)
    merged = catalog.derive_fields({**doc, **changes})
    if merged.get("starts_at") and merged.get("ends_at") and merged["ends_at"] < merged["starts_at"]:
        raise bad_request("The end date must be after the start date.", code="validation_error")
    derived = {k: merged[k] for k in ("effective_end", "sort_deadline", "skills_key", "tags_key")}
    updated = db.opportunities.find_one_and_update(
        {"_id": doc["_id"]}, {"$set": {**changes, **derived, "updated_at": utcnow()}},
        return_document=ReturnDocument.AFTER,
    )
    moderation.record_action(db, admin, "opportunity_updated", "opportunity", doc["_id"], updated["title"],
                             details={"fields": sorted(changes)})
    return catalog.to_out_many(db, [updated], Viewer(db, admin), with_viewer=False)[0]


@router.delete("/opportunities/{opportunity_id}", status_code=204, response_class=Response)
def delete_curated(opportunity_id: str, admin: CurrentUser = Depends(require_admin), db: Database = Depends(get_db)):
    doc = db.opportunities.find_one({"_id": parse_object_id(opportunity_id, what="Opportunity")})
    if not doc:
        raise not_found("Opportunity not found.")
    if doc.get("source_kind") not in _ADMIN_EDITABLE:
        raise forbidden("Member posts can be removed, not deleted, by admins.")
    db.opportunities.delete_one({"_id": doc["_id"]})
    db.projects.update_many({"opportunity_id": doc["_id"]}, {"$set": {"opportunity_id": None}})
    moderation.record_action(db, admin, "opportunity_deleted", "opportunity", doc["_id"], doc["title"])
    return Response(status_code=204)


@router.post("/opportunities/sync-feeds", response_model=list[dict], summary="Import from HACKATHON_FEED_URLS")
def sync_feeds(request: Request, admin: CurrentUser = Depends(require_admin), db: Database = Depends(get_db)):
    settings = request.app.state.settings
    if not settings.hackathon_feed_urls:
        raise bad_request("No feeds are configured. Set HACKATHON_FEED_URLS in the backend environment.",
                          code="no_feeds")
    client = request.app.state.providers.client
    reports = [sync_feed(db, client, url) for url in settings.hackathon_feed_urls]
    moderation.record_action(db, admin, "feeds_synced", "feed", "all", f"{len(reports)} feed(s)",
                             details={"results": [{k: r[k] for k in ("imported", "updated", "skipped")} for r in reports]})
    return reports


@router.get("/providers", response_model=list[dict])
def providers(request: Request):
    return request.app.state.providers.status()


# --- Audit log ----------------------------------------------------------------

@router.get("/audit", response_model=Page[AuditEntryOut])
def audit_log(pagination: Pagination = Depends(), db: Database = Depends(get_db)):
    total = db.moderation_actions.count_documents({})
    docs = list(db.moderation_actions.find({}).sort("created_at", -1).skip(pagination.skip).limit(pagination.page_size))
    admins = _summary(db, {d["admin_id"] for d in docs})
    items = [{
        "id": str(d["_id"]), "action": d["action"], "target_type": d["target_type"], "target_id": d["target_id"],
        "target_label": d.get("target_label") or "", "reason": d.get("reason"),
        "admin": admins.get(d["admin_id"], {"name": "Unknown admin"}), "created_at": d["created_at"],
    } for d in docs]
    return pagination.response(items, total)
