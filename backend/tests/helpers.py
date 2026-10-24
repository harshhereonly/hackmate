from __future__ import annotations

from typing import Any


def project_payload(**overrides: Any) -> dict[str, Any]:
    payload = {
        "title": "Campus Carbon Tracker",
        "summary": "A web app that estimates the carbon footprint of campus events.",
        "description": "We want to build a small, well-tested web app that helps student clubs estimate emissions.",
        "required_skills": ["React", "FastAPI", "Figma"],
        "roles_needed": ["frontend", "design"],
        "preferred_experience": "any",
        "max_team_size": 4,
        "status": "recruiting",
        "category": "hackathon",
        "collaboration_mode": "remote",
        "repo_url": "https://github.com/example/carbon",
    }
    payload.update(overrides)
    return payload


def create_project(api, **overrides: Any) -> dict[str, Any]:
    response = api.post("/api/projects", json=project_payload(**overrides))
    assert response.status_code == 201, response.text
    return response.json()


def handle_of(api) -> str:
    return api.get("/api/profiles/me").json()["handle"]
