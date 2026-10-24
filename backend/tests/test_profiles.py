from __future__ import annotations

import io

from PIL import Image


def full_profile(**overrides):
    payload = {
        "headline": "Backend engineer who loves climate tech",
        "bio": "I build APIs.",
        "institution": "Example University",
        "background": "BSc Computer Science",
        "skills": ["Python", "FastAPI", "ReactJS", "python"],
        "interests": ["Climate", "Open Source"],
        "experience_level": "intermediate",
        "preferred_roles": ["backend", "devops"],
        "availability": "part_time",
        "collaboration_mode": "remote",
        "github_url": "github.com/example",
        "visibility": "members",
    }
    payload.update(overrides)
    return payload


def test_profile_is_created_at_signup_and_updates_persist(h):
    api, user = h.register(name="Ada Lovelace")
    me = api.get("/api/profiles/me").json()
    assert me["handle"].startswith("ada-lovelace-")
    assert me["visibility"] == "members"  # private-by-default

    response = api.patch("/api/profiles/me", json=full_profile())
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["skills"] == ["Python", "FastAPI", "ReactJS"]  # case-insensitive dedupe
    assert updated["github_url"] == "https://github.com/example"
    assert updated["completeness"]["percent"] > 50

    reloaded = api.get("/api/profiles/me").json()  # survives a "refresh"
    assert reloaded["headline"] == "Backend engineer who loves climate tech"
    stored = h.db.profiles.find_one({"handle": me["handle"]})
    assert stored["skills_key"] == ["python", "fastapi", "react"]  # synonyms canonicalized


def test_profile_validation(h):
    api, _ = h.register()
    bad_github = api.patch("/api/profiles/me", json={"github_url": "https://gitlab.com/someone"})
    assert bad_github.status_code == 422
    assert "github.com" in bad_github.json()["error"]["message"]
    for hostile in ("javascript:alert(1)", "data:text/html,hi", "https://exa mple.com", "localhost"):
        response = api.patch("/api/profiles/me", json={"portfolio_url": hostile})
        assert response.status_code == 422, hostile
    ok = api.patch("/api/profiles/me", json={"portfolio_url": "example.com:8080/work"})
    assert ok.json()["portfolio_url"] == "https://example.com:8080/work"
    too_many = api.patch("/api/profiles/me", json={"skills": [f"skill{i}" for i in range(31)]})
    assert too_many.status_code == 422
    bad_enum = api.patch("/api/profiles/me", json={"experience_level": "wizard"})
    assert bad_enum.status_code == 422
    bad_handle = api.patch("/api/profiles/me", json={"handle": "Admin"})
    assert bad_handle.status_code == 422


def test_handles_are_unique(h):
    first, _ = h.register(name="First")
    second, _ = h.register(name="Second")
    assert first.patch("/api/profiles/me", json={"handle": "taken-handle"}).status_code == 200
    clash = second.patch("/api/profiles/me", json={"handle": "taken-handle"})
    assert clash.status_code == 409
    assert clash.json()["error"]["code"] == "handle_taken"


def test_visibility_rules(h):
    owner, _ = h.register(name="Owner")
    handle = owner.get("/api/profiles/me").json()["handle"]
    member, _ = h.register(name="Member")
    anonymous = h.client()

    # members-only by default
    assert anonymous.get(f"/api/profiles/{handle}").status_code == 404
    assert member.get(f"/api/profiles/{handle}").status_code == 200

    owner.patch("/api/profiles/me", json={"visibility": "public"})
    public = anonymous.get(f"/api/profiles/{handle}")
    assert public.status_code == 200
    assert "email" not in public.json() and "user_id" not in public.json()

    owner.patch("/api/profiles/me", json={"visibility": "hidden"})
    assert member.get(f"/api/profiles/{handle}").status_code == 404
    assert owner.get(f"/api/profiles/{handle}").status_code == 200


def test_directory_requires_auth_filters_and_hides_private_data(h):
    viewer, _ = h.register(name="Viewer")
    a, _ = h.register(name="Alice Backend")
    b, _ = h.register(name="Bob Designer")
    c, _ = h.register(name="Carol Hidden")
    a.patch("/api/profiles/me", json=full_profile())
    b.patch("/api/profiles/me", json=full_profile(skills=["Figma", "UX"], preferred_roles=["design"],
                                                   experience_level="advanced", headline="Designer"))
    c.patch("/api/profiles/me", json=full_profile(visibility="hidden"))

    assert h.client().get("/api/profiles").status_code == 401

    everyone = viewer.get("/api/profiles").json()
    names = {card["name"] for card in everyone["items"]}
    assert names == {"Alice Backend", "Bob Designer"}  # hidden + self excluded
    assert all("email" not in card and "user_id" not in card for card in everyone["items"])

    def names_for(params: str) -> set[str]:
        return {card["name"] for card in viewer.get(f"/api/profiles?{params}").json()["items"]}

    assert names_for("skills=react.js") == {"Alice Backend"}  # synonym match
    assert names_for("skills=python,figma") == {"Alice Backend", "Bob Designer"}
    assert names_for("skills=python,figma&skills_mode=all") == set()
    assert names_for("experience=advanced") == {"Bob Designer"}
    assert names_for("roles=design") == {"Bob Designer"}
    assert names_for("q=alice") == {"Alice Backend"}
    assert names_for("q=.*") == set()  # regex metacharacters are escaped


def _png_bytes(size=(600, 400), color=(108, 99, 255)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format="PNG")
    return buffer.getvalue()


def test_avatar_upload_is_reencoded_and_served(h):
    api, _ = h.register()
    response = api.post("/api/profiles/me/avatar", files={"file": ("me.png", _png_bytes(), "image/png")})
    assert response.status_code == 200, response.text
    avatar_url = response.json()["avatar_url"]
    assert avatar_url.startswith("/api/profiles/")

    image = api.get(avatar_url)
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/webp"
    decoded = Image.open(io.BytesIO(image.content))
    assert decoded.size == (256, 256)
    assert not decoded.info.get("exif")

    assert api.delete("/api/profiles/me/avatar").json()["avatar_url"] is None


def test_avatar_rejects_non_images_and_oversized_files(h):
    api, _ = h.register()
    fake = api.post("/api/profiles/me/avatar", files={"file": ("x.png", b"<?php echo 1; ?>", "image/png")})
    assert fake.status_code == 400
    wrong_type = api.post("/api/profiles/me/avatar", files={"file": ("x.svg", b"<svg/>", "image/svg+xml")})
    assert wrong_type.status_code == 415
    big = api.post("/api/profiles/me/avatar", files={"file": ("x.png", b"0" * 3_100_000, "image/png")})
    assert big.status_code == 413


def test_choose_username_at_signup_and_search_by_it(h):
    api = h.client()
    ok = api.post("/api/auth/signup", json={"name": "Ada Lovelace", "email": "ada@example.com",
                                            "password": "Sup3rSecret!pw", "username": "Ada-Codes"})
    assert ok.status_code == 201, ok.text
    assert ok.json()["user"]["profile"]["handle"] == "ada-codes"  # normalized

    clash = h.client().post("/api/auth/signup", json={"name": "Other", "email": "o@example.com",
                                                      "password": "Sup3rSecret!pw", "username": "ada-codes"})
    assert clash.status_code == 409 and clash.json()["error"]["code"] == "handle_taken"
    assert h.db.users.count_documents({"email": "o@example.com"}) == 0  # no orphan account
    bad = h.client().post("/api/auth/signup", json={"name": "X", "email": "x@example.com",
                                                    "password": "Sup3rSecret!pw", "username": "admin"})
    assert bad.status_code == 422

    anon = h.client()
    assert anon.get("/api/profiles/handle-available?handle=ada-codes").json()["available"] is False
    assert anon.get("/api/profiles/handle-available?handle=free-name").json()["available"] is True
    assert anon.get("/api/profiles/handle-available?handle=A!").json()["valid"] is False

    viewer, _ = h.register(name="Viewer")
    found = viewer.get("/api/profiles?q=@ada-codes").json()["items"]
    assert [p["handle"] for p in found] == ["ada-codes"]
    assert [p["handle"] for p in viewer.get("/api/profiles?q=codes").json()["items"]] == ["ada-codes"]
