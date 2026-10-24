from fastapi import APIRouter, Depends, Request
from pymongo.database import Database

from app.core.rate_limit import get_rate_limiter
from app.db.connection import get_db
from app.dependencies.auth import CurrentUser, get_current_user
from app.dependencies.common import Pagination
from app.schemas.common import Page
from app.schemas.conversation import ConversationOut, DirectConversationCreate, UnreadMessages
from app.services import conversations as conversation_service
from app.services import projects as project_service
from app.services.profiles import Viewer

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", response_model=Page[ConversationOut])
def list_conversations(pagination: Pagination = Depends(), user: CurrentUser = Depends(get_current_user),
                       db: Database = Depends(get_db)):
    query = {"participant_ids": user.id}
    total = db.conversations.count_documents(query)
    docs = list(db.conversations.find(query).sort([("last_message_at", -1), ("updated_at", -1)])
                .skip(pagination.skip).limit(pagination.page_size))
    return pagination.response(conversation_service.to_out_many(db, docs, user), total)


@router.get("/unread", response_model=UnreadMessages, summary="Unread conversations and messages (for badges)")
def unread(user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    conversations = 0
    messages = 0
    projection = {"last_message": 1, "reads": 1}
    for conversation in db.conversations.find({"participant_ids": user.id, "last_message": {"$ne": None}},
                                              projection).limit(500):
        count = conversation_service.unread_count(db, conversation, user.id)
        if count:
            conversations += 1
            messages += count
    return {"conversations": conversations, "messages": messages}


@router.post("/direct", response_model=ConversationOut, summary="Open (or create) a direct conversation")
def open_direct(payload: DirectConversationCreate, request: Request, user: CurrentUser = Depends(get_current_user),
                db: Database = Depends(get_db)):
    get_rate_limiter(request).check(f"conversation-open:user:{user.id}", 30, 3600)
    conversation = conversation_service.get_or_create_direct(db, user, payload.handle)
    return conversation_service.to_out_many(db, [conversation], user)[0]


@router.post("/project/{project_id}", response_model=ConversationOut, summary="Open a project's team chat")
def open_project_chat(project_id: str, user: CurrentUser = Depends(get_current_user),
                      db: Database = Depends(get_db)):
    project = project_service.get_project(db, project_id, Viewer(db, user))
    conversation = conversation_service.get_or_create_project_chat(db, user, project)
    return conversation_service.to_out_many(db, [conversation], user)[0]


@router.get("/{conversation_id}", response_model=ConversationOut)
def get_conversation(conversation_id: str, user: CurrentUser = Depends(get_current_user),
                     db: Database = Depends(get_db)):
    conversation = conversation_service.get_for_participant(db, conversation_id, user)
    return conversation_service.to_out_many(db, [conversation], user)[0]


@router.post("/{conversation_id}/read", response_model=ConversationOut)
def mark_read(conversation_id: str, user: CurrentUser = Depends(get_current_user), db: Database = Depends(get_db)):
    conversation = conversation_service.get_for_participant(db, conversation_id, user)
    updated = conversation_service.mark_read(db, conversation, user)
    return conversation_service.to_out_many(db, [updated], user)[0]
