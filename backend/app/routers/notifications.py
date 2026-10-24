from fastapi import APIRouter, Depends, Response
from pymongo import ReturnDocument
from pymongo.database import Database

from app.core.errors import not_found
from app.db.connection import get_db
from app.dependencies.auth import CurrentUser, get_current_user
from app.dependencies.common import Pagination
from app.schemas.common import Page
from app.schemas.notification import NotificationOut, UnreadCount
from app.services import notifications as notification_service
from app.utils import parse_object_id

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=Page[NotificationOut])
def list_notifications(unread_only: bool = False, pagination: Pagination = Depends(),
                       user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    query: dict = {"user_id": user.id}
    if unread_only:
        query["read"] = False
    total = db.notifications.count_documents(query)
    docs = db.notifications.find(query).sort("created_at", -1).skip(pagination.skip).limit(pagination.page_size)
    return pagination.response([notification_service.to_out(doc) for doc in docs], total)


@router.get("/unread-count", response_model=UnreadCount)
def unread_count(user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    return {"count": db.notifications.count_documents({"user_id": user.id, "read": False})}


@router.post("/read-all", response_model=UnreadCount, summary="Mark everything read; returns the new count (0)")
def read_all(user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    db.notifications.update_many({"user_id": user.id, "read": False}, {"$set": {"read": True}})
    return {"count": 0}


@router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_read(notification_id: str, user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    doc = db.notifications.find_one_and_update(
        {"_id": parse_object_id(notification_id, what="Notification"), "user_id": user.id},
        {"$set": {"read": True}},
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise not_found("Notification not found.")
    return notification_service.to_out(doc)


@router.delete("/{notification_id}", status_code=204, response_class=Response)
def delete_notification(notification_id: str, user: CurrentUser = Depends(get_current_user),
                        db: Database = Depends(get_db)):
    result = db.notifications.delete_one(
        {"_id": parse_object_id(notification_id, what="Notification"), "user_id": user.id}
    )
    if not result.deleted_count:
        raise not_found("Notification not found.")
    return Response(status_code=204)
