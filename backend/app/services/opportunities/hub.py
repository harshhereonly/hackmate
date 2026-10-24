"""Entry point for live external data: caching, fallback and health tracking.

The UI talks to this layer through the API. It never calls providers directly,
so a provider can be swapped or disabled without touching the UI.
"""

from __future__ import annotations

from typing import Any, Callable

import httpx2

from app.core.config import Settings
from app.core.errors import AppError
from app.services.opportunities import github, papers
from app.services.opportunities.http import ProviderError, TTLCache, build_http_client
from app.utils import utcnow

PROVIDER_NAMES = {"openalex": "OpenAlex", "crossref": "Crossref", "github": "GitHub", "feed": "Organizer feeds"}


class ProviderHub:
    def __init__(self, settings: Settings, client: httpx2.Client | None = None) -> None:
        self.settings = settings
        self.client = client or build_http_client(settings)
        self.cache = TTLCache(settings.provider_cache_ttl_seconds)
        self.health: dict[str, dict[str, Any]] = {}

    def close(self) -> None:
        self.client.close()

    def _record(self, provider: str, ok: bool, reason: str | None = None) -> None:
        self.health[provider] = {"ok": ok, "reason": reason, "checked_at": utcnow()}

    def _require_enabled(self) -> None:
        if not self.settings.external_providers_enabled:
            raise AppError(503, "providers_disabled", "Live external data is turned off on this server.")

    def search_papers(self, query: str, field: papers.SearchField, page: int, page_size: int,
                      source: str = "auto") -> dict[str, Any]:
        self._require_enabled()
        cache_key = ("papers", source, field, query.strip().lower(), page, page_size)
        if (cached := self.cache.get(cache_key)) is not None:
            return cached
        searchers: dict[str, Callable] = {"openalex": papers.search_openalex, "crossref": papers.search_crossref}
        order = ["openalex", "crossref"] if source == "auto" else [source]
        failed: list[str] = []
        for name in order:
            try:
                items, total = searchers[name](self.client, self.settings, query, field, page, page_size)
            except ProviderError as exc:
                self._record(name, False, exc.reason)
                failed.append(name)
                continue
            self._record(name, True)
            notice = None
            if failed:
                notice = (f"{PROVIDER_NAMES[failed[0]]} is unavailable right now, "
                          f"so these results come from {PROVIDER_NAMES[name]}.")
            result = {
                "items": items, "total": total, "page": page, "page_size": page_size,
                "pages": papers.page_count(total, page_size), "source": name,
                "attribution": papers.ATTRIBUTION[name], "notice": notice,
            }
            self.cache.set(cache_key, result)
            return result
        raise AppError(503, "provider_unavailable",
                       "Paper search is temporarily unavailable. Please try again in a few minutes.",
                       details={"providers": failed})

    def search_open_source(self, query: str | None, language: str | None, page: int,
                           page_size: int) -> dict[str, Any]:
        self._require_enabled()
        cache_key = ("github", (query or "").strip().lower(), (language or "").lower(), page, page_size)
        if (cached := self.cache.get(cache_key)) is not None:
            return cached
        try:
            items, total = github.search_good_first_issues(self.client, self.settings, query, language, page, page_size)
        except ProviderError as exc:
            self._record("github", False, exc.reason)
            message = ("GitHub's search limit was reached. Results will be back shortly."
                       if exc.status in (403, 429) else "GitHub is unavailable right now. Please try again later.")
            raise AppError(503, "provider_unavailable", message, details={"providers": ["github"]}) from None
        self._record("github", True)
        result = {
            "items": items, "total": total, "page": page, "page_size": page_size,
            "pages": papers.page_count(total, page_size, cap=1000), "source": "github",
            "attribution": github.ATTRIBUTION, "notice": None,
        }
        self.cache.set(cache_key, result)
        return result

    def status(self) -> list[dict[str, Any]]:
        settings = self.settings
        configured = {
            "openalex": True,
            "crossref": True,
            "github": True,
            "feed": bool(settings.hackathon_feed_urls),
        }
        notes = {
            "openalex": "API key configured" if settings.openalex_api_key else "No API key (small shared daily budget)",
            "crossref": "Polite pool via CONTACT_EMAIL" if settings.contact_email else "Public pool (set CONTACT_EMAIL)",
            "github": "Token configured" if settings.github_token else "Unauthenticated (10 searches/minute)",
            "feed": f"{len(settings.hackathon_feed_urls)} feed URL(s)" if settings.hackathon_feed_urls else "No feeds configured",
        }
        return [
            {
                "id": key,
                "name": PROVIDER_NAMES[key],
                "enabled": settings.external_providers_enabled and configured[key],
                "note": notes[key],
                "last_check": self.health.get(key),
            }
            for key in ("openalex", "crossref", "github", "feed")
        ]
