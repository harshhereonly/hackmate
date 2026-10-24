"""Small shared helpers: time, ids, text normalization."""

from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timezone
from typing import Iterable

from bson import ObjectId
from bson.errors import InvalidId

from app.core.errors import AppError


# --- Time -------------------------------------------------------------------
# Datetimes are stored as naive UTC (PyMongo's default representation) and made
# timezone-aware only at the API boundary, so stored and queried values always
# compare consistently.

def utcnow() -> datetime:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    return now.replace(microsecond=(now.microsecond // 1000) * 1000)  # BSON has ms precision


def to_naive_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value.replace(microsecond=(value.microsecond // 1000) * 1000)


def to_aware_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


# --- Ids --------------------------------------------------------------------

def parse_object_id(value: str | ObjectId | None, *, what: str = "Resource") -> ObjectId:
    """Parse a path/body id; malformed ids are reported as 'not found' (no oracle)."""
    if isinstance(value, ObjectId):
        return value
    try:
        return ObjectId(str(value))
    except (InvalidId, TypeError):
        raise AppError(404, "not_found", f"{what} not found.") from None


def try_object_id(value: str | None) -> ObjectId | None:
    try:
        return ObjectId(str(value)) if value else None
    except (InvalidId, TypeError):
        return None


def id_str(value: ObjectId | str | None) -> str | None:
    return str(value) if value is not None else None


# --- Text -------------------------------------------------------------------

_WHITESPACE = re.compile(r"\s+")
_SLUG_STRIP = re.compile(r"[^a-z0-9]+")


def clean_text(value: str | None, *, collapse: bool = False) -> str:
    if value is None:
        return ""
    value = unicodedata.normalize("NFC", value).strip()
    value = value.replace("\x00", "")
    return _WHITESPACE.sub(" ", value) if collapse else value


def slugify(value: str, *, max_length: int = 40) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    slug = _SLUG_STRIP.sub("-", ascii_value.lower()).strip("-")
    return slug[:max_length].strip("-")


def escape_regex(value: str) -> str:
    """User input is always escaped before reaching a $regex (no regex injection/ReDoS)."""
    return re.escape(value.strip())


def dedupe_tags(values: Iterable[str] | None, *, max_items: int, max_length: int = 40) -> list[str]:
    """Trim, collapse whitespace and drop case-insensitive duplicates, keeping order."""
    seen: set[str] = set()
    result: list[str] = []
    for raw in values or []:
        tag = clean_text(str(raw), collapse=True)[:max_length].strip()
        key = tag.lower()
        if tag and key not in seen:
            seen.add(key)
            result.append(tag)
        if len(result) >= max_items:
            break
    return result
