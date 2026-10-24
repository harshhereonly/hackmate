from __future__ import annotations

from datetime import datetime
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, PlainSerializer

from app.utils import to_aware_utc


def _serialize_datetime(value: datetime) -> str:
    aware = to_aware_utc(value)
    assert aware is not None
    return aware.isoformat(timespec="milliseconds").replace("+00:00", "Z")


# Datetimes are stored as naive UTC; the API always emits ISO-8601 with a "Z".
UTCDateTime = Annotated[datetime, PlainSerializer(_serialize_datetime, return_type=str, when_used="json")]

T = TypeVar("T")


class APIModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class Page(APIModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


class MessageResponse(APIModel):
    message: str


class PersonSummary(APIModel):
    """Public reference to a person. Never includes email or internal account ids.

    When the viewer may not see this person's profile, `is_private` is true and
    only a generic name is returned.
    """

    handle: str | None = None
    name: str
    avatar_url: str | None = None
    headline: str | None = None
    experience_level: str | None = None
    is_private: bool = False
