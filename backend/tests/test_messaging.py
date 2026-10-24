from __future__ import annotations

from tests.helpers import create_project, handle_of


def open_direct(api, handle):
    return api.post("/api/conversations/direct", json={"handle": handle})


def test_direct_conversation_send_read_and_unread_counts(h):
    alice, _ = h.register(name="Alice")
    bob, _ = h.register(name="Bob")
    opened = open_direct(alice, handle_of(bob))
    assert opened.status_code == 200
    conversation = opened.json()
    assert conversation["title"] == "Bob" and conversation["kind"] == "direct"
    assert open_direct(alice, handle_of(bob)).json()["id"] == conversation["id"]  # idempotent
    assert open_direct(bob, handle_of(alice)).json()["id"] == conversation["id"]  # same pair, either side

    sent = alice.post(f"/api/conversations/{conversation['id']}/messages", json={"body": "  Hi Bob!  "})
    assert sent.status_code == 201
    assert sent.json()["body"] == "Hi Bob!" and sent.json()["is_mine"] and sent.json()["seen_by"] == 0

    assert bob.get("/api/conversations/unread").json() == {"conversations": 1, "messages": 1}
    assert alice.get("/api/conversations/unread").json() == {"conversations": 0, "messages": 0}
    listed = bob.get("/api/conversations").json()["items"][0]
    assert listed["unread_count"] == 1 and listed["last_message"]["preview"] == "Hi Bob!"

    bob.post(f"/api/conversations/{conversation['id']}/read")
    assert bob.get("/api/conversations/unread").json()["messages"] == 0
    history = alice.get(f"/api/conversations/{conversation['id']}/messages").json()["items"]
    assert history[0]["seen_by"] == 1  # Bob has read it


def test_conversation_access_is_limited_to_participants(h):
    alice, _ = h.register(name="Alice")
    bob, _ = h.register(name="Bob")
    eve, _ = h.register(name="Eve")
    conversation = open_direct(alice, handle_of(bob)).json()
    cid = conversation["id"]
    alice.post(f"/api/conversations/{cid}/messages", json={"body": "secret"})

    assert eve.get(f"/api/conversations/{cid}").status_code == 404
    assert eve.get(f"/api/conversations/{cid}/messages").status_code == 404
    assert eve.post(f"/api/conversations/{cid}/messages", json={"body": "hi"}).status_code == 404
    assert eve.get("/api/conversations").json()["total"] == 0
    assert h.client().get(f"/api/conversations/{cid}/messages").status_code == 401


def test_messaging_permissions(h):
    alice, _ = h.register(name="Alice")
    hidden, _ = h.register(name="Hidden")
    hidden.patch("/api/profiles/me", json={"visibility": "hidden"})
    picky, _ = h.register(name="Picky")
    picky.patch("/api/profiles/me", json={"allow_messages": "teammates"})

    assert open_direct(alice, handle_of(alice)).status_code == 400
    assert open_direct(alice, handle_of(hidden)).status_code == 404
    blocked = open_direct(alice, handle_of(picky))
    assert blocked.status_code == 403 and blocked.json()["error"]["code"] == "messaging_not_allowed"
    assert alice.get(f"/api/profiles/{handle_of(picky)}").json()["can_message"] is False

    # Once they collaborate (a join request between them), messaging is allowed.
    project = create_project(picky)
    alice.post(f"/api/projects/{project['id']}/requests", json={})
    assert open_direct(alice, handle_of(picky)).status_code == 200


def test_message_validation_and_deletion(h):
    alice, _ = h.register(name="Alice")
    bob, _ = h.register(name="Bob")
    cid = open_direct(alice, handle_of(bob)).json()["id"]
    url = f"/api/conversations/{cid}/messages"
    assert alice.post(url, json={"body": "   "}).status_code == 422
    assert alice.post(url, json={"body": "x" * 2001}).status_code == 422
    message = alice.post(url, json={"body": "<script>alert(1)</script>"}).json()
    assert message["body"] == "<script>alert(1)</script>"  # stored as text; React escapes on render

    assert bob.delete(f"{url}/{message['id']}").status_code == 403
    deleted = alice.delete(f"{url}/{message['id']}").json()
    assert deleted["deleted"] is True and deleted["body"] == ""


def test_history_paging_and_polling(h):
    alice, _ = h.register(name="Alice")
    bob, _ = h.register(name="Bob")
    cid = open_direct(alice, handle_of(bob)).json()["id"]
    url = f"/api/conversations/{cid}/messages"
    ids = [alice.post(url, json={"body": f"message {i}"}).json()["id"] for i in range(7)]

    latest = alice.get(f"{url}?limit=3").json()
    assert [m["body"] for m in latest["items"]] == ["message 4", "message 5", "message 6"]
    assert latest["has_more"] is True
    older = alice.get(f"{url}?limit=3&before={latest['items'][0]['id']}").json()
    assert [m["body"] for m in older["items"]] == ["message 1", "message 2", "message 3"]
    newer = bob.get(f"{url}?after={ids[4]}").json()
    assert [m["body"] for m in newer["items"]] == ["message 5", "message 6"]
    assert alice.get(f"{url}?before={ids[1]}&after={ids[2]}").status_code == 400


def test_project_team_chat_follows_membership(h):
    owner, _ = h.register(name="Owner")
    member, _ = h.register(name="Member")
    outsider, _ = h.register(name="Outsider")
    project = create_project(owner)
    request = member.post(f"/api/projects/{project['id']}/requests", json={}).json()
    owner.post(f"/api/requests/{request['id']}/accept")

    chat = owner.post(f"/api/conversations/project/{project['id']}").json()
    assert chat["kind"] == "project" and chat["title"] == "Campus Carbon Tracker team"
    assert len(chat["participants"]) == 2
    assert member.post(f"/api/conversations/project/{project['id']}").json()["id"] == chat["id"]
    assert outsider.post(f"/api/conversations/project/{project['id']}").status_code == 403

    member.post(f"/api/conversations/{chat['id']}/messages", json={"body": "Hello team"})
    assert owner.get("/api/conversations/unread").json()["messages"] == 1

    member.post(f"/api/projects/{project['id']}/leave")
    assert member.get(f"/api/conversations/{chat['id']}").status_code == 404
    assert len(owner.get(f"/api/conversations/{chat['id']}").json()["participants"]) == 1


def test_cannot_message_suspended_people(h):
    alice, _ = h.register(name="Alice")
    bob, _ = h.register(name="Bob", email="bob@example.com")
    cid = open_direct(alice, handle_of(bob)).json()["id"]
    user = h.db.users.find_one({"email": "bob@example.com"})
    h.db.profiles.update_one({"user_id": user["_id"]}, {"$set": {"is_active": False}})
    response = alice.post(f"/api/conversations/{cid}/messages", json={"body": "hello?"})
    assert response.status_code == 403 and response.json()["error"]["code"] == "cannot_send"
