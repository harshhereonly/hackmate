from __future__ import annotations

from app.services.matching.scoring import (
    OPPORTUNITY_WEIGHTS,
    PROJECT_WEIGHTS,
    TEAMMATE_WEIGHTS,
    Person,
    TeamNeed,
    score_for_project,
    score_opportunity,
    score_teammate,
)
from app.services.opportunities import catalog
from tests.helpers import create_project, handle_of


def person(**kw) -> Person:
    return Person.from_profile({
        "skills": kw.get("skills", []), "interests": kw.get("interests", []),
        "preferred_roles": kw.get("roles", []), "experience_level": kw.get("experience"),
        "availability": kw.get("availability"), "collaboration_mode": kw.get("mode"),
    })


FRONTEND_TEAM_NEED = TeamNeed(
    required_skills={"react", "fastapi", "figma"},
    required_names={"react": "React", "fastapi": "FastAPI", "figma": "Figma"},
    team_skills={"react", "typescript", "css"},
    team_roles={"frontend"},
    roles_needed={"design", "backend"},
    interests={"climate"},
    preferred_experience="intermediate",
    availability="part_time",
    mode="remote",
)


def test_weights_sum_to_100():
    for weights in (PROJECT_WEIGHTS, TEAMMATE_WEIGHTS, OPPORTUNITY_WEIGHTS):
        assert sum(weights.values()) == 100


def test_complementary_candidate_beats_duplicate_skills():
    designer = person(skills=["Figma", "UX"], roles=["design"], interests=["Climate"], experience="intermediate",
                      availability="part_time", mode="remote")
    duplicate = person(skills=["React", "TypeScript", "CSS"], roles=["frontend"], interests=["Climate"],
                       experience="intermediate", availability="part_time", mode="remote")
    good = score_for_project(FRONTEND_TEAM_NEED, designer)
    redundant = score_for_project(FRONTEND_TEAM_NEED, duplicate)
    assert good.total > redundant.total + 20
    assert any(r.startswith("Covers missing skills: Figma") for r in good.reasons)
    assert any("design expertise" in r for r in good.reasons)
    assert any("UI/UX designer" in r for r in good.reasons)
    assert any("overlap" in c for c in redundant.cautions)


def test_breakdown_is_consistent_and_deterministic():
    candidate = person(skills=["FastAPI", "Python"], roles=["backend"], experience="advanced",
                       availability="full_time", mode="hybrid")
    first = score_for_project(FRONTEND_TEAM_NEED, candidate)
    second = score_for_project(FRONTEND_TEAM_NEED, candidate)
    assert first == second
    assert all(0 <= part["points"] <= part["max_points"] for part in first.breakdown)
    assert abs(sum(part["points"] for part in first.breakdown) - first.total) <= 1
    assert {part["component"] for part in first.breakdown} == set(PROJECT_WEIGHTS)


def test_unavailable_and_sparse_profiles_are_flagged_not_hidden():
    unavailable = score_for_project(FRONTEND_TEAM_NEED, person(skills=["Figma"], availability="unavailable"))
    availability = next(p for p in unavailable.breakdown if p["component"] == "availability")
    assert availability["points"] == 0
    assert "not available" in " ".join(unavailable.cautions)

    sparse = score_for_project(FRONTEND_TEAM_NEED, person(skills=["Figma"]))
    assert sparse.confidence == "low"
    assert any("limited information" in c for c in sparse.cautions)


def test_teammate_scoring_prefers_complementary_expertise_with_shared_interests():
    me = person(skills=["Python", "FastAPI"], roles=["backend"], interests=["Climate", "Health"],
                experience="intermediate", availability="weekends", mode="remote")
    designer = person(skills=["Figma"], roles=["design"], interests=["Climate"], experience="intermediate",
                      availability="weekends", mode="remote")
    clone = person(skills=["Python", "FastAPI"], roles=["backend"], interests=["Climate"],
                   experience="intermediate", availability="weekends", mode="remote")
    assert score_teammate(me, designer).total > score_teammate(me, clone).total
    assert any("duplicate" in c for c in score_teammate(me, clone).cautions)


def test_opportunity_scoring_reasons():
    me = person(skills=["Python", "PyTorch"], interests=["Health"], mode="remote")
    score = score_opportunity(me, {"python", "pytorch"}, {"python": "Python", "pytorch": "PyTorch"},
                              {"health"}, set(), "online", "upcoming", 3)
    assert score.total >= 80
    assert any("Uses your skills" in r for r in score.reasons)
    assert any("Deadline in 3 days" in c for c in score.cautions)
    unrelated = score_opportunity(me, {"solidity"}, {}, {"defi"}, set(), "in_person", "upcoming", None)
    assert unrelated.total < score.total


# --- API ------------------------------------------------------------------------

def make_member(h, name, **profile):
    api, _ = h.register(name=name)
    assert api.patch("/api/profiles/me", json=profile).status_code == 200
    return api


def test_project_candidates_endpoint(h):
    owner = make_member(h, "Owner", skills=["React", "TypeScript"], preferred_roles=["frontend"],
                        interests=["Climate"], availability="part_time")
    project = create_project(owner, required_skills=["React", "FastAPI", "Figma"], roles_needed=["design"])
    make_member(h, "Dana Designer", skills=["Figma", "UX design"], preferred_roles=["design"],
                interests=["Climate"], experience_level="intermediate", availability="part_time",
                collaboration_mode="remote")
    make_member(h, "Fred Frontend", skills=["React", "TypeScript"], preferred_roles=["frontend"],
                availability="part_time", collaboration_mode="remote")
    make_member(h, "Hidden Hal", skills=["Figma", "FastAPI"], visibility="hidden")
    make_member(h, "Busy Bea", skills=["Figma", "FastAPI"], open_to_collaborate=False)
    applicant = make_member(h, "Pending Pat", skills=["FastAPI"])
    applicant.post(f"/api/projects/{project['id']}/requests", json={})

    body = owner.get(f"/api/matching/projects/{project['id']}/candidates").json()
    assert body["method"] == "rule_based" and "no AI model" in body["method_description"]
    names = [item["person"]["name"] for item in body["items"]]
    assert names[0] == "Dana Designer"
    assert "Fred Frontend" in names and names.index("Fred Frontend") > 0
    assert not {"Hidden Hal", "Busy Bea", "Pending Pat", "Owner"} & set(names)
    top = body["items"][0]
    assert top["score"] > 0 and top["reasons"] and "email" not in str(top)

    outsider = make_member(h, "Outsider", skills=["Go"])
    assert outsider.get(f"/api/matching/projects/{project['id']}/candidates").status_code == 403


def test_teammate_suggestions_fallback_for_empty_profile(h):
    newbie, _ = h.register(name="Newbie")
    make_member(h, "Active Person", skills=["Python"])
    body = newbie.get("/api/matching/teammates").json()
    assert body["items"] and all(item["score"] is None for item in body["items"])
    assert "Add skills" in body["notice"]


def test_teammate_suggestions_are_scored_for_complete_profiles(h):
    me = make_member(h, "Me", skills=["Python", "FastAPI"], preferred_roles=["backend"], interests=["Health"],
                     experience_level="intermediate", availability="weekends", collaboration_mode="remote")
    make_member(h, "Designer", skills=["Figma"], preferred_roles=["design"], interests=["Health"],
                experience_level="intermediate", availability="weekends", collaboration_mode="remote")
    body = me.get("/api/matching/teammates").json()
    assert body["items"][0]["person"]["name"] == "Designer"
    assert body["items"][0]["score"] > 50


def test_opportunity_suggestions(h):
    me = make_member(h, "Me", skills=["Python", "PyTorch"], interests=["Health"], collaboration_mode="remote")
    other = make_member(h, "Other", skills=["Go"])
    create_project(other, title="Health ML Project", required_skills=["Python", "PyTorch"], category="research")
    create_project(me, title="My Own Project", required_skills=["Python"])
    doc = catalog.new_document({
        "type": "hackathon", "title": "Health Hack", "summary": "Build health tools in a weekend.",
        "skills": ["Python"], "tags": ["Health"], "mode": "online", "starts_at": None, "ends_at": None,
        "deadline": None, "url": "https://example.org", "accepts_applications": False,
    }, source_kind="curated", created_by=None, verified=True)
    h.db.opportunities.insert_one(doc)

    body = me.get("/api/matching/opportunities").json()
    titles = [item["title"] for item in body["items"]]
    assert "Health ML Project" in titles and "Health Hack" in titles
    assert "My Own Project" not in titles
    kinds = {item["title"]: item["kind"] for item in body["items"]}
    assert kinds["Health ML Project"] == "project" and kinds["Health Hack"] == "opportunity"

    teammates = me.get(f"/api/matching/opportunities/{doc['_id']}/teammates")
    assert teammates.status_code == 200
    assert handle_of(other)  # profile exists; may or may not rank depending on skills
