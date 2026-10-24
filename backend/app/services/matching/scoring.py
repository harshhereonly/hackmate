"""Deterministic, explainable matching scores (pure functions, no I/O).

This is a transparent rule-based scorer, not a machine-learning model. Every
point a candidate earns maps to a named component with a fixed maximum, and
each component produces a human-readable reason. The weights are documented
in docs/MATCHING.md.

The central idea is complementarity. A candidate earns most for covering what
the team is missing (skills, skill domains, roles), not for repeating what the
team already has.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable

from app.schemas.enums import EXPERIENCE_ORDER
from app.services.taxonomy import (
    DOMAIN_LABELS,
    ROLE_LABELS,
    domains_for_roles,
    domains_for_skills,
    skill_keys,
    tag_keys,
)

# Component weights: project -> candidate (sum = 100)
PROJECT_WEIGHTS = {
    "skill_gap": 30,      # covers required skills the team lacks
    "domain_gap": 20,     # brings expertise areas the team lacks
    "role_fit": 15,       # prefers a role the project needs
    "interests": 10,      # shares the project's themes
    "experience": 10,     # fits the preferred experience level
    "availability": 10,   # compatible time commitment
    "mode": 5,            # compatible collaboration mode
}

# Component weights: user -> teammate, no specific project (sum = 100)
TEAMMATE_WEIGHTS = {
    "domain_gap": 30,     # complementary expertise areas
    "role_fit": 15,       # complementary preferred roles
    "interests": 25,      # shared interests matter most without a project
    "experience": 10,
    "availability": 12,
    "mode": 8,
}

# Component weights: user -> opportunity (sum = 100)
OPPORTUNITY_WEIGHTS = {
    "skills": 40,
    "interests": 30,
    "timing": 20,
    "mode": 10,
}

COMPONENT_LABELS = {
    "skill_gap": "Missing skills covered",
    "domain_gap": "Complementary expertise",
    "role_fit": "Role fit",
    "interests": "Shared interests",
    "experience": "Experience fit",
    "availability": "Availability",
    "mode": "Collaboration mode",
    "skills": "Skill relevance",
    "timing": "Timing",
}

# Core skill areas most hackathon and student teams need.
CORE_TEAM_DOMAINS = {"frontend", "backend", "design"}

# availability compatibility (symmetric); "unavailable" is handled separately
_AVAILABILITY_FIT = {
    ("limited", "limited"): 1.0, ("limited", "weekends"): 0.8, ("limited", "part_time"): 0.6,
    ("limited", "full_time"): 0.3, ("weekends", "weekends"): 1.0, ("weekends", "part_time"): 0.7,
    ("weekends", "full_time"): 0.4, ("part_time", "part_time"): 1.0, ("part_time", "full_time"): 0.7,
    ("full_time", "full_time"): 1.0,
}
_AVAILABILITY_LABEL = {"limited": "a few hours a week", "weekends": "weekends", "part_time": "part-time",
                       "full_time": "full-time", "unavailable": "not available right now"}
_MODE_FIT = {
    ("remote", "remote"): 1.0, ("remote", "hybrid"): 0.8, ("remote", "in_person"): 0.3,
    ("in_person", "in_person"): 1.0, ("in_person", "hybrid"): 0.8, ("hybrid", "hybrid"): 1.0,
}
_MODE_LABEL = {"remote": "remote", "in_person": "in-person", "hybrid": "hybrid", "online": "online"}


@dataclass
class Person:
    skills: set[str] = field(default_factory=set)
    skill_names: dict[str, str] = field(default_factory=dict)  # key -> display spelling
    interests: set[str] = field(default_factory=set)
    interest_names: dict[str, str] = field(default_factory=dict)
    roles: set[str] = field(default_factory=set)
    experience: str | None = None
    availability: str | None = None
    mode: str | None = None

    @classmethod
    def from_profile(cls, profile: dict[str, Any]) -> "Person":
        skills = profile.get("skills") or []
        interests = profile.get("interests") or []
        return cls(
            skills=set(skill_keys(skills)),
            skill_names={key: name for key, name in zip(skill_keys(skills), skills)},
            interests=set(tag_keys(interests)),
            interest_names={key: name for key, name in zip(tag_keys(interests), interests)},
            roles=set(profile.get("preferred_roles") or []),
            experience=profile.get("experience_level"),
            availability=profile.get("availability"),
            mode=profile.get("collaboration_mode"),
        )

    @property
    def domains(self) -> set[str]:
        return domains_for_skills(self.skills) | domains_for_roles(self.roles)

    def information_level(self) -> str:
        signals = sum([
            len(self.skills) >= 3, bool(self.interests), bool(self.roles), bool(self.experience),
            bool(self.availability), bool(self.mode),
        ])
        return "high" if signals >= 5 else "medium" if signals >= 3 else "low"


@dataclass
class TeamNeed:
    required_skills: set[str] = field(default_factory=set)
    required_names: dict[str, str] = field(default_factory=dict)
    team_skills: set[str] = field(default_factory=set)
    team_roles: set[str] = field(default_factory=set)
    roles_needed: set[str] = field(default_factory=set)
    interests: set[str] = field(default_factory=set)
    preferred_experience: str = "any"
    availability: str | None = None
    mode: str | None = None

    @property
    def missing_skills(self) -> set[str]:
        return self.required_skills - self.team_skills

    @property
    def team_domains(self) -> set[str]:
        return domains_for_skills(self.team_skills) | domains_for_roles(self.team_roles)

    @property
    def needed_domains(self) -> set[str]:
        return domains_for_skills(self.required_skills) | domains_for_roles(self.roles_needed)


@dataclass
class Score:
    total: int
    confidence: str
    breakdown: list[dict[str, Any]]
    reasons: list[str]
    cautions: list[str]


def _names(keys: Iterable[str], lookup: dict[str, str], limit: int = 4) -> str:
    names = sorted(lookup.get(key, key) for key in keys)
    shown = ", ".join(names[:limit])
    return shown + (f" and {len(names) - limit} more" if len(names) > limit else "")


def _domain_names(domains: Iterable[str]) -> str:
    labels = sorted(DOMAIN_LABELS.get(d, d) for d in domains)
    return ", ".join(labels[:-1]) + f" and {labels[-1]}" if len(labels) > 1 else (labels[0] if labels else "")


def experience_fit(preferred: str, candidate: str | None) -> tuple[float, str | None]:
    if candidate is None:
        return 0.4, None
    if preferred == "any":
        return 1.0, None
    distance = abs(EXPERIENCE_ORDER[preferred] - EXPERIENCE_ORDER[candidate])
    if distance == 0:
        return 1.0, f"Experience level matches ({candidate})"
    return (0.6, None) if distance == 1 else (0.2, None)


def availability_fit(reference: str | None, candidate: str | None) -> tuple[float, str | None, str | None]:
    """Returns (fraction, reason, caution)."""
    if candidate == "unavailable":
        return 0.0, None, "Marked as not available right now"
    if candidate is None:
        return 0.4, None, None
    if reference in (None, "unavailable"):
        return 0.7, None, None
    fit = _AVAILABILITY_FIT.get((reference, candidate)) or _AVAILABILITY_FIT.get((candidate, reference), 0.5)
    reason = f"Available {_AVAILABILITY_LABEL[candidate]}, compatible with the team" if fit >= 0.7 else None
    caution = f"Availability differs ({_AVAILABILITY_LABEL[candidate]})" if fit < 0.5 else None
    return fit, reason, caution


def mode_fit(reference: str | None, candidate: str | None) -> tuple[float, str | None]:
    if candidate is None or reference is None:
        return 0.4, None
    reference = "remote" if reference == "online" else reference
    fit = _MODE_FIT.get((reference, candidate)) or _MODE_FIT.get((candidate, reference), 0.5)
    reason = f"Prefers {_MODE_LABEL[candidate]} collaboration, which suits this {_MODE_LABEL[reference]} work" \
        if fit >= 0.8 else None
    return fit, reason


LOW_INFO_CANDIDATE = "Their profile has limited information, so this suggestion is less certain."


def _finish(points: dict[str, float], weights: dict[str, int], reasons: list[str], cautions: list[str],
            confidence: str, penalty: float = 0.0, low_info_caution: str | None = LOW_INFO_CANDIDATE) -> Score:
    breakdown = [
        {"component": key, "label": COMPONENT_LABELS[key], "points": round(points.get(key, 0.0), 1),
         "max_points": weights[key]}
        for key in weights
    ]
    total = max(0, min(100, round(sum(points.values()) - penalty)))
    if confidence == "low" and low_info_caution:
        cautions.append(low_info_caution)
    return Score(total=total, confidence=confidence, breakdown=breakdown, reasons=reasons, cautions=cautions)


def score_for_project(need: TeamNeed, candidate: Person) -> Score:
    w = PROJECT_WEIGHTS
    points: dict[str, float] = {}
    reasons: list[str] = []
    cautions: list[str] = []

    missing = need.missing_skills
    covered = candidate.skills & missing
    if missing:
        points["skill_gap"] = w["skill_gap"] * len(covered) / len(missing)
    else:  # the team already has every required skill: reward depth on them instead (half weight)
        overlap = candidate.skills & need.required_skills
        points["skill_gap"] = w["skill_gap"] * 0.5 * min(1.0, len(overlap) / max(1, len(need.required_skills)))
    if covered:
        reasons.append(f"Covers missing skills: {_names(covered, need.required_names)}")

    gap_domains = need.needed_domains - need.team_domains
    brings = candidate.domains & gap_domains
    if gap_domains:
        points["domain_gap"] = w["domain_gap"] * min(1.0, len(brings) / min(2, len(gap_domains)))
    else:
        relevant = candidate.domains & need.needed_domains
        points["domain_gap"] = w["domain_gap"] * 0.4 * min(1.0, len(relevant) / 2)
    if brings:
        reasons.append(f"Brings {_domain_names(brings)} expertise your team doesn't have yet")

    wanted_roles = need.roles_needed or {
        role for role in candidate.roles if domains_for_roles([role]) & gap_domains
    }
    role_hits = candidate.roles & wanted_roles
    points["role_fit"] = w["role_fit"] if role_hits else (w["role_fit"] * 0.3 if not need.roles_needed and candidate.roles else 0.0)
    if role_hits:
        reasons.append(f"Wants a role you need: {', '.join(sorted(ROLE_LABELS[r] for r in role_hits))}")

    shared = candidate.interests & need.interests
    points["interests"] = w["interests"] * min(1.0, len(shared) / 2)
    if shared:
        reasons.append(f"Shares interests: {_names(shared, candidate.interest_names)}")

    fit, reason = experience_fit(need.preferred_experience, candidate.experience)
    points["experience"] = w["experience"] * fit
    if reason:
        reasons.append(reason)

    fit, reason, caution = availability_fit(need.availability, candidate.availability)
    points["availability"] = w["availability"] * fit
    if reason:
        reasons.append(reason)
    if caution:
        cautions.append(caution)

    fit, reason = mode_fit(need.mode, candidate.mode)
    points["mode"] = w["mode"] * fit
    if reason:
        reasons.append(reason)

    penalty = 0.0
    if candidate.skills and not covered and not brings and candidate.skills <= (need.team_skills | need.required_skills):
        penalty = 5.0
        cautions.append("Their skills mostly overlap with what your team already has")
    return _finish(points, w, reasons, cautions, candidate.information_level(), penalty)


def score_teammate(me: Person, candidate: Person, extra_needed_domains: set[str] | None = None) -> Score:
    w = TEAMMATE_WEIGHTS
    points: dict[str, float] = {}
    reasons: list[str] = []
    cautions: list[str] = []

    needed = (CORE_TEAM_DOMAINS | (extra_needed_domains or set())) - me.domains
    brings = candidate.domains & needed
    points["domain_gap"] = w["domain_gap"] * (min(1.0, len(brings) / min(2, len(needed))) if needed else 0.3)
    if brings:
        reasons.append(f"Brings {_domain_names(brings)} skills that complement yours")

    complementary_roles = {r for r in candidate.roles - me.roles if domains_for_roles([r]) & needed}
    points["role_fit"] = w["role_fit"] if complementary_roles else 0.0
    if complementary_roles:
        reasons.append(f"Prefers complementary roles: {', '.join(sorted(ROLE_LABELS[r] for r in complementary_roles))}")

    shared = candidate.interests & me.interests
    points["interests"] = w["interests"] * min(1.0, len(shared) / 2)
    if shared:
        reasons.append(f"Shares interests: {_names(shared, candidate.interest_names)}")

    if me.experience and candidate.experience:
        distance = abs(EXPERIENCE_ORDER[me.experience] - EXPERIENCE_ORDER[candidate.experience])
        points["experience"] = w["experience"] * (1.0, 0.7, 0.3, 0.1)[distance]
        if distance == 0:
            reasons.append(f"Same experience level ({candidate.experience})")
    else:
        points["experience"] = w["experience"] * 0.4

    fit, reason, caution = availability_fit(me.availability, candidate.availability)
    points["availability"] = w["availability"] * fit
    if reason:
        reasons.append(reason.replace("the team", "yours"))
    if caution:
        cautions.append(caution)

    fit, reason = mode_fit(me.mode, candidate.mode)
    points["mode"] = w["mode"] * fit
    if fit >= 0.8 and candidate.mode:
        reasons.append(f"Also prefers {_MODE_LABEL[candidate.mode]} collaboration")

    penalty = 0.0
    if candidate.skills and me.skills and candidate.skills <= me.skills and not brings:
        penalty = 5.0
        cautions.append("Their skills mostly duplicate yours")
    return _finish(points, w, reasons, cautions, candidate.information_level(), penalty)


def score_opportunity(me: Person, skills: set[str], skill_names: dict[str, str], tags: set[str],
                      title_words: set[str], mode: str | None, timing: str, days_to_deadline: int | None) -> Score:
    w = OPPORTUNITY_WEIGHTS
    points: dict[str, float] = {}
    reasons: list[str] = []
    cautions: list[str] = []

    overlap = me.skills & skills
    points["skills"] = w["skills"] * (min(1.0, len(overlap) / min(3, len(skills))) if skills else 0.2)
    if overlap:
        reasons.append(f"Uses your skills: {_names(overlap, skill_names)}")

    shared = me.interests & (tags | title_words)
    points["interests"] = w["interests"] * min(1.0, len(shared) / 2)
    if shared:
        reasons.append(f"Matches your interests: {_names(shared, me.interest_names)}")

    timing_points = {"upcoming": 1.0, "open": 1.0, "ongoing": 0.6, "unscheduled": 0.5}.get(timing, 0.0)
    points["timing"] = w["timing"] * timing_points
    if days_to_deadline is not None and 0 <= days_to_deadline <= 7:
        cautions.append(f"Deadline in {days_to_deadline} day{'s' if days_to_deadline != 1 else ''}")
    elif timing == "upcoming":
        reasons.append("Coming up soon")

    fit, _ = mode_fit(mode, me.mode)
    points["mode"] = w["mode"] * fit
    if fit >= 0.8 and mode:
        reasons.append(f"{_MODE_LABEL.get(mode, mode).capitalize()} format suits your preference")
    # Confidence here reflects the *user's* profile; the endpoint explains it once, not per item.
    return _finish(points, w, reasons, cautions, me.information_level(), low_info_caution=None)
