from __future__ import annotations

from datetime import timedelta

import httpx2
import pytest

from app.services.opportunities import catalog
from app.services.opportunities.feeds import sync_feed
from app.services.opportunities.papers import rebuild_abstract, strip_markup
from app.utils import utcnow
from tests.helpers import create_project


def seed(h, **fields):
    data = {
        "type": "hackathon", "title": "Example Hack", "summary": "A weekend hackathon for testing.",
        "description": "", "organizer": "Example Org", "url": "https://example.org/hack",
        "skills": ["Python"], "tags": ["AI"], "mode": "online", "location": "", "starts_at": None,
        "ends_at": None, "deadline": None, "accepts_applications": False,
    }
    source_kind = fields.pop("source_kind", "curated")
    is_demo = fields.pop("is_demo", False)
    data.update(fields)
    doc = catalog.new_document(data, source_kind=source_kind, created_by=fields.get("created_by"),
                               verified=source_kind == "curated", is_demo=is_demo)
    doc["_id"] = h.db.opportunities.insert_one(doc).inserted_id
    return doc


def titles(api, params=""):
    return [item["title"] for item in api.get(f"/api/opportunities?{params}").json()["items"]]


def test_timing_filters_and_deadline_sort(h):
    now = utcnow()
    seed(h, title="Upcoming", starts_at=now + timedelta(days=10), ends_at=now + timedelta(days=12),
         deadline=now + timedelta(days=5))
    seed(h, title="Ongoing", starts_at=now - timedelta(days=1), ends_at=now + timedelta(days=1))
    seed(h, title="Past", starts_at=now - timedelta(days=30), ends_at=now - timedelta(days=28))
    seed(h, title="Undated")
    api = h.client()

    assert titles(api) == ["Ongoing", "Upcoming", "Undated"]  # soonest date first, undated last
    assert titles(api, "timing=upcoming") == ["Upcoming"]
    assert titles(api, "timing=ongoing") == ["Ongoing"]
    assert titles(api, "timing=past") == ["Past"]
    body = api.get("/api/opportunities?timing=all").json()
    assert body["total"] == 4
    by_title = {i["title"]: i["timing"] for i in body["items"]}
    assert by_title == {"Upcoming": "upcoming", "Ongoing": "ongoing", "Past": "past", "Undated": "unscheduled"}


def test_search_and_facet_filters(h):
    seed(h, title="Climate Hack", tags=["Climate"], skills=["React"], mode="in_person")
    seed(h, title="Robotics Challenge", skills=["C++"], mode="online")
    seed(h, title="Open Science Fellowship", type="research", skills=["Statistics"], mode="hybrid")
    api = h.client()
    assert titles(api, "q=climate") == ["Climate Hack"]
    assert titles(api, "skills=reactjs") == ["Climate Hack"]
    assert titles(api, "mode=online") == ["Robotics Challenge"]
    assert titles(api, "type=research") == ["Open Science Fellowship"]
    assert set(titles(api, "type=hackathon,research")) == {"Climate Hack", "Robotics Challenge",
                                                            "Open Science Fellowship"}


def test_demo_listings_are_labelled_and_never_link_out(h):
    seed(h, title="Sample: Demo Hack", is_demo=True, source_kind="demo", url="https://example.org/fake")
    seed(h, title="Real Curated Hack")
    api = h.client()
    items = {i["title"]: i for i in api.get("/api/opportunities").json()["items"]}
    demo = items["Sample: Demo Hack"]
    assert demo["is_demo"] is True and demo["url"] is None and demo["source"]["kind"] == "demo"
    assert items["Real Curated Hack"]["verified"] is True
    assert titles(api, "include_demo=false") == ["Real Curated Hack"]


def test_removed_listings_are_hidden(h):
    doc = seed(h, title="Removed Hack")
    h.db.opportunities.update_one({"_id": doc["_id"]}, {"$set": {"is_removed": True}})
    api = h.client()
    assert titles(api) == []
    assert api.get(f"/api/opportunities/{doc['_id']}").status_code == 404


def research_post(**overrides):
    payload = {"title": "Seeking co-author: low-resource NLP",
               "summary": "Looking for a collaborator to run evaluation experiments on low-resource languages.",
               "skills": ["Python", "NLP"], "tags": ["NLP"], "mode": "online", "accepts_applications": True}
    payload.update(overrides)
    return payload


def test_community_research_posts_and_applications(h):
    poster, _ = h.register(name="Poster Priya")
    applicant, _ = h.register(name="Applicant Ali")
    created = poster.post("/api/opportunities", json=research_post())
    assert created.status_code == 201, created.text
    opp = created.json()
    assert opp["type"] == "research" and opp["source"]["kind"] == "community"
    assert opp["posted_by"]["name"] == "Poster Priya"
    assert opp["viewer"]["is_owner"] is True and opp["viewer"]["can_apply"] is False

    assert applicant.patch(f"/api/opportunities/{opp['id']}", json={"title": "Hijacked"}).status_code == 403
    detail = applicant.get(f"/api/opportunities/{opp['id']}").json()
    assert detail["viewer"]["can_apply"] is True

    applied = applicant.post(f"/api/opportunities/{opp['id']}/applications", json={"message": "I work on NLP."})
    assert applied.status_code == 201
    assert applicant.post(f"/api/opportunities/{opp['id']}/applications", json={}).status_code == 409
    assert poster.post(f"/api/opportunities/{opp['id']}/applications", json={}).status_code == 409

    incoming = poster.get("/api/opportunities/applications?box=incoming").json()["items"]
    assert incoming[0]["person"]["name"] == "Applicant Ali" and incoming[0]["can_decide"]
    app_id = incoming[0]["id"]
    assert applicant.post(f"/api/opportunities/applications/{app_id}/accept").status_code == 403
    accepted = poster.post(f"/api/opportunities/applications/{app_id}/accept")
    assert accepted.json()["status"] == "accepted"
    assert applicant.get("/api/notifications").json()["items"][0]["type"] == "application_accepted"

    assert poster.delete(f"/api/opportunities/{opp['id']}").status_code == 204
    assert h.db.opportunity_applications.count_documents({}) == 0


def test_members_cannot_post_curated_types_and_validation(h):
    api, _ = h.register()
    hackathon = api.post("/api/opportunities", json=research_post(type="hackathon"))
    assert hackathon.status_code == 422
    bad_dates = api.post("/api/opportunities", json=research_post(
        starts_at="2026-12-10T00:00:00Z", ends_at="2026-12-01T00:00:00Z"))
    assert bad_dates.status_code == 422


def test_applications_closed_when_disabled_or_past(h):
    poster, _ = h.register()
    applicant, _ = h.register()
    no_apps = poster.post("/api/opportunities", json=research_post(accepts_applications=False)).json()
    assert applicant.post(f"/api/opportunities/{no_apps['id']}/applications", json={}).status_code == 409
    past = poster.post("/api/opportunities", json=research_post(deadline="2020-01-01T00:00:00Z")).json()
    response = applicant.post(f"/api/opportunities/{past['id']}/applications", json={})
    assert response.status_code == 409 and "closed" in response.json()["error"]["message"]


def test_saved_items(h):
    api, _ = h.register()
    doc = seed(h, title="Savable Hack")
    key = f"opportunity:{doc['_id']}"
    assert api.post("/api/saved", json={"item_key": key}).status_code == 201
    assert api.post("/api/saved", json={"item_key": key}).status_code == 201  # idempotent
    assert api.get(f"/api/opportunities/{doc['_id']}").json()["viewer"]["saved"] is True

    external = api.post("/api/saved", json={"item_key": "openalex:W123", "title": "A paper",
                                            "url": "https://doi.org/10.1/x", "item_type": "paper"})
    assert external.status_code == 201
    assert api.post("/api/saved", json={"item_key": "openalex:W999"}).status_code == 400
    assert api.post("/api/saved", json={"item_key": "evil:thing"}).status_code == 422
    assert api.post("/api/saved", json={"item_key": "github:1", "title": "x",
                                        "url": "javascript:alert(1)"}).status_code == 422

    listing = api.get("/api/saved").json()
    assert listing["total"] == 2
    assert set(api.get("/api/saved/keys").json()) == {key, "openalex:W123"}

    h.db.opportunities.update_one({"_id": doc["_id"]}, {"$set": {"is_removed": True}})
    saved = {i["item_key"]: i for i in api.get("/api/saved").json()["items"]}
    assert saved[key]["available"] is False

    assert api.delete(f"/api/saved?key={key}").status_code == 204
    assert api.delete(f"/api/saved?key={key}").status_code == 404
    other, _ = h.register()
    assert other.get("/api/saved").json()["total"] == 0


def test_teams_forming_for_an_opportunity(h):
    doc = seed(h, title="Team Hack")
    owner, _ = h.register()
    create_project(owner, title="Our Team Hack Entry", opportunity_id=str(doc["_id"]))
    api = h.client()
    assert api.get(f"/api/opportunities/{doc['_id']}").json()["teams_forming"] == 1
    teams = api.get(f"/api/opportunities/{doc['_id']}/teams").json()["items"]
    assert [t["title"] for t in teams] == ["Our Team Hack Entry"]
    bad_link = owner.post("/api/projects", json={**{
        "title": "Bad link project", "summary": "Summary long enough here.",
        "description": "Description that is long enough to pass validation.",
        "required_skills": ["Go"], "max_team_size": 3, "category": "hackathon", "collaboration_mode": "remote",
    }, "opportunity_id": "64b7f0c2a1b2c3d4e5f60718"})
    assert bad_link.status_code == 400


# --- External providers (mocked HTTP) -------------------------------------------

OPENALEX_RESPONSE = {
    "meta": {"count": 42},
    "results": [{
        "id": "https://openalex.org/W1", "doi": "https://doi.org/10.1234/abc", "display_name": "Graph Things",
        "publication_year": 2024, "publication_date": "2024-05-17",
        "authorships": [{"author": {"display_name": "Ada Lovelace"}}, {"author": {"display_name": "Alan Turing"}}],
        "primary_location": {"source": {"display_name": "Journal of Graphs"}, "landing_page_url": "https://x.org"},
        "open_access": {"is_oa": True, "oa_url": "https://arxiv.org/abs/1"},
        "abstract_inverted_index": {"Graphs": [0], "are": [1], "great": [2]},
        "cited_by_count": 7, "type": "article",
    }, {
        "id": "https://openalex.org/W2", "doi": None, "display_name": "Closed Paper", "publication_year": 2020,
        "authorships": [], "primary_location": None, "open_access": {"is_oa": False}, "cited_by_count": 0,
    }],
}
CROSSREF_RESPONSE = {"message": {"total-results": 3, "items": [{
    "DOI": "10.5555/xyz", "title": ["Fallback <i>Paper</i>"], "author": [{"given": "Grace", "family": "Hopper"}],
    "issued": {"date-parts": [[2019, 3]]}, "container-title": ["Proceedings"],
    "abstract": "<jats:p>An abstract &amp; more.</jats:p>", "type": "journal-article",
}]}}


@pytest.fixture
def live(harness_factory):
    def make(handler):
        h = harness_factory(external_providers_enabled=True, contact_email="ops@example.com")
        h.app.state.providers.client = httpx2.Client(transport=httpx2.MockTransport(handler))
        return h
    return make


def test_openalex_results_are_parsed_without_overclaiming(live):
    calls = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        calls.append(request)
        return httpx2.Response(200, json=OPENALEX_RESPONSE)

    h = live(handler)
    api = h.client()
    body = api.get("/api/research/papers?q=graph").json()
    assert body["source"] == "openalex" and body["total"] == 42 and "OpenAlex" in body["attribution"]
    first, second = body["items"]
    assert first["authors"] == ["Ada Lovelace", "Alan Turing"]
    assert first["abstract"] == "Graphs are great"
    assert first["open_access"] is True and first["url"] == "https://doi.org/10.1234/abc"
    assert second["open_access"] is None  # closed/unknown is never presented as open
    assert second["url"] == "https://openalex.org/W2"

    api.get("/api/research/papers?q=graph")  # served from cache
    assert len(calls) == 1
    title_search = api.get("/api/research/papers?q=transformers&field=title")
    assert title_search.status_code == 200
    assert "filter=title.search" in str(calls[-1].url)


def test_falls_back_to_crossref_when_openalex_fails(live):
    def handler(request: httpx2.Request) -> httpx2.Response:
        if "openalex" in request.url.host:
            return httpx2.Response(429, json={"error": "budget"})
        assert request.url.params.get("mailto") == "ops@example.com"
        return httpx2.Response(200, json=CROSSREF_RESPONSE)

    h = live(handler)
    body = h.client().get("/api/research/papers?q=compilers").json()
    assert body["source"] == "crossref"
    assert "OpenAlex is unavailable" in body["notice"]
    paper = body["items"][0]
    assert paper["title"] == "Fallback Paper" and paper["abstract"] == "An abstract & more."
    assert paper["published"] == "2019-03" and paper["open_access"] is None


def test_provider_outage_and_disabled_providers(live, h):
    outage = live(lambda request: httpx2.Response(503))
    response = outage.client().get("/api/research/papers?q=anything")
    assert response.status_code == 503 and response.json()["error"]["code"] == "provider_unavailable"
    disabled = h.client().get("/api/research/papers?q=anything")
    assert disabled.status_code == 503 and disabled.json()["error"]["code"] == "providers_disabled"
    # DB-backed listings keep working while providers are down.
    assert outage.client().get("/api/opportunities").status_code == 200


def test_github_good_first_issues(live):
    def handler(request: httpx2.Request) -> httpx2.Response:
        query = request.url.params["q"]
        assert 'label:"good first issue"' in query and 'language:"Python"' in query
        assert ":" not in query.split('label:')[0]  # user text cannot inject qualifiers
        return httpx2.Response(200, json={"total_count": 5000, "items": [{
            "id": 99, "html_url": "https://github.com/o/r/issues/1", "title": "Add tests",
            "repository_url": "https://api.github.com/repos/o/r", "labels": [{"name": "good first issue"}],
            "comments": 2, "updated_at": "2026-10-20T10:00:00Z", "body": "## Task\nWrite **tests**.",
        }]})

    h = live(handler)
    body = h.client().get("/api/opportunities/open-source?q=tests user:attacker&language=Python").json()
    assert body["total"] == 1000  # GitHub caps search results
    issue = body["items"][0]
    assert issue["repository"] == "o/r" and issue["summary"] == "Task Write tests."


def test_helpers():
    assert rebuild_abstract({"world": [1], "hello": [0]}) == "hello world"
    assert strip_markup("<jats:p>x &lt; y</jats:p>") == "x < y"


def test_feed_import_is_idempotent_and_validates(h):
    feed = {"source": {"name": "Example Org", "url": "https://example.org"}, "events": [
        {"id": "e1", "title": "Feed Hack", "url": "https://example.org/e1", "starts_at": "2030-01-01T00:00:00Z",
         "mode": "online", "skills": ["Rust"]},
        {"id": "bad", "title": "No URL"},
        {"id": "e2", "title": "Script", "url": "javascript:alert(1)"},
    ]}
    client = httpx2.Client(transport=httpx2.MockTransport(lambda r: httpx2.Response(200, json=feed)))
    first = sync_feed(h.db, client, "https://example.org/feed.json")
    assert (first["imported"], first["skipped"]) == (1, 2)
    second = sync_feed(h.db, client, "https://example.org/feed.json")
    assert (second["imported"], second["updated"]) == (0, 1)
    item = h.client().get("/api/opportunities").json()["items"][0]
    assert item["source"]["kind"] == "feed" and item["source"]["name"] == "Example Org"
    assert item["timing"] == "upcoming"
