"""Open-source contribution opportunities: GitHub issues labelled "good first issue".

Uses the official GitHub REST search API. Unauthenticated search allows about
10 requests per minute, so results are cached; GITHUB_TOKEN raises the limit.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

import httpx2

from app.core.config import Settings
from app.services.opportunities.http import get_json
from app.utils import to_naive_utc

SEARCH_URL = "https://api.github.com/search/issues"
_LANGUAGE = re.compile(r"^[A-Za-z0-9+#.\- ]{1,30}$")
_QUERY_STRIP = re.compile(r"[^\w\s+#.\-]")


def _summary(body: str | None) -> str:
    if not body:
        return ""
    text = re.sub(r"```.*?```", " ", body, flags=re.DOTALL)
    text = re.sub(r"<!--.*?-->", " ", text, flags=re.DOTALL)
    text = re.sub(r"[#>*_`\[\]]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:280] + ("…" if len(text) > 280 else "")


def parse_issue(item: dict[str, Any], language: str | None) -> dict[str, Any]:
    repository = (item.get("repository_url") or "").removeprefix("https://api.github.com/repos/")
    updated = item.get("updated_at")
    return {
        "key": f"github:{item['id']}",
        "title": item.get("title") or "Untitled issue",
        "repository": repository,
        "url": item["html_url"],
        "labels": [label["name"] for label in item.get("labels") or [] if label.get("name")][:6],
        "language": language,
        "comments": item.get("comments") or 0,
        "summary": _summary(item.get("body")),
        "updated_at": to_naive_utc(datetime.fromisoformat(updated.replace("Z", "+00:00"))) if updated else None,
    }


def search_good_first_issues(client: httpx2.Client, settings: Settings, query: str | None,
                             language: str | None, page: int, page_size: int) -> tuple[list[dict[str, Any]], int]:
    qualifiers = ['label:"good first issue"', "state:open", "is:issue", "is:public", "no:assignee", "archived:false"]
    if language and _LANGUAGE.match(language):
        qualifiers.append(f'language:"{language.strip()}"')
    if query:
        # Keep user text as plain search terms; strip characters that would form qualifiers.
        terms = _QUERY_STRIP.sub(" ", query).replace(":", " ").strip()
        if terms:
            qualifiers.insert(0, terms)
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token.get_secret_value()}"
    params = {"q": " ".join(qualifiers), "sort": "updated", "order": "desc", "per_page": page_size, "page": page}
    data = get_json(client, "github", SEARCH_URL, params=params, headers=headers)
    items = [parse_issue(item, language) for item in data.get("items") or [] if item.get("html_url")]
    return items, min(int(data.get("total_count") or 0), 1000)  # GitHub search returns at most 1000 results


ATTRIBUTION = "Live data from the GitHub REST API (issues labelled \"good first issue\")"
