"""In-memory sliding-window rate limiting.

State lives in the process, which suits a single Render instance. A deployment
with several instances would need a shared store such as Redis (see
docs/SECURITY.md).
"""

from __future__ import annotations

import threading
import time
from collections import deque

from fastapi import Depends, Request

from app.core.errors import AppError


class RateLimiter:
    def __init__(self, enabled: bool = True, max_keys: int = 50_000) -> None:
        self.enabled = enabled
        self._events: dict[str, deque[float]] = {}
        self._lock = threading.Lock()
        self._max_keys = max_keys
        self._last_sweep = time.monotonic()

    def check(self, key: str, limit: int, window_seconds: float) -> None:
        """Record one hit for `key`; raise 429 when the window is already full."""
        if not self.enabled:
            return
        now = time.monotonic()
        with self._lock:
            events = self._events.setdefault(key, deque())
            cutoff = now - window_seconds
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= limit:
                retry_after = max(1, int(events[0] + window_seconds - now) + 1)
                raise AppError(
                    429,
                    "rate_limited",
                    "Too many attempts. Please wait a moment and try again.",
                    details={"retry_after_seconds": retry_after},
                    headers={"Retry-After": str(retry_after)},
                )
            events.append(now)
            if now - self._last_sweep > 60 or len(self._events) > self._max_keys:
                self._sweep(now)

    # Failure counters (e.g. wrong passwords per account) are peeked before the
    # attempt and recorded only when it fails, so successful sign-ins never count.
    def is_exceeded(self, key: str, limit: int, window_seconds: float) -> int | None:
        """Return seconds until retry if `key` is over its limit, else None. Records nothing."""
        if not self.enabled:
            return None
        now = time.monotonic()
        with self._lock:
            events = self._events.get(key)
            if not events:
                return None
            cutoff = now - window_seconds
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= limit:
                return max(1, int(events[0] + window_seconds - now) + 1)
        return None

    def record(self, key: str) -> None:
        if not self.enabled:
            return
        with self._lock:
            self._events.setdefault(key, deque()).append(time.monotonic())

    def clear(self, key: str) -> None:
        with self._lock:
            self._events.pop(key, None)

    def _sweep(self, now: float) -> None:
        # Drop keys with no recent activity (the longest window used is 1 hour).
        stale = [key for key, events in self._events.items() if not events or events[-1] < now - 3600]
        for key in stale:
            del self._events[key]
        self._last_sweep = now

    def reset(self) -> None:
        with self._lock:
            self._events.clear()


def client_ip(request: Request) -> str:
    # With `uvicorn --proxy-headers`, request.client reflects X-Forwarded-For
    # from trusted proxies only.
    return request.client.host if request.client else "unknown"


def get_rate_limiter(request: Request) -> RateLimiter:
    return request.app.state.rate_limiter


def rate_limit(scope: str, limit: int, window_seconds: int):
    """Route dependency: limit requests per client IP for a named scope."""

    def dependency(request: Request) -> None:
        get_rate_limiter(request).check(f"{scope}:ip:{client_ip(request)}", limit, window_seconds)

    return Depends(dependency)
