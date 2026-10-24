from __future__ import annotations

from typing import Literal

from pydantic import Field, field_validator

from app.schemas.common import APIModel, PersonSummary, UTCDateTime
from app.utils import clean_text

MAX_MESSAGE_LENGTH = 2000


class DirectConversationCreate(APIModel):
    handle: str = Field(min_length=3, max_length=30)


class MessageCreate(APIModel):
    body: str = Field(min_length=1, max_length=MAX_MESSAGE_LENGTH)

    @field_validator("body")
    @classmethod
    def _clean(cls, value: str) -> str:
        value = clean_text(value)
        if not value:
            raise ValueError("Message cannot be empty.")
        return value


class LastMessage(APIModel):
    preview: str
    sender_is_me: bool
    created_at: UTCDateTime


class ConversationProject(APIModel):
    id: str
    title: str


class ConversationOut(APIModel):
    id: str
    kind: Literal["direct", "project"]
    title: str
    participants: list[PersonSummary]
    project: ConversationProject | None = None
    last_message: LastMessage | None = None
    unread_count: int = 0
    can_send: bool = True
    cannot_send_reason: str | None = None
    updated_at: UTCDateTime


class MessageOut(APIModel):
    id: str
    sender: PersonSummary
    is_mine: bool
    body: str
    deleted: bool = False
    created_at: UTCDateTime
    # For your own messages: how many other participants have read up to this message.
    seen_by: int = 0


class MessagePage(APIModel):
    items: list[MessageOut]  # oldest first
    has_more: bool


class UnreadMessages(APIModel):
    conversations: int
    messages: int
