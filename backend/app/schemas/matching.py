from typing import Literal

from app.schemas.common import APIModel
from app.schemas.profile import ProfileCard

Confidence = Literal["high", "medium", "low"]


class ScoreComponent(APIModel):
    component: str
    label: str
    points: float
    max_points: int


class _Explained(APIModel):
    # None when there was not enough information to compute a meaningful score.
    score: int | None
    confidence: Confidence
    reasons: list[str]
    cautions: list[str]
    breakdown: list[ScoreComponent]


class TeammateSuggestion(_Explained):
    person: ProfileCard


class OpportunitySuggestion(_Explained):
    kind: Literal["opportunity", "project"]
    id: str
    title: str
    summary: str
    type: str
    path: str
    timing: str
    is_demo: bool = False


class _SuggestionResponse(APIModel):
    method: Literal["rule_based"]
    method_description: str
    notice: str | None = None


class TeammateSuggestions(_SuggestionResponse):
    items: list[TeammateSuggestion]


class OpportunitySuggestions(_SuggestionResponse):
    items: list[OpportunitySuggestion]
