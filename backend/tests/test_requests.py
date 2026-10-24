from __future__ import annotations

from tests.helpers import create_project, handle_of


def setup_project(h, **overrides):
    owner, _ = h.register(name="Owner Olivia")
    project = create_project(owner, **overrides)
    return owner, project


def test_application_lifecycle_accept_creates_membership_and_notifies(h):
    owner, project = setup_project(h)
    applicant, _ = h.register(name="Applicant Arun")

    created = applicant.post(f"/api/projects/{project['id']}/requests",
                             json={"message": "I'd love to build the frontend.", "role": "frontend"})
    assert created.status_code == 201
    request = created.json()
    assert request["status"] == "pending" and request["direction"] == "outgoing" and request["can_withdraw"]

    incoming = owner.get("/api/requests?box=incoming").json()["items"]
    assert len(incoming) == 1 and incoming[0]["person"]["name"] == "Applicant Arun"
    assert incoming[0]["can_decide"] is True
    assert "email" not in str(incoming)
    assert owner.get("/api/notifications/unread-count").json()["count"] == 1

    accepted = owner.post(f"/api/requests/{request['id']}/accept")
    assert accepted.status_code == 200 and accepted.json()["status"] == "accepted"

    detail = applicant.get(f"/api/projects/{project['id']}").json()
    assert detail["member_count"] == 2 and detail["viewer"]["is_member"] is True
    members = applicant.get(f"/api/projects/{project['id']}/members").json()
    assert [m["person"]["name"] for m in members] == ["Owner Olivia", "Applicant Arun"]
    assert members[1]["functional_role"] == "frontend"
    notes = applicant.get("/api/notifications").json()["items"]
    assert notes[0]["type"] == "request_accepted"


def test_duplicate_and_invalid_applications_are_rejected(h):
    owner, project = setup_project(h)
    applicant, _ = h.register(name="Applicant")
    url = f"/api/projects/{project['id']}/requests"
    assert applicant.post(url, json={}).status_code == 201
    duplicate = applicant.post(url, json={})
    assert duplicate.status_code == 409 and duplicate.json()["error"]["code"] == "cannot_request"
    assert h.db.join_requests.count_documents({"status": "pending"}) == 1

    own = owner.post(url, json={})
    assert own.status_code == 409 and "own this project" in own.json()["error"]["message"]


def test_withdraw_then_reapply(h):
    _, project = setup_project(h)
    applicant, _ = h.register()
    url = f"/api/projects/{project['id']}/requests"
    first = applicant.post(url, json={}).json()
    withdrawn = applicant.post(f"/api/requests/{first['id']}/withdraw")
    assert withdrawn.json()["status"] == "withdrawn"
    assert applicant.post(f"/api/requests/{first['id']}/withdraw").status_code == 409
    assert applicant.post(url, json={}).status_code == 201  # partial unique index allows a new pending one


def test_only_the_decider_can_accept_or_reject(h):
    owner, project = setup_project(h)
    applicant, _ = h.register(name="Applicant")
    stranger, _ = h.register(name="Stranger")
    request = applicant.post(f"/api/projects/{project['id']}/requests", json={}).json()

    assert applicant.post(f"/api/requests/{request['id']}/accept").status_code == 403
    assert stranger.post(f"/api/requests/{request['id']}/accept").status_code == 404
    assert stranger.get(f"/api/requests/{request['id']}").status_code == 404
    assert owner.post(f"/api/requests/{request['id']}/withdraw").status_code == 403

    rejected = owner.post(f"/api/requests/{request['id']}/reject", json={"note": "Team is set for now"})
    assert rejected.json()["status"] == "rejected"
    assert owner.post(f"/api/requests/{request['id']}/accept").status_code == 409
    note = applicant.get("/api/notifications").json()["items"][0]
    assert note["type"] == "request_rejected" and note["body"] == "Team is set for now"


def test_team_capacity_is_never_exceeded(h):
    owner, project = setup_project(h, max_team_size=2)
    first, _ = h.register(name="First")
    second, _ = h.register(name="Second")
    r1 = first.post(f"/api/projects/{project['id']}/requests", json={}).json()
    r2 = second.post(f"/api/projects/{project['id']}/requests", json={}).json()

    assert owner.post(f"/api/requests/{r1['id']}/accept").status_code == 200
    full = owner.post(f"/api/requests/{r2['id']}/accept")
    assert full.status_code == 409 and full.json()["error"]["code"] == "team_full"
    assert h.db.projects.find_one({})["member_count"] == 2
    assert h.db.team_memberships.count_documents({}) == 2
    assert h.db.join_requests.find_one({"user_id": {"$ne": None}, "status": "pending"}) is not None

    third, _ = h.register(name="Third")
    blocked = third.post(f"/api/projects/{project['id']}/requests", json={})
    assert blocked.status_code == 409 and "full" in blocked.json()["error"]["message"]


def test_cannot_apply_when_not_recruiting(h):
    owner, project = setup_project(h, status="active")
    applicant, _ = h.register()
    response = applicant.post(f"/api/projects/{project['id']}/requests", json={})
    assert response.status_code == 409
    assert "not recruiting" in response.json()["error"]["message"]


def test_invitation_lifecycle(h):
    owner, project = setup_project(h)
    invitee, _ = h.register(name="Invitee Ivy")
    invitee_handle = handle_of(invitee)

    sent = owner.post(f"/api/projects/{project['id']}/invitations",
                      json={"handle": invitee_handle, "message": "Join us?", "role": "design"})
    assert sent.status_code == 201
    invitation = sent.json()
    assert invitation["direction"] == "outgoing" and invitation["can_withdraw"]

    assert owner.post(f"/api/requests/{invitation['id']}/accept").status_code == 403  # owner isn't the decider
    incoming = invitee.get("/api/requests?box=incoming").json()["items"]
    assert incoming[0]["kind"] == "invitation" and incoming[0]["person"]["name"] == "Owner Olivia"

    assert invitee.post(f"/api/requests/{invitation['id']}/accept").status_code == 200
    assert invitee.get(f"/api/projects/{project['id']}").json()["viewer"]["is_member"] is True
    again = owner.post(f"/api/projects/{project['id']}/invitations", json={"handle": invitee_handle})
    assert again.status_code == 409 and again.json()["error"]["code"] == "already_member"


def test_invitations_respect_privacy_and_ownership(h):
    owner, project = setup_project(h)
    hidden, _ = h.register(name="Hidden Hana")
    hidden.patch("/api/profiles/me", json={"visibility": "hidden"})
    not_open, _ = h.register(name="Busy Ben")
    not_open.patch("/api/profiles/me", json={"open_to_collaborate": False})
    outsider, _ = h.register(name="Outsider")

    url = f"/api/projects/{project['id']}/invitations"
    assert owner.post(url, json={"handle": handle_of(hidden)}).status_code == 404
    assert owner.post(url, json={"handle": handle_of(not_open)}).json()["error"]["code"] == "not_open"
    assert outsider.post(url, json={"handle": handle_of(not_open)}).status_code == 403


def test_leave_and_remove_members(h):
    owner, project = setup_project(h)
    member_a, _ = h.register(name="Member A")
    member_b, _ = h.register(name="Member B")
    for member in (member_a, member_b):
        r = member.post(f"/api/projects/{project['id']}/requests", json={}).json()
        owner.post(f"/api/requests/{r['id']}/accept")
    assert h.db.projects.find_one({})["member_count"] == 3

    assert member_a.post(f"/api/projects/{project['id']}/leave").status_code == 204
    assert owner.post(f"/api/projects/{project['id']}/leave").status_code == 400
    assert member_a.delete(f"/api/projects/{project['id']}/members/{handle_of(member_b)}").status_code == 403
    assert owner.delete(f"/api/projects/{project['id']}/members/{handle_of(member_b)}").status_code == 204
    assert h.db.projects.find_one({})["member_count"] == 1
    types = {n["type"] for n in owner.get("/api/notifications").json()["items"]}
    assert "member_left" in types


def test_request_summary_and_notification_ownership(h):
    owner, project = setup_project(h)
    applicant, _ = h.register()
    applicant.post(f"/api/projects/{project['id']}/requests", json={})
    assert owner.get("/api/requests/summary").json() == {"incoming_pending": 1, "outgoing_pending": 0}
    assert applicant.get("/api/requests/summary").json() == {"incoming_pending": 0, "outgoing_pending": 1}

    note_id = owner.get("/api/notifications").json()["items"][0]["id"]
    assert applicant.post(f"/api/notifications/{note_id}/read").status_code == 404
    assert owner.post(f"/api/notifications/{note_id}/read").json()["read"] is True
    assert owner.get("/api/notifications/unread-count").json()["count"] == 0
