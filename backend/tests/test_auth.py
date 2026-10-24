from __future__ import annotations

from datetime import timedelta

import jwt

from app.core.security import create_session_token
from tests.conftest import PASSWORD


def signup_payload(email: str = "grace@example.com", password: str = PASSWORD, name: str = "Grace Hopper"):
    return {"name": name, "email": email, "password": password}


def test_signup_creates_account_with_hashed_password_and_session(h):
    api = h.client()
    response = api.post("/api/auth/signup", json=signup_payload("Grace@Example.com"))
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["user"]["email"] == "grace@example.com"  # normalized
    assert body["user"]["role"] == "user"
    assert body["user"]["profile"]["name"] == "Grace Hopper"
    assert "password" not in response.text and "argon2" not in response.text

    stored = h.db.users.find_one({"email": "grace@example.com"})
    assert stored["password_hash"].startswith("$argon2id$")
    assert PASSWORD not in stored["password_hash"]
    assert h.db.profiles.count_documents({"user_id": stored["_id"]}) == 1

    cookie = next(c for c in api.http.cookies.jar if c.name == "hackmate_session")
    assert cookie.has_nonstandard_attr("HttpOnly")
    assert api.get("/api/auth/me").json()["user"]["email"] == "grace@example.com"


def test_signup_rejects_duplicate_email_case_insensitively(h):
    h.register(email="dup@example.com")
    response = h.client().post("/api/auth/signup", json=signup_payload("DUP@example.com"))
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "email_taken"


def test_signup_validation_errors_are_field_level_and_do_not_echo_input(h):
    api = h.client()
    response = api.post("/api/auth/signup", json={"name": "", "email": "not-an-email", "password": "short"})
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    fields = {detail["field"] for detail in error["details"]}
    assert {"name", "email", "password"} <= fields
    assert "short" not in response.text

    weak = api.post("/api/auth/signup", json=signup_payload(password="onlyletters"))
    assert weak.status_code == 422
    assert "letter and one number" in weak.json()["error"]["message"]


def test_login_success_and_generic_failures(h):
    h.register(email="lin@example.com")
    api = h.client()
    ok = api.post("/api/auth/login", json={"email": "LIN@example.com", "password": PASSWORD})
    assert ok.status_code == 200
    assert ok.json()["user"]["email"] == "lin@example.com"
    assert api.get("/api/auth/me").status_code == 200

    wrong = h.client().post("/api/auth/login", json={"email": "lin@example.com", "password": "Wrong12345"})
    unknown = h.client().post("/api/auth/login", json={"email": "nobody@example.com", "password": "Wrong12345"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()  # no account enumeration


def test_me_requires_authentication(h):
    response = h.client().get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "not_authenticated"


def test_logout_revokes_the_session_server_side(h):
    api, _ = h.register()
    stolen_cookie = api.http.cookies.get("hackmate_session")
    assert api.post("/api/auth/logout").status_code == 200
    assert api.get("/api/auth/me").status_code == 401

    replay = h.client()
    replay.http.cookies.set("hackmate_session", stolen_cookie)
    assert replay.get("/api/auth/me").status_code == 401


def test_csrf_token_required_for_state_changing_requests(h):
    api = h.client()
    no_header = api.http.post("/api/auth/login", json={"email": "a@example.com", "password": "x"})
    assert no_header.status_code == 403
    assert no_header.json()["error"]["code"] == "csrf_failed"

    api.ensure_csrf()
    mismatched = api.http.post("/api/auth/login", json={"email": "a@example.com", "password": "x"},
                               headers={"X-CSRF-Token": "forged-token-value-that-does-not-match"})
    assert mismatched.status_code == 403


def test_foreign_origin_is_rejected(h):
    api = h.client()
    response = api.post("/api/auth/login", json={"email": "a@example.com", "password": "x"},
                        headers={"Origin": "https://evil.example"})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "origin_not_allowed"


def test_tampered_or_foreign_tokens_are_rejected(h):
    api, user = h.register()
    token = api.http.cookies.get("hackmate_session")
    forged = jwt.encode({**jwt.decode(token, options={"verify_signature": False}), "sub": user["id"]},
                        "attacker-controlled-secret-that-is-long-enough", algorithm="HS256")
    attacker = h.client()
    attacker.http.cookies.set("hackmate_session", forged)
    assert attacker.get("/api/auth/me").status_code == 401

    # A correctly signed token for a session that does not exist is also refused.
    bogus = create_session_token(user_id=user["id"], session_id="no-such-session",
                                 secret=h.app.state.settings.jwt_key, algorithm="HS256", ttl=timedelta(hours=1))
    attacker.http.cookies.set("hackmate_session", bogus)
    assert attacker.get("/api/auth/me").status_code == 401


def test_password_reset_flow_is_single_use_and_revokes_sessions(h):
    api, _ = h.register(email="reset@example.com")
    anonymous = h.client()
    forgot = anonymous.post("/api/auth/forgot-password", json={"email": "reset@example.com"})
    assert forgot.status_code == 200
    unknown = anonymous.post("/api/auth/forgot-password", json={"email": "ghost@example.com"})
    assert unknown.json()["message"] == forgot.json()["message"]

    token = h.mail.token_for("reset@example.com", "Password reset")
    stored = h.db.auth_tokens.find_one({"purpose": "reset_password"})
    assert token not in str(stored)  # only the hash is stored

    reset = anonymous.post("/api/auth/reset-password", json={"token": token, "password": "BrandNew123"})
    assert reset.status_code == 200
    assert api.get("/api/auth/me").status_code == 401  # existing sessions revoked
    reuse = anonymous.post("/api/auth/reset-password", json={"token": token, "password": "Another123"})
    assert reuse.status_code == 400

    login = h.client().post("/api/auth/login", json={"email": "reset@example.com", "password": "BrandNew123"})
    assert login.status_code == 200


def test_email_verification_flow(h):
    api, user = h.register(email="verify@example.com")
    assert user["email_verified"] is False
    token = h.mail.token_for("verify@example.com", "Email verification")
    assert h.client().post("/api/auth/verify-email", json={"token": token}).status_code == 200
    assert api.get("/api/auth/me").json()["user"]["email_verified"] is True
    assert h.client().post("/api/auth/verify-email", json={"token": token}).status_code == 400


def test_required_email_verification_blocks_login_until_verified(harness_factory):
    h = harness_factory(require_email_verification=True)
    api = h.client()
    signup = api.post("/api/auth/signup", json=signup_payload("strict@example.com"))
    assert signup.status_code == 201
    assert signup.json()["user"] is None and signup.json()["verification_required"] is True
    blocked = api.post("/api/auth/login", json={"email": "strict@example.com", "password": PASSWORD})
    assert blocked.status_code == 403 and blocked.json()["error"]["code"] == "email_not_verified"

    token = h.mail.token_for("strict@example.com", "Email verification")
    api.post("/api/auth/verify-email", json={"token": token})
    assert api.post("/api/auth/login", json={"email": "strict@example.com", "password": PASSWORD}).status_code == 200


def test_repeated_failed_logins_lock_the_account_temporarily(harness_factory):
    h = harness_factory(rate_limit_enabled=True)
    h.register(email="target@example.com")
    for _ in range(8):
        attempt = h.client().post("/api/auth/login", json={"email": "target@example.com", "password": "Wrong12345"})
        assert attempt.status_code == 401
    locked = h.client().post("/api/auth/login", json={"email": "target@example.com", "password": PASSWORD})
    assert locked.status_code == 429
    assert "Retry-After" in locked.headers


def test_signup_is_rate_limited_per_ip(harness_factory):
    h = harness_factory(rate_limit_enabled=True)
    api = h.client()
    codes = [api.post("/api/auth/signup", json=signup_payload(f"u{i}@example.com")).status_code for i in range(6)]
    assert codes[:5] == [201] * 5 and codes[5] == 429


def test_suspended_accounts_cannot_sign_in_or_use_sessions(h):
    api, _ = h.register(email="bad@example.com")
    h.db.users.update_one({"email": "bad@example.com"}, {"$set": {"status": "suspended"}})
    assert api.get("/api/auth/me").json()["error"]["code"] == "account_suspended"
    login = h.client().post("/api/auth/login", json={"email": "bad@example.com", "password": PASSWORD})
    assert login.status_code == 403


def test_change_password_signs_out_other_devices(h):
    phone, _ = h.register(email="multi@example.com")
    laptop = h.client()
    laptop.post("/api/auth/login", json={"email": "multi@example.com", "password": PASSWORD})

    wrong = phone.post("/api/auth/change-password", json={"current_password": "nope", "new_password": "Changed123"})
    assert wrong.status_code == 400
    ok = phone.post("/api/auth/change-password", json={"current_password": PASSWORD, "new_password": "Changed123"})
    assert ok.status_code == 200
    assert phone.get("/api/auth/me").status_code == 200
    assert laptop.get("/api/auth/me").status_code == 401


def test_meta_config_reports_capabilities(h):
    body = h.client().get("/api/meta/config").json()
    assert body["in_memory_database"] is True
    assert set(body) >= {"email_delivery_enabled", "email_verification_required", "environment"}
