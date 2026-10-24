"""Closed vocabularies shared by schemas, services and the matching engine."""

from typing import Literal, get_args

ExperienceLevel = Literal["beginner", "intermediate", "advanced", "expert"]
PreferredExperience = Literal["any", "beginner", "intermediate", "advanced", "expert"]
Availability = Literal["limited", "weekends", "part_time", "full_time", "unavailable"]
CollaborationMode = Literal["remote", "in_person", "hybrid"]
Role = Literal[
    "frontend", "backend", "fullstack", "mobile", "ml", "data", "design",
    "devops", "security", "blockchain", "hardware", "research", "product",
]
Visibility = Literal["public", "members", "hidden"]
MessagePermission = Literal["everyone", "teammates"]

ProjectStatus = Literal["recruiting", "active", "completed"]
ProjectCategory = Literal[
    "hackathon", "open_source", "research", "startup", "academic", "social_impact", "side_project", "other",
]
RequestKind = Literal["application", "invitation"]
RequestStatus = Literal["pending", "accepted", "rejected", "withdrawn"]

OpportunityType = Literal["hackathon", "project", "research"]
OpportunityMode = Literal["online", "in_person", "hybrid"]
OpportunitySourceKind = Literal["curated", "community", "demo", "feed"]
ApplicationStatus = Literal["pending", "accepted", "declined", "withdrawn"]

ReportTargetType = Literal["user", "project", "opportunity", "message"]
ReportReason = Literal["spam", "harassment", "inappropriate", "misleading", "scam", "other"]
ReportStatus = Literal["open", "resolved", "dismissed"]

EXPERIENCE_ORDER: dict[str, int] = {name: index for index, name in enumerate(get_args(ExperienceLevel))}
ROLES: tuple[str, ...] = get_args(Role)
