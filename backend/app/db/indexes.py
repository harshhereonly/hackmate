"""Index definitions for every collection. Safe to run repeatedly (create_index is idempotent)."""

from __future__ import annotations

import logging

from pymongo import ASCENDING as ASC
from pymongo import DESCENDING as DESC
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError


def ensure_indexes(db: Database) -> None:
    # Accounts
    db.users.create_index([("email", ASC)], unique=True, name="uniq_email")
    db.users.create_index([("role", ASC), ("status", ASC)], name="role_status")
    db.users.create_index([("created_at", DESC)], name="created_at")

    db.profiles.create_index([("user_id", ASC)], unique=True, name="uniq_user")
    db.profiles.create_index([("handle", ASC)], unique=True, name="uniq_handle")
    db.profiles.create_index([("skills_key", ASC)], name="skills")
    db.profiles.create_index([("interests_key", ASC)], name="interests")
    db.profiles.create_index([("preferred_roles", ASC)], name="roles")
    db.profiles.create_index([("visibility", ASC), ("updated_at", DESC)], name="visibility_recent")

    # Sessions and single-use tokens expire automatically through TTL indexes.
    db.sessions.create_index([("user_id", ASC)], name="user")
    db.sessions.create_index([("expires_at", ASC)], expireAfterSeconds=0, name="ttl_expires")
    db.auth_tokens.create_index([("token_hash", ASC)], unique=True, name="uniq_token")
    db.auth_tokens.create_index([("user_id", ASC), ("purpose", ASC)], name="user_purpose")
    db.auth_tokens.create_index([("expires_at", ASC)], expireAfterSeconds=0, name="ttl_expires")

    # Projects and teams
    db.projects.create_index([("status", ASC), ("created_at", DESC)], name="status_recent")
    db.projects.create_index([("owner_id", ASC)], name="owner")
    db.projects.create_index([("skills_key", ASC)], name="skills")
    db.projects.create_index([("category", ASC)], name="category")
    db.projects.create_index([("is_removed", ASC), ("created_at", DESC)], name="visible_recent")

    db.team_memberships.create_index(
        [("project_id", ASC), ("user_id", ASC)], unique=True, name="uniq_member"
    )
    db.team_memberships.create_index([("user_id", ASC)], name="user")

    # At most one pending request/invitation per (project, person).
    db.join_requests.create_index(
        [("project_id", ASC), ("user_id", ASC)],
        unique=True,
        partialFilterExpression={"status": "pending"},
        name="uniq_pending_per_project_user",
    )
    db.join_requests.create_index([("owner_id", ASC), ("status", ASC), ("created_at", DESC)], name="owner_status")
    db.join_requests.create_index([("user_id", ASC), ("status", ASC), ("created_at", DESC)], name="user_status")
    db.join_requests.create_index([("project_id", ASC), ("status", ASC)], name="project_status")

    # Opportunities
    db.opportunities.create_index([("type", ASC), ("deadline", ASC)], name="type_deadline")
    db.opportunities.create_index([("type", ASC), ("starts_at", ASC)], name="type_starts")
    db.opportunities.create_index([("skills_key", ASC)], name="skills")
    db.opportunities.create_index([("created_by", ASC)], name="creator")
    db.opportunities.create_index([("is_removed", ASC), ("created_at", DESC)], name="visible_recent")
    try:
        db.opportunities.create_index(
            [("external_key", ASC)],
            unique=True,
            partialFilterExpression={"external_key": {"$type": "string"}},
            name="uniq_external_key",
        )
    except DuplicateKeyError:
        # mongomock (dev/test only) ignores partial filters, so listings without an
        # external_key collide. MongoDB/Atlas honors the filter and never raises this.
        logging.getLogger("hackmate.db").warning("Skipped uniq_external_key (partial filters unsupported here).")

    db.saved_opportunities.create_index([("user_id", ASC), ("item_key", ASC)], unique=True, name="uniq_saved")
    db.saved_opportunities.create_index([("user_id", ASC), ("created_at", DESC)], name="user_recent")

    db.opportunity_applications.create_index(
        [("opportunity_id", ASC), ("applicant_id", ASC)],
        unique=True,
        partialFilterExpression={"status": "pending"},
        name="uniq_pending_application",
    )
    db.opportunity_applications.create_index([("owner_id", ASC), ("status", ASC)], name="owner_status")
    db.opportunity_applications.create_index([("applicant_id", ASC), ("status", ASC)], name="applicant_status")

    # Messaging
    db.conversations.create_index(
        [("direct_key", ASC)],
        unique=True,
        partialFilterExpression={"kind": "direct"},
        name="uniq_direct_pair",
    )
    db.conversations.create_index(
        [("project_id", ASC)],
        unique=True,
        partialFilterExpression={"kind": "project"},
        name="uniq_project_chat",
    )
    db.conversations.create_index([("participant_ids", ASC), ("last_message_at", DESC)], name="participant_recent")
    db.messages.create_index([("conversation_id", ASC), ("created_at", DESC)], name="conversation_recent")

    db.notifications.create_index([("user_id", ASC), ("created_at", DESC)], name="user_recent")
    db.notifications.create_index([("user_id", ASC), ("read", ASC)], name="user_read")

    # Moderation
    db.reports.create_index([("status", ASC), ("created_at", DESC)], name="status_recent")
    db.reports.create_index(
        [("reporter_id", ASC), ("target_type", ASC), ("target_id", ASC)],
        unique=True,
        partialFilterExpression={"status": "open"},
        name="uniq_open_report",
    )
    db.moderation_actions.create_index([("created_at", DESC)], name="recent")
    db.moderation_actions.create_index([("target_type", ASC), ("target_id", ASC)], name="target")
