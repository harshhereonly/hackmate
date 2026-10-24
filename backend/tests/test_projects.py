from __future__ import annotations

from tests.helpers import create_project, project_payload


def test_create_project_persists_and_lists_immediately(h):
    owner, _ = h.register(name="Owner")
    project = create_project(owner)
    assert project["member_count"] == 1 and project["open_spots"] == 3
    assert project["viewer"]["is_owner"] is True
    assert project["owner"]["name"] == "Owner"

    listed = owner.get("/api/projects").json()
    assert [p["id"] for p in listed["items"]] == [project["id"]]
    again = h.client().get(f"/api/projects/{project['id']}")  # anonymous read after "refresh"
    assert again.status_code == 200 and again.json()["title"] == "Campus Carbon Tracker"
    assert h.db.team_memberships.count_documents({"role": "owner"}) == 1


def test_project_validation(h):
    owner, _ = h.register()
    cases = [
        {"title": "ab"},
        {"max_team_size": 1},
        {"max_team_size": 21},
        {"required_skills": []},
        {"required_skills": ["  ", ""]},
        {"repo_url": "javascript:alert(1)"},
        {"category": "nonsense"},
        {"summary": "short"},
    ]
    for override in cases:
        response = owner.post("/api/projects", json=project_payload(**override))
        assert response.status_code == 422, (override, response.text)


def test_only_owner_can_modify_or_delete(h):
    owner, _ = h.register(name="Owner")
    other, _ = h.register(name="Other")
    project = create_project(owner)
    url = f"/api/projects/{project['id']}"

    assert other.patch(url, json={"title": "Hijacked title"}).status_code == 403
    assert other.delete(url).status_code == 403
    anonymous = h.client()
    assert anonymous.patch(url, json={"title": "Hijacked title"}).status_code == 401
    assert owner.get(url).json()["title"] == "Campus Carbon Tracker"

    updated = owner.patch(url, json={"title": "Campus Carbon Tracker v2", "status": "active"})
    assert updated.status_code == 200 and updated.json()["status"] == "active"
    assert owner.delete(url).status_code == 204
    assert owner.get(url).status_code == 404


def test_cannot_shrink_team_below_member_count(h):
    owner, _ = h.register(name="Owner")
    project = create_project(owner, max_team_size=4)
    for name in ("First", "Second"):
        applicant, _ = h.register(name=name)
        request = applicant.post(f"/api/projects/{project['id']}/requests", json={"message": "Hi"}).json()
        assert owner.post(f"/api/requests/{request['id']}/accept").status_code == 200
    url = f"/api/projects/{project['id']}"
    assert owner.get(url).json()["member_count"] == 3

    too_small = owner.patch(url, json={"max_team_size": 2})
    assert too_small.status_code == 400
    assert too_small.json()["error"]["code"] == "team_size_too_small"
    assert owner.get(url).json()["max_team_size"] == 4  # unchanged
    assert owner.patch(url, json={"max_team_size": 3}).json()["open_spots"] == 0  # exactly full is fine


def test_list_filters(h):
    owner, _ = h.register()
    create_project(owner, title="Rust Robot Arm", required_skills=["Rust", "Arduino"], category="side_project",
                   collaboration_mode="in_person")
    create_project(owner, title="Open Data Portal", required_skills=["Python"], category="open_source",
                   status="active")
    full = create_project(owner, title="Tiny Team", required_skills=["Go"], max_team_size=2)
    h.db.projects.update_one({"title": "Tiny Team"}, {"$set": {"member_count": 2}})
    viewer = h.client()

    def titles(params: str) -> set[str]:
        return {p["title"] for p in viewer.get(f"/api/projects?{params}").json()["items"]}

    assert titles("q=robot") == {"Rust Robot Arm"}
    assert titles("skills=python") == {"Open Data Portal"}
    assert titles("category=open_source,side_project") == {"Rust Robot Arm", "Open Data Portal"}
    assert titles("status=active") == {"Open Data Portal"}
    assert titles("mode=in_person") == {"Rust Robot Arm"}
    assert "Tiny Team" not in titles("has_openings=true")
    assert full["id"]


def test_delete_cascades_and_notifies_members(h):
    owner, _ = h.register(name="Owner")
    member, _ = h.register(name="Member")
    project = create_project(owner)
    request = member.post(f"/api/projects/{project['id']}/requests", json={}).json()
    owner.post(f"/api/requests/{request['id']}/accept")
    owner.delete(f"/api/projects/{project['id']}")

    assert h.db.team_memberships.count_documents({}) == 0
    assert h.db.join_requests.count_documents({}) == 0
    titles = [n["title"] for n in member.get("/api/notifications").json()["items"]]
    assert any("was deleted" in t for t in titles)


def test_removed_projects_are_hidden_except_from_owner(h):
    owner, _ = h.register(name="Owner")
    other, _ = h.register(name="Other")
    project = create_project(owner)
    h.db.projects.update_one({}, {"$set": {"is_removed": True, "removed_reason": "Spam"}})
    assert other.get(f"/api/projects/{project['id']}").status_code == 404
    assert other.get("/api/projects").json()["total"] == 0
    seen_by_owner = owner.get(f"/api/projects/{project['id']}").json()
    assert seen_by_owner["is_removed"] is True and seen_by_owner["removed_reason"] == "Spam"
    assert other.post(f"/api/projects/{project['id']}/requests", json={}).status_code == 404


def test_invalid_ids_are_not_found(h):
    api, _ = h.register()
    assert api.get("/api/projects/not-an-id").status_code == 404
    assert api.get("/api/projects/64b7f0c2a1b2c3d4e5f60718").status_code == 404
