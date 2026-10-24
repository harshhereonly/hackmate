"""Test fixtures.

Every test gets a fresh app backed by an in-memory mongomock database, fast
Argon2 parameters, rate limiting off (except where a test turns it on), and a
fake mailbox that captures verification/reset links.
"""

from __future__ import annotations

import re
import uuid
from typing import Any

import pytest
from argon2 import PasswordHasher
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.security import set_password_hasher
from app.main import create_app

PASSWORD = "Sup3rSecret!pw"


@pytest.fixture(scope="session", autouse=True)
def _fast_password_hashing():
    set_password_hasher(PasswordHasher(time_cost=1, memory_cost=8, parallelism=1))


class FakeEmailSender:
    def __init__(self) -> None:
        self.outbox: list[dict[str, Any]] = []

    @property
    def enabled(self) -> bool:
        return True

    def send(self, to: str, subject: str, body: str, *, purpose: str, dev_link: str | None = None) -> str:
        self.outbox.append({"to": to, "subject": subject, "body": body, "purpose": purpose, "link": dev_link})
        return "sent"

    def token_for(self, to: str, purpose: str) -> str:
        for message in reversed(self.outbox):
            if message["to"] == to and message["purpose"] == purpose:
                match = re.search(r"token=([A-Za-z0-9_\-]+)", message["link"])
                assert match, message
                return match.group(1)
        raise AssertionError(f"No {purpose} email sent to {to}")


class ApiClient:
    """TestClient wrapper that behaves like the SPA: fetches and echoes the CSRF token."""

    def __init__(self, http: TestClient) -> None:
        self.http = http
        self.csrf: str | None = None

    def ensure_csrf(self) -> str:
        if not self.csrf:
            self.csrf = self.http.get("/api/auth/csrf").json()["csrf_token"]
        return self.csrf

    def request(self, method: str, url: str, **kwargs: Any):
        headers = dict(kwargs.pop("headers", None) or {})
        if method.upper() not in ("GET", "HEAD", "OPTIONS"):
            headers.setdefault("X-CSRF-Token", self.ensure_csrf())
        response = self.http.request(method, url, headers=headers, **kwargs)
        if response.headers.get("content-type", "").startswith("application/json"):
            body = response.json()
            if isinstance(body, dict) and body.get("csrf_token"):
                self.csrf = body["csrf_token"]
        return response

    def get(self, url: str, **kwargs: Any):
        return self.request("GET", url, **kwargs)

    def post(self, url: str, **kwargs: Any):
        return self.request("POST", url, **kwargs)

    def patch(self, url: str, **kwargs: Any):
        return self.request("PATCH", url, **kwargs)

    def put(self, url: str, **kwargs: Any):
        return self.request("PUT", url, **kwargs)

    def delete(self, url: str, **kwargs: Any):
        return self.request("DELETE", url, **kwargs)


def make_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "_env_file": None,
        "environment": "test",
        "use_in_memory_db": True,
        "in_memory_db_snapshot": None,
        "rate_limit_enabled": False,
        "external_providers_enabled": False,
        "jwt_secret": "test-secret-" + "x" * 40,
    }
    values.update(overrides)
    return Settings(**values)


class Harness:
    """One app plus helpers to create independent browser-like clients (cookie jars)."""

    def __init__(self, app) -> None:
        self.app = app
        self.mail = FakeEmailSender()
        app.state.email = self.mail
        self._root = TestClient(app)
        self._root.__enter__()  # runs the lifespan (database + indexes)

    @property
    def db(self):
        return self.app.state.db_manager.db

    def client(self) -> ApiClient:
        return ApiClient(TestClient(self.app))

    def register(self, name: str = "Ada Lovelace", email: str | None = None,
                 password: str = PASSWORD) -> tuple[ApiClient, dict[str, Any]]:
        api = self.client()
        email = email or f"{uuid.uuid4().hex[:10]}@example.com"
        response = api.post("/api/auth/signup", json={"name": name, "email": email, "password": password})
        assert response.status_code == 201, response.text
        body = response.json()
        return api, body["user"]

    def make_admin(self, email: str) -> None:
        self.db.users.update_one({"email": email}, {"$set": {"role": "admin"}})

    def close(self) -> None:
        self._root.__exit__(None, None, None)


@pytest.fixture
def harness_factory():
    created: list[Harness] = []

    def factory(**overrides: Any) -> Harness:
        harness = Harness(create_app(make_settings(**overrides)))
        created.append(harness)
        return harness

    yield factory
    for harness in created:
        harness.close()


@pytest.fixture
def h(harness_factory) -> Harness:
    return harness_factory()
