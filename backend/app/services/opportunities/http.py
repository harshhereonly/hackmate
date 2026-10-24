"""Shared HTTP plumbing for external providers: errors, a TTL cache, JSON fetching."""

from __future__ import annotations

import threading
import time
from collections import OrderedDict
from typing import Any, Hashable

import httpx2

from app.core.config import Settings


class ProviderError(Exception):
    def __init__(self, provider: str, reason: str, status: int | None = None) -> None:
        super().__init__(f"{provider}: {reason}")
        self.provider = provider
        self.reason = reason
        self.status = status


class TTLCache:
    """Small thread-safe LRU cache with expiry. Protects upstream daily budgets."""

    def __init__(self, ttl_seconds: float, max_entries: int = 512) -> None:
        self.ttl = ttl_seconds
        self.max_entries = max_entries
        self._data: OrderedDict[Hashable, tuple[float, Any]] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: Hashable) -> Any | None:
        if self.ttl <= 0:
            return None
        with self._lock:
            entry = self._data.get(key)
            if entry is None:
                return None
            expires, value = entry
            if expires < time.monotonic():
                del self._data[key]
                return None
            self._data.move_to_end(key)
            return value

    def set(self, key: Hashable, value: Any) -> None:
        if self.ttl <= 0:
            return
        with self._lock:
            self._data[key] = (time.monotonic() + self.ttl, value)
            self._data.move_to_end(key)
            while len(self._data) > self.max_entries:
                self._data.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()


def build_http_client(settings: Settings) -> httpx2.Client:
    contact = f"; mailto:{settings.contact_email}" if settings.contact_email else ""
    return httpx2.Client(
        timeout=httpx2.Timeout(settings.provider_timeout_seconds),
        headers={"User-Agent": f"HackMate/{settings.app_version} (+{settings.frontend_url}{contact})"},
        follow_redirects=False,
    )


def get_json(client: httpx2.Client, provider: str, url: str, *, params: dict[str, Any] | None = None,
             headers: dict[str, str] | None = None) -> Any:
    try:
        response = client.get(url, params=params, headers=headers)
    except httpx2.TimeoutException:
        raise ProviderError(provider, "timed out") from None
    except httpx2.HTTPError:
        raise ProviderError(provider, "network error") from None
    if response.status_code == 429 or (response.status_code == 403 and "rate limit" in response.text.lower()):
        raise ProviderError(provider, "rate limited", response.status_code)
    if response.status_code >= 400:
        raise ProviderError(provider, f"HTTP {response.status_code}", response.status_code)
    try:
        return response.json()
    except ValueError:
        raise ProviderError(provider, "invalid JSON") from None
