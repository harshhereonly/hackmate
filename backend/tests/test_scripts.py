"""Seed data and admin provisioning (run against a temporary dev snapshot)."""

from __future__ import annotations

import pytest

from app.core import config
from app.db.local_store import load_snapshot
from app.services.demo_data import clear_demo_data, seed_demo_data
from scripts import create_admin, seed
from tests.conftest import make_settings


def test_demo_data_is_labelled_and_removable(h):
    counts = seed_demo_data(h.db)
    assert counts["users"] == 10 and counts["projects"] == 6
    assert all(p["title"].startswith("Sample:") for p in h.db.projects.find())
    assert all(o["title"].startswith("Sample:") and o["is_demo"] for o in h.db.opportunities.find())
    assert all(u["email"].endswith(".demo@example.com") for u in h.db.users.find())

    api, _ = h.register()
    listing = api.get("/api/opportunities?timing=all").json()["items"]
    assert listing and all(item["is_demo"] and item["url"] is None for item in listing)
    assert all(item["source"]["name"] in ("HackMate demo data", "Posted by a HackMate member") for item in listing)
    # Demo accounts have unusable passwords when no SEED_DEMO_PASSWORD is given.
    login = h.client().post("/api/auth/login", json={"email": "maya.chen.demo@example.com", "password": "Password1"})
    assert login.status_code == 401

    clear_demo_data(h.db)
    assert h.db.projects.count_documents({}) == 0 and h.db.profiles.count_documents({"is_demo": True}) == 0
    assert h.db.users.count_documents({}) == 1  # the real user is untouched


@pytest.fixture
def snapshot_env(tmp_path, monkeypatch):
    path = tmp_path / "db.json"
    settings = make_settings(in_memory_db_snapshot=str(path))
    monkeypatch.setattr(config, "get_settings", lambda: settings)
    monkeypatch.setattr(seed, "get_settings", lambda: settings)
    monkeypatch.setattr("scripts._db.get_settings", lambda: settings)
    return settings, path


def _reload(path):
    import mongomock

    db = mongomock.MongoClient()["hackmate"]
    load_snapshot(db, str(path))
    return db


def test_seed_cli_is_idempotent(snapshot_env, capsys):
    _, path = snapshot_env
    seed.main([])
    seed.main([])
    assert "already exists" in capsys.readouterr().out
    assert _reload(path).projects.count_documents({}) == 6
    seed.main(["--clear"])
    assert _reload(path).projects.count_documents({}) == 0


def test_seed_refuses_production(monkeypatch):
    prod = make_settings(environment="production", use_in_memory_db=False,
                         mongodb_uri="mongodb://example.invalid", jwt_secret="x" * 40)
    monkeypatch.setattr(seed, "get_settings", lambda: prod)
    with pytest.raises(SystemExit, match="production"):
        seed.main([])


def test_create_admin_creates_promotes_and_protects_last_admin(snapshot_env, monkeypatch):
    _, path = snapshot_env
    monkeypatch.setenv("ADMIN_PASSWORD", "weak")
    with pytest.raises(SystemExit, match="at least 8"):
        create_admin.main(["--email", "root@example.com"])

    monkeypatch.setenv("ADMIN_PASSWORD", "Str0ngAdminPass")
    create_admin.main(["--email", "Root@Example.com", "--name", "Root Admin"])
    db = _reload(path)
    admin = db.users.find_one({"email": "root@example.com"})
    assert admin["role"] == "admin" and admin["password_hash"].startswith("$argon2id$")
    assert db.profiles.find_one({"user_id": admin["_id"]})["name"] == "Root Admin"

    with pytest.raises(SystemExit, match="last administrator"):
        create_admin.main(["--email", "root@example.com", "--demote"])
