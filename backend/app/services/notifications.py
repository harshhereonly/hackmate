"""Database-backed notifications (the UI polls for the unread count)."""

from __future__ import annotations

from typing import Any, Iterable

from bson import ObjectId
from pymongo.database import Database

from app.utils import utcnow


def notify(db: Database, user_id: ObjectId, type_: str, title: str, body: str = "",
           link: str | None = None, data: dict[str, Any] | None = None) -> None:
    notify_many(db, [user_id], type_, title, body, link, data)


def notify_many(db: Database, user_ids: Iterable[ObjectId], type_: str, title: str, body: str = "",
                link: str | None = None, data: dict[str, Any] | None = None) -> None:
    now = utcnow()
    docs = [
        {
            "user_id": uid,
            "type": type_,
            "title": title[:200],
            "body": body[:500],
            "link": link,
            "data": data or {},
            "read": False,
            "created_at": now,
        }
        for uid in dict.fromkeys(user_ids)  # dedupe, keep order
        if uid is not None
    ]
    if docs:
        db.notifications.insert_many(docs)


def to_out(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(doc["_id"]),
        "type": doc["type"],
        "title": doc["title"],
        "body": doc.get("body") or "",
        "link": doc.get("link"),
        "read": bool(doc.get("read")),
        "created_at": doc["created_at"],
    }
