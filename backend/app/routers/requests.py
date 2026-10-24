from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Body, Depends
from pymongo.database import Database

from app.db.connection import get_db
from app.dependencies.auth import CurrentUser, get_current_user
from app.dependencies.common import Pagination
from app.schemas.common import Page
from app.schemas.request import DecisionBody, JoinRequestOut, RequestSummary
from app.services import join_requests as request_service

router = APIRouter(prefix="/requests", tags=["requests"])


@router.get("", response_model=Page[JoinRequestOut],
            summary="Incoming (you decide) or outgoing (you sent) requests and invitations")
def list_requests(
    box: Literal["incoming", "outgoing"] = "incoming",
    status: Literal["pending", "accepted", "rejected", "withdrawn", "all"] = "pending",
    kind: Literal["application", "invitation"] | None = None,
    pagination: Pagination = Depends(),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    query = request_service.box_query(user.id, box)
    if status != "all":
        query["status"] = status
    if kind:
        query["kind"] = kind
    total = db.join_requests.count_documents(query)
    docs = list(db.join_requests.find(query).sort("created_at", -1).skip(pagination.skip).limit(pagination.page_size))
    return pagination.response(request_service.to_out_many(db, docs, user), total)


@router.get("/summary", response_model=RequestSummary)
def summary(user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    incoming = {**request_service.box_query(user.id, "incoming"), "status": "pending"}
    outgoing = {**request_service.box_query(user.id, "outgoing"), "status": "pending"}
    return {"incoming_pending": db.join_requests.count_documents(incoming),
            "outgoing_pending": db.join_requests.count_documents(outgoing)}


@router.get("/{request_id}", response_model=JoinRequestOut)
def get_request(request_id: str, user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    request = request_service.get_request_for_party(db, request_id, user)
    return request_service.to_out_many(db, [request], user)[0]


@router.post("/{request_id}/accept", response_model=JoinRequestOut)
def accept(request_id: str, user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    request = request_service.get_request_for_party(db, request_id, user)
    updated = request_service.accept(db, request, user)
    return request_service.to_out_many(db, [updated], user)[0]


@router.post("/{request_id}/reject", response_model=JoinRequestOut)
def reject(request_id: str, body: DecisionBody | None = Body(default=None),
           user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    request = request_service.get_request_for_party(db, request_id, user)
    updated = request_service.reject(db, request, user, body.note if body else None)
    return request_service.to_out_many(db, [updated], user)[0]


@router.post("/{request_id}/withdraw", response_model=JoinRequestOut)
def withdraw(request_id: str, user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    request = request_service.get_request_for_party(db, request_id, user)
    updated = request_service.withdraw(db, request, user)
    return request_service.to_out_many(db, [updated], user)[0]
