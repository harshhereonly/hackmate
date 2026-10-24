from __future__ import annotations

from typing import Literal, get_args

from fastapi import APIRouter, Depends, Query, Request, Response
from pymongo import ReturnDocument
from pymongo.database import Database

from app.core.errors import bad_request, forbidden
from app.core.rate_limit import client_ip, get_rate_limiter
from app.db.connection import get_db
from app.dependencies.auth import CurrentUser, get_current_user, get_optional_user
from app.dependencies.common import Pagination
from app.dependencies.params import csv_choices, csv_values
from app.schemas.common import Page
from app.schemas.enums import OpportunityMode, OpportunitySourceKind, OpportunityType
from app.schemas.opportunity import (
    ApplicationCreate,
    ApplicationOut,
    CommunityOpportunityCreate,
    IssuePage,
    OpportunityOut,
    OpportunityUpdate,
)
from app.schemas.project import ProjectListItem
from app.services import projects as project_service
from app.services.opportunities import applications as application_service
from app.services.opportunities import catalog
from app.services.opportunities.saved import saved_keys
from app.services.profiles import Viewer
from app.services.taxonomy import skill_keys
from app.utils import escape_regex, utcnow

router = APIRouter(prefix="/opportunities", tags=["opportunities"])


def _page_out(db: Database, docs: list[dict], viewer: Viewer) -> list[dict]:
    keys = saved_keys(db, viewer.id, (f"opportunity:{d['_id']}" for d in docs))
    return catalog.to_out_many(db, docs, viewer, keys)


@router.get("", response_model=Page[OpportunityOut], summary="Opportunity Explorer listings")
def list_opportunities(
    type: str | None = Query(None, description="Comma-separated: hackathon, project, research"),
    q: str | None = Query(None, max_length=80),
    skills: str | None = Query(None, description="Comma-separated skills"),
    mode: str | None = Query(None, description="Comma-separated: online, in_person, hybrid"),
    timing: Literal["active", "upcoming", "ongoing", "past", "all"] = "active",
    source: str | None = Query(None, description="Comma-separated: curated, community, demo, feed"),
    include_demo: bool = True,
    sort: Literal["deadline", "recent"] = "deadline",
    pagination: Pagination = Depends(),
    user: CurrentUser | None = Depends(get_optional_user),
    db: Database = Depends(get_db),
):
    conditions: list[dict] = [{"is_removed": {"$ne": True}}]
    if types := csv_choices(type, get_args(OpportunityType)):
        conditions.append({"type": {"$in": types}})
    if q and q.strip():
        pattern = {"$regex": escape_regex(q), "$options": "i"}
        conditions.append({"$or": [{"title": pattern}, {"summary": pattern}, {"organizer": pattern},
                                   {"tags": pattern}, {"skills": pattern}]})
    if skill_list := skill_keys(csv_values(skills)):
        conditions.append({"skills_key": {"$in": skill_list}})
    if modes := csv_choices(mode, get_args(OpportunityMode)):
        conditions.append({"mode": {"$in": modes}})
    if timing_filter := catalog.timing_query(timing, utcnow()):
        conditions.append(timing_filter)
    if sources := csv_choices(source, get_args(OpportunitySourceKind)):
        conditions.append({"source_kind": {"$in": sources}})
    if not include_demo:
        conditions.append({"is_demo": {"$ne": True}})
    query = {"$and": conditions}
    order = [("sort_deadline", 1), ("created_at", -1)] if sort == "deadline" else [("created_at", -1)]
    total = db.opportunities.count_documents(query)
    docs = list(db.opportunities.find(query).sort(order).skip(pagination.skip).limit(pagination.page_size))
    return pagination.response(_page_out(db, docs, Viewer(db, user)), total)


@router.get("/sources", summary="Which data providers are configured and their last status")
def provider_status(request: Request) -> list[dict]:
    return request.app.state.providers.status()


@router.get("/open-source", response_model=IssuePage, summary="Live 'good first issue' tasks from GitHub")
def open_source_issues(
    request: Request,
    q: str | None = Query(None, max_length=80),
    language: str | None = Query(None, max_length=30),
    page: int = Query(1, ge=1, le=30),
    page_size: int = Query(10, ge=5, le=30),
):
    get_rate_limiter(request).check(f"github-search:ip:{client_ip(request)}", 20, 60)
    return request.app.state.providers.search_open_source(q, language, page, page_size)


@router.get("/mine", response_model=Page[OpportunityOut], summary="Opportunities I posted")
def my_opportunities(pagination: Pagination = Depends(), user: CurrentUser = Depends(get_current_user),
                     db: Database = Depends(get_db)):
    query = {"created_by": user.id, "source_kind": "community"}
    total = db.opportunities.count_documents(query)
    docs = list(db.opportunities.find(query).sort("created_at", -1).skip(pagination.skip).limit(pagination.page_size))
    return pagination.response(_page_out(db, docs, Viewer(db, user)), total)


@router.get("/applications", response_model=Page[ApplicationOut],
            summary="Applications I received (incoming) or sent (outgoing)")
def list_applications(
    box: Literal["incoming", "outgoing"] = "incoming",
    status: Literal["pending", "accepted", "declined", "withdrawn", "all"] = "pending",
    pagination: Pagination = Depends(),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    query: dict = {"owner_id": user.id} if box == "incoming" else {"applicant_id": user.id}
    if status != "all":
        query["status"] = status
    total = db.opportunity_applications.count_documents(query)
    docs = list(db.opportunity_applications.find(query).sort("created_at", -1)
                .skip(pagination.skip).limit(pagination.page_size))
    return pagination.response(application_service.to_out_many(db, docs, user), total)


@router.post("/applications/{application_id}/{action}", response_model=ApplicationOut)
def act_on_application(application_id: str, action: Literal["accept", "decline", "withdraw"],
                       user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    doc = application_service.get_for_party(db, application_id, user)
    if action == "withdraw":
        updated = application_service.withdraw(db, doc, user)
    else:
        updated = application_service.decide(db, doc, user, accept=action == "accept")
    return application_service.to_out_many(db, [updated], user)[0]


@router.post("", response_model=OpportunityOut, status_code=201,
             summary="Post a research collaboration opportunity")
def create_opportunity(payload: CommunityOpportunityCreate, request: Request,
                       user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    get_rate_limiter(request).check(f"opportunity-create:user:{user.id}", 10, 86400)
    doc = catalog.new_document(payload.model_dump(), source_kind="community", created_by=user.id)
    doc["_id"] = db.opportunities.insert_one(doc).inserted_id
    return catalog.to_out_many(db, [doc], Viewer(db, user))[0]


@router.get("/{opportunity_id}", response_model=OpportunityOut)
def get_opportunity(opportunity_id: str, user: CurrentUser | None = Depends(get_optional_user),
                    db: Database = Depends(get_db)):
    viewer = Viewer(db, user)
    doc = catalog.get_opportunity(db, opportunity_id, viewer)
    return _page_out(db, [doc], viewer)[0]


def _require_poster(doc: dict, user: CurrentUser) -> None:
    if doc.get("source_kind") != "community" or doc.get("created_by") != user.id:
        raise forbidden("Only the member who posted this opportunity can change it.")


@router.patch("/{opportunity_id}", response_model=OpportunityOut)
def update_opportunity(opportunity_id: str, payload: OpportunityUpdate,
                       user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    viewer = Viewer(db, user)
    doc = catalog.get_opportunity(db, opportunity_id, viewer)
    _require_poster(doc, user)
    changes = payload.model_dump(exclude_unset=True, exclude={"source_name", "source_url"})
    for key in ("title", "summary", "accepts_applications"):
        if key in changes and changes[key] is None:
            del changes[key]
    merged = catalog.derive_fields({**doc, **changes})
    if merged.get("starts_at") and merged.get("ends_at") and merged["ends_at"] < merged["starts_at"]:
        raise bad_request("The end date must be after the start date.", code="validation_error")
    derived = {k: merged[k] for k in ("effective_end", "sort_deadline", "skills_key", "tags_key")}
    updated = db.opportunities.find_one_and_update(
        {"_id": doc["_id"]}, {"$set": {**changes, **derived, "updated_at": utcnow()}},
        return_document=ReturnDocument.AFTER,
    )
    return _page_out(db, [updated], viewer)[0]


@router.delete("/{opportunity_id}", status_code=204, response_class=Response)
def delete_opportunity(opportunity_id: str, user: CurrentUser = Depends(get_current_user),
                       db: Database = Depends(get_db)):
    doc = catalog.get_opportunity(db, opportunity_id, Viewer(db, user))
    _require_poster(doc, user)
    db.opportunity_applications.delete_many({"opportunity_id": doc["_id"]})
    db.opportunities.delete_one({"_id": doc["_id"]})
    return Response(status_code=204)


@router.post("/{opportunity_id}/applications", response_model=ApplicationOut, status_code=201)
def apply(opportunity_id: str, payload: ApplicationCreate, request: Request,
          user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    get_rate_limiter(request).check(f"opportunity-apply:user:{user.id}", 30, 3600)
    doc = catalog.get_opportunity(db, opportunity_id, Viewer(db, user))
    application = application_service.apply(db, doc, user, payload.message)
    return application_service.to_out_many(db, [application], user)[0]


@router.get("/{opportunity_id}/applications", response_model=Page[ApplicationOut],
            summary="Applications to one of my posts")
def opportunity_applications(opportunity_id: str,
                             status: Literal["pending", "accepted", "declined", "withdrawn", "all"] = "all",
                             pagination: Pagination = Depends(), user: CurrentUser = Depends(get_current_user),
                             db: Database = Depends(get_db)):
    doc = catalog.get_opportunity(db, opportunity_id, Viewer(db, user))
    _require_poster(doc, user)
    query: dict = {"opportunity_id": doc["_id"]}
    if status != "all":
        query["status"] = status
    total = db.opportunity_applications.count_documents(query)
    docs = list(db.opportunity_applications.find(query).sort("created_at", -1)
                .skip(pagination.skip).limit(pagination.page_size))
    return pagination.response(application_service.to_out_many(db, docs, user), total)


@router.get("/{opportunity_id}/teams", response_model=Page[ProjectListItem],
            summary="HackMate teams recruiting for this opportunity")
def teams_for_opportunity(opportunity_id: str, pagination: Pagination = Depends(),
                          user: CurrentUser | None = Depends(get_optional_user), db: Database = Depends(get_db)):
    viewer = Viewer(db, user)
    doc = catalog.get_opportunity(db, opportunity_id, viewer)
    query = {"opportunity_id": doc["_id"], "is_removed": {"$ne": True}, "status": {"$ne": "completed"}}
    total = db.projects.count_documents(query)
    docs = list(db.projects.find(query).sort("created_at", -1).skip(pagination.skip).limit(pagination.page_size))
    return pagination.response(project_service.to_list_items(db, viewer, docs), total)
