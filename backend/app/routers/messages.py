from fastapi import APIRouter, Depends, Query, Request
from pymongo.database import Database

from app.core.errors import bad_request
from app.core.rate_limit import get_rate_limiter
from app.db.connection import get_db
from app.dependencies.auth import CurrentUser, get_current_user
from app.schemas.conversation import MessageCreate, MessageOut, MessagePage
from app.services import conversations as conversation_service
from app.utils import parse_object_id

router = APIRouter(prefix="/conversations", tags=["messages"])


@router.get("/{conversation_id}/messages", response_model=MessagePage,
            summary="Message history (oldest first). Use `before` to page back and `after` to poll.")
def list_messages(
    conversation_id: str,
    before: str | None = Query(None, description="Return messages older than this message id"),
    after: str | None = Query(None, description="Return messages newer than this message id"),
    limit: int = Query(30, ge=1, le=100),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    conversation = conversation_service.get_for_participant(db, conversation_id, user)
    if before and after:
        raise bad_request("Use either 'before' or 'after', not both.")
    query: dict = {"conversation_id": conversation["_id"]}
    anchor_id = before or after
    if anchor_id:
        anchor = db.messages.find_one({"_id": parse_object_id(anchor_id, what="Message"),
                                       "conversation_id": conversation["_id"]})
        if not anchor:
            raise bad_request("Unknown message reference.")
        op, tie = ("$lt", "$lt") if before else ("$gt", "$gt")
        query["$or"] = [{"created_at": {op: anchor["created_at"]}},
                        {"created_at": anchor["created_at"], "_id": {tie: anchor["_id"]}}]
    if after:
        docs = list(db.messages.find(query).sort([("created_at", 1), ("_id", 1)]).limit(limit + 1))
        has_more = len(docs) > limit
        docs = docs[:limit]
    else:
        docs = list(db.messages.find(query).sort([("created_at", -1), ("_id", -1)]).limit(limit + 1))
        has_more = len(docs) > limit
        docs = list(reversed(docs[:limit]))
    return {"items": conversation_service.messages_out(db, conversation, docs, user), "has_more": has_more}


@router.post("/{conversation_id}/messages", response_model=MessageOut, status_code=201)
def send_message(conversation_id: str, payload: MessageCreate, request: Request,
                 user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    limiter = get_rate_limiter(request)
    limiter.check(f"message:user:{user.id}", 30, 60)
    limiter.check(f"message-day:user:{user.id}", 1000, 86400)
    conversation = conversation_service.get_for_participant(db, conversation_id, user)
    message = conversation_service.send_message(db, conversation, user, payload.body)
    conversation = db.conversations.find_one({"_id": conversation["_id"]})
    return conversation_service.messages_out(db, conversation, [message], user)[0]


@router.delete("/{conversation_id}/messages/{message_id}", response_model=MessageOut)
def delete_message(conversation_id: str, message_id: str, user: CurrentUser = Depends(get_current_user),
                   db: Database = Depends(get_db)):
    conversation = conversation_service.get_for_participant(db, conversation_id, user)
    message = conversation_service.delete_message(db, conversation, user, message_id)
    return conversation_service.messages_out(db, conversation, [message], user)[0]
