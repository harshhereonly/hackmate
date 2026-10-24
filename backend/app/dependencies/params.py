"""Helpers for list-valued query parameters.

Filters accept comma-separated values (`?skills=react,python`). Axios and
plain links can both produce that format without special serializers.
"""

from __future__ import annotations

from typing import Iterable


def csv_values(raw: str | None, *, max_items: int = 15, max_length: int = 60) -> list[str]:
    if not raw:
        return []
    values: list[str] = []
    for part in raw.split(","):
        part = part.strip()[:max_length]
        if part and part not in values:
            values.append(part)
        if len(values) >= max_items:
            break
    return values


def csv_choices(raw: str | None, allowed: Iterable[str]) -> list[str]:
    """Like csv_values, but keeps only known enum values."""
    allowed_set = set(allowed)
    return [value for value in csv_values(raw) if value in allowed_set]
