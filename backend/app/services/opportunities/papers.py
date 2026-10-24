"""Research paper search: OpenAlex (primary) and Crossref (fallback).

Only metadata the sources actually provide is passed on. Open access is
reported only when OpenAlex states it; otherwise it is "unknown" (None).
OpenAlex and Crossref metadata are CC0, and results are attributed in the API
response and in the UI.
"""

from __future__ import annotations

import html
import math
import re
from typing import Any, Literal

import httpx2

from app.core.config import Settings
from app.services.opportunities.http import ProviderError, get_json

OPENALEX_URL = "https://api.openalex.org/works"
CROSSREF_URL = "https://api.crossref.org/works"
SearchField = Literal["all", "title", "author"]

_TAG = re.compile(r"<[^>]+>")
_SPACE = re.compile(r"\s+")
_MAX_ABSTRACT = 1500


def _clip(text: str | None, limit: int = _MAX_ABSTRACT) -> str | None:
    if not text:
        return None
    text = _SPACE.sub(" ", text).strip()
    return text if len(text) <= limit else text[: limit - 1].rsplit(" ", 1)[0] + "…"


def rebuild_abstract(inverted: dict[str, list[int]] | None) -> str | None:
    """OpenAlex ships abstracts as {word: [positions]}; rebuild the running text."""
    if not inverted:
        return None
    positions: dict[int, str] = {}
    for word, indexes in inverted.items():
        for index in indexes:
            positions[index] = word
    return _clip(" ".join(positions[i] for i in sorted(positions)))


def strip_markup(text: str | None) -> str | None:
    """Crossref abstracts are JATS XML fragments."""
    if not text:
        return None
    return _clip(html.unescape(_TAG.sub(" ", text)))


def _doi(value: str | None) -> str | None:
    if not value:
        return None
    return value.removeprefix("https://doi.org/").removeprefix("http://dx.doi.org/").strip() or None


def parse_openalex_work(work: dict[str, Any]) -> dict[str, Any]:
    openalex_id = (work.get("id") or "").rsplit("/", 1)[-1]
    doi = _doi(work.get("doi"))
    location = work.get("primary_location") or {}
    source = location.get("source") or {}
    access = work.get("open_access") or {}
    authors = [
        a["author"]["display_name"]
        for a in (work.get("authorships") or [])
        if (a.get("author") or {}).get("display_name")
    ]
    is_oa = access.get("is_oa")
    return {
        "key": f"openalex:{openalex_id}",
        "source": "openalex",
        "title": work.get("display_name") or work.get("title") or "Untitled work",
        "authors": authors[:12],
        "published": work.get("publication_date") or (str(work["publication_year"]) if work.get("publication_year") else None),
        "venue": source.get("display_name"),
        "doi": doi,
        "url": f"https://doi.org/{doi}" if doi else (location.get("landing_page_url") or work.get("id")),
        "abstract": rebuild_abstract(work.get("abstract_inverted_index")),
        "open_access": True if is_oa is True else None,
        "open_access_url": access.get("oa_url") if is_oa is True else None,
        "cited_by": work.get("cited_by_count"),
        "type": work.get("type"),
    }


def _crossref_date(item: dict[str, Any]) -> str | None:
    for field in ("published", "published-print", "published-online", "issued"):
        parts = ((item.get(field) or {}).get("date-parts") or [[None]])[0]
        if parts and parts[0]:
            return "-".join(f"{p:02d}" if i else str(p) for i, p in enumerate(parts) if p)
    return None


def parse_crossref_item(item: dict[str, Any]) -> dict[str, Any]:
    doi = item.get("DOI")
    authors = []
    for author in item.get("author") or []:
        name = " ".join(part for part in (author.get("given"), author.get("family")) if part) or author.get("name")
        if name:
            authors.append(name)
    titles = item.get("title") or []
    venues = item.get("container-title") or []
    return {
        "key": f"crossref:{doi}",
        "source": "crossref",
        "title": strip_markup(titles[0]) if titles else "Untitled work",
        "authors": authors[:12],
        "published": _crossref_date(item),
        "venue": venues[0] if venues else None,
        "doi": doi,
        "url": f"https://doi.org/{doi}" if doi else item.get("URL"),
        "abstract": strip_markup(item.get("abstract")),
        "open_access": None,  # Crossref does not tell us; never assumed
        "open_access_url": None,
        "cited_by": item.get("is-referenced-by-count"),
        "type": item.get("type"),
    }


def search_openalex(client: httpx2.Client, settings: Settings, query: str, field: SearchField,
                    page: int, page_size: int) -> tuple[list[dict[str, Any]], int]:
    params: dict[str, Any] = {
        "per_page": page_size,
        "page": page,
        "select": "id,doi,display_name,publication_year,publication_date,authorships,primary_location,"
                  "open_access,abstract_inverted_index,cited_by_count,type",
    }
    safe = query.replace(",", " ").replace("|", " ")  # filter syntax separators
    if field == "title":
        params["filter"] = f"title.search:{safe}"
    elif field == "author":
        params["filter"] = f"raw_author_name.search:{safe}"
    else:
        params["search"] = query
    if settings.openalex_api_key:
        params["api_key"] = settings.openalex_api_key.get_secret_value()
    data = get_json(client, "openalex", OPENALEX_URL, params=params)
    results = data.get("results") or []
    total = int((data.get("meta") or {}).get("count") or 0)
    return [parse_openalex_work(work) for work in results], total


def search_crossref(client: httpx2.Client, settings: Settings, query: str, field: SearchField,
                    page: int, page_size: int) -> tuple[list[dict[str, Any]], int]:
    params: dict[str, Any] = {
        "rows": page_size,
        "offset": (page - 1) * page_size,
        "select": "DOI,title,author,issued,published,published-print,published-online,container-title,"
                  "abstract,URL,type,is-referenced-by-count",
    }
    params["query.author" if field == "author" else "query.bibliographic"] = query
    if settings.contact_email:
        params["mailto"] = settings.contact_email  # Crossref "polite pool"
    data = get_json(client, "crossref", CROSSREF_URL, params=params)
    message = data.get("message") or {}
    return [parse_crossref_item(item) for item in message.get("items") or []], int(message.get("total-results") or 0)


ATTRIBUTION = {
    "openalex": "Metadata from OpenAlex (CC0), openalex.org",
    "crossref": "Metadata from Crossref (CC0), crossref.org",
}


def page_count(total: int, page_size: int, cap: int = 10_000) -> int:
    return math.ceil(min(total, cap) / page_size) if total else 0


__all__ = ["ProviderError", "search_openalex", "search_crossref", "ATTRIBUTION", "page_count"]
