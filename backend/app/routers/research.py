from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query, Request
from pymongo.database import Database

from app.core.rate_limit import client_ip, get_rate_limiter
from app.db.connection import get_db
from app.dependencies.auth import CurrentUser, get_current_user
from app.dependencies.common import Pagination
from app.schemas.common import Page
from app.schemas.opportunity import PaperPage
from app.schemas.profile import ProfileCard
from app.services import profiles as profile_service
from app.utils import escape_regex

router = APIRouter(prefix="/research", tags=["research"])


@router.get("/papers", response_model=PaperPage, summary="Search scholarly works (OpenAlex, falling back to Crossref)")
def search_papers(
    request: Request,
    q: str = Query(..., min_length=2, max_length=200, description="Title, topic, keyword or author name"),
    field: Literal["all", "title", "author"] = "all",
    source: Literal["auto", "openalex", "crossref"] = "auto",
    page: int = Query(1, ge=1, le=50),
    page_size: int = Query(10, ge=5, le=25),
):
    # Protects the shared upstream daily budget as much as our own server.
    get_rate_limiter(request).check(f"paper-search:ip:{client_ip(request)}", 30, 60)
    return request.app.state.providers.search_papers(q.strip(), field, page, page_size, source)


@router.get("/people", response_model=Page[ProfileCard], summary="Members with related research interests")
def research_people(
    q: str = Query(..., min_length=2, max_length=80, description="Research topic, e.g. 'computer vision'"),
    pagination: Pagination = Depends(),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    pattern = {"$regex": escape_regex(q), "$options": "i"}
    query = {
        "is_active": True,
        "visibility": {"$in": ["public", "members"]},
        "user_id": {"$ne": user.id},
        "$or": [{"interests": pattern}, {"skills": pattern}, {"headline": pattern}, {"bio": pattern}],
    }
    total = db.profiles.count_documents(query)
    # Members who list research as a preferred role come first.
    docs = list(db.profiles.find(query))
    docs.sort(key=lambda p: ("research" not in (p.get("preferred_roles") or []), p["name"].lower()))
    window = docs[pagination.skip: pagination.skip + pagination.page_size]
    return pagination.response([profile_service.to_card(doc) for doc in window], total)
