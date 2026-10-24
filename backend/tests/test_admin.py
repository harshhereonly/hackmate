from __future__ import annotations

import pytest

from tests.conftest import PASSWORD
from tests.helpers import create_project, handle_of

ADMIN_GETS = ["/api/admin/stats", "/api/admin/users", "/api/admin/reports", "/api/admin/listings",
              "/api/admin/opportunities", "/api/admin/audit", "/api/admin/providers"]


def admin_client(h):
    api, user = h.register(name="Admin Amal", email="admin@example.com")
    h.make_admin("admin@example.com")
    return api


@pytest.mark.parametrize("path", ADMIN_GETS)
def test_admin_endpoints_reject_anonymous_and_regular_users(h, path):
    assert h.client().get(path).status_code == 401
    member, _ = h.register()
    response = member.get(path)
    assert response.status_code == 403 and response.json()["error"]["code"] == "admin_required"


def test_role_is_never_taken_from_the_client(h):
    api = h.client()
    signup = api.post("/api/auth/signup", json={"name": "Sneaky", "email": "sneaky@example.com",
                                                "password": PASSWORD, "role": "admin"})
    assert signup.json()["user"]["role"] == "user"
    api.patch("/api/profiles/me", json={"role": "admin"})
    assert api.get("/api/admin/stats").status_code == 403
    assert h.db.users.find_one({"email": "sneaky@example.com"})["role"] == "user"


def test_admin_dashboard_stats_and_user_list(h):
    admin = admin_client(h)
    h.register(name="Member One")
    stats = admin.get("/api/admin/stats").json()
    assert stats["users"]["total"] == 2 and stats["users"]["admins"] == 1
    users = admin.get("/api/admin/users?q=member").json()["items"]
    assert [u["name"] for u in users] == ["Member One"]
    assert "password_hash" not in str(users)


def test_report_flow_and_moderation_with_audit_log(h):
    admin = admin_client(h)
    owner, _ = h.register(name="Spammy Owner")
    reporter, _ = h.register(name="Reporter Rae")
    project = create_project(owner, title="Buy followers cheap")

    report = reporter.post("/api/reports", json={"target_type": "project", "target_id": project["id"],
                                                  "reason": "spam", "details": "Obvious spam"})
    assert report.status_code == 201
    duplicate = reporter.post("/api/reports", json={"target_type": "project", "target_id": project["id"],
                                                     "reason": "spam"})
    assert duplicate.status_code == 409
    assert owner.post("/api/reports", json={"target_type": "project", "target_id": project["id"],
                                            "reason": "spam"}).status_code == 400  # own project

    queue = admin.get("/api/admin/reports").json()["items"]
    assert queue[0]["target"]["label"] == "Buy followers cheap" and queue[0]["reporter"]["name"] == "Reporter Rae"

    removed = admin.post(f"/api/admin/projects/{project['id']}/remove", json={"reason": "Spam listing"})
    assert removed.status_code == 200
    assert reporter.get(f"/api/projects/{project['id']}").status_code == 404
    assert owner.get("/api/notifications").json()["items"][0]["type"] == "listing_removed"

    resolved = admin.post(f"/api/admin/reports/{queue[0]['id']}/resolve",
                          json={"resolution": "resolved", "note": "Removed the listing"})
    assert resolved.json()["status"] == "resolved"
    assert admin.post(f"/api/admin/reports/{queue[0]['id']}/resolve",
                      json={"resolution": "dismissed"}).status_code == 409
    assert reporter.get("/api/reports/mine").json()["items"][0]["status"] == "resolved"

    admin.post(f"/api/admin/projects/{project['id']}/restore")
    assert reporter.get(f"/api/projects/{project['id']}").status_code == 200

    actions = [entry["action"] for entry in admin.get("/api/admin/audit").json()["items"]]
    assert actions == ["project_restored", "report_resolved", "project_removed"]
    assert all(entry["admin"]["name"] == "Admin Amal" for entry in admin.get("/api/admin/audit").json()["items"])


def test_suspend_and_reactivate_accounts(h):
    admin = admin_client(h)
    member, user = h.register(name="Troublemaker", email="trouble@example.com")
    handle = handle_of(member)

    assert admin.post(f"/api/admin/users/{user['id']}/suspend", json={"reason": "x"}).status_code == 422
    suspended = admin.post(f"/api/admin/users/{user['id']}/suspend", json={"reason": "Harassment reports"})
    assert suspended.json()["status"] == "suspended"
    assert member.get("/api/auth/me").status_code == 401  # sessions revoked
    login = h.client().post("/api/auth/login", json={"email": "trouble@example.com", "password": PASSWORD})
    assert login.status_code == 403
    viewer, _ = h.register(name="Viewer")
    assert viewer.get(f"/api/profiles/{handle}").status_code == 404
    assert "Troublemaker" not in str(viewer.get("/api/profiles").json())

    admin.post(f"/api/admin/users/{user['id']}/reactivate")
    assert h.client().post("/api/auth/login", json={"email": "trouble@example.com",
                                                    "password": PASSWORD}).status_code == 200
    assert viewer.get(f"/api/profiles/{handle}").status_code == 200


def test_admins_cannot_suspend_themselves_or_other_admins(h):
    admin = admin_client(h)
    me = admin.get("/api/auth/me").json()["user"]
    assert admin.post(f"/api/admin/users/{me['id']}/suspend", json={"reason": "testing"}).status_code == 400
    _, other = h.register(email="other-admin@example.com")
    h.make_admin("other-admin@example.com")
    assert admin.post(f"/api/admin/users/{other['id']}/suspend", json={"reason": "testing"}).status_code == 403


def test_curated_opportunity_management(h):
    admin = admin_client(h)
    member, _ = h.register()
    payload = {"type": "hackathon", "title": "City Open Data Hackathon",
               "summary": "A curated listing for an organizer-run hackathon.",
               "url": "https://example.org/register", "organizer": "Example City", "mode": "in_person",
               "location": "Example City Hall", "starts_at": "2030-03-01T09:00:00Z", "ends_at": "2030-03-02T18:00:00Z",
               "skills": ["Python"], "source_name": "Official site", "source_url": "https://example.org"}
    assert member.post("/api/admin/opportunities", json=payload).status_code == 403
    no_link = admin.post("/api/admin/opportunities", json={**payload, "url": None})
    assert no_link.status_code == 400

    created = admin.post("/api/admin/opportunities", json=payload)
    assert created.status_code == 201
    opp = created.json()
    assert opp["verified"] is True and opp["source"]["kind"] == "curated" and opp["timing"] == "upcoming"
    public = member.get(f"/api/opportunities/{opp['id']}").json()
    assert public["url"] == "https://example.org/register"

    updated = admin.patch(f"/api/admin/opportunities/{opp['id']}", json={"title": "City Open Data Hack 2030"})
    assert updated.json()["title"] == "City Open Data Hack 2030"
    assert admin.delete(f"/api/admin/opportunities/{opp['id']}").status_code == 204

    community = member.post("/api/opportunities", json={
        "title": "Looking for a stats collaborator", "summary": "Need help analysing survey data for a paper."}).json()
    assert admin.patch(f"/api/admin/opportunities/{community['id']}", json={"title": "Edited"}).status_code == 403
    assert admin.post(f"/api/admin/opportunities/{community['id']}/remove",
                      json={"reason": "Off-topic"}).status_code == 200
    assert admin.post("/api/admin/opportunities/sync-feeds").status_code == 400  # none configured


def test_message_reports_are_limited_to_participants(h):
    admin = admin_client(h)
    alice, _ = h.register(name="Alice")
    bob, _ = h.register(name="Bob")
    eve, _ = h.register(name="Eve")
    cid = alice.post("/api/conversations/direct", json={"handle": handle_of(bob)}).json()["id"]
    message = alice.post(f"/api/conversations/{cid}/messages", json={"body": "rude message"}).json()

    assert eve.post("/api/reports", json={"target_type": "message", "target_id": message["id"],
                                          "reason": "harassment"}).status_code == 404
    assert alice.post("/api/reports", json={"target_type": "message", "target_id": message["id"],
                                            "reason": "harassment"}).status_code == 400
    assert bob.post("/api/reports", json={"target_type": "message", "target_id": message["id"],
                                          "reason": "harassment"}).status_code == 201
    report = admin.get("/api/admin/reports?target_type=message").json()["items"][0]
    assert report["target"]["body"] == "rude message"
    admin.post(f"/api/admin/messages/{message['id']}/remove", json={"reason": "Harassment"})
    history = bob.get(f"/api/conversations/{cid}/messages").json()["items"]
    assert history[0]["deleted"] is True and history[0]["body"] == ""
