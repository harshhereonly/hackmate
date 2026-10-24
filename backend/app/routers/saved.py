from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from pymongo.database import Database

from app.core.errors import conflict, not_found
from app.db.connection import get_db
from app.dependencies.auth import CurrentUser, get_current_user
from app.dependencies.common import Pagination
from app.schemas.common import Page
from app.schemas.opportunity import SavedItemCreate, SavedItemOut
from app.services.opportunities import saved as saved_service

router = APIRouter(prefix="/saved", tags=["saved"])


@router.get("", response_model=Page[SavedItemOut])
def list_saved(
    item_type: Literal["hackathon", "project", "research", "paper", "issue"] | None = None,
    pagination: Pagination = Depends(),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    query: dict = {"user_id": user.id}
    if item_type:
        query["item_type"] = item_type
    total = db.saved_opportunities.count_documents(query)
    docs = list(db.saved_opportunities.find(query).sort("created_at", -1)
                .skip(pagination.skip).limit(pagination.page_size))
    return pagination.response(saved_service.to_out_many(db, docs), total)


@router.get("/keys", response_model=list[str], summary="Keys of everything I saved (for bookmark toggles)")
def saved_item_keys(user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    return db.saved_opportunities.distinct("item_key", {"user_id": user.id})[:1000]


@router.post("", response_model=SavedItemOut, status_code=201)
def save_item(payload: SavedItemCreate, user: CurrentUser = Depends(get_current_user),
              db: Database = Depends(get_db)):
    if db.saved_opportunities.count_documents({"user_id": user.id}) >= 1000:
        raise conflict("You've reached the limit of 1,000 saved items.", code="saved_limit")
    doc = saved_service.save(db, user, payload)
    return saved_service.to_out_many(db, [doc])[0]


@router.delete("", status_code=204, response_class=Response)
def unsave_item(key: str = Query(..., min_length=3, max_length=200), user: CurrentUser = Depends(get_current_user),
                db: Database = Depends(get_db)):
    result = db.saved_opportunities.delete_one({"user_id": user.id, "item_key": key})
    if not result.deleted_count:
        raise not_found("That item isn't in your saved list.")
    return Response(status_code=204)
