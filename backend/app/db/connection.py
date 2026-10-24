"""MongoDB client lifecycle (MongoDB Atlas in production, mongomock for local dev/tests)."""

from __future__ import annotations

import logging

from fastapi import Request
from pymongo import MongoClient
from pymongo.database import Database
from pymongo.errors import ConfigurationError, InvalidURI, PyMongoError

from app.core.config import Settings
from app.db.indexes import ensure_indexes
from app.db.local_store import SnapshotWriter, load_snapshot

logger = logging.getLogger("hackmate.db")


class DatabaseManager:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client: MongoClient | None = None
        self.db: Database | None = None
        self.in_memory = False
        self.indexes_ready = False
        self._snapshot: SnapshotWriter | None = None

    def connect(self) -> Database:
        settings = self.settings
        if settings.use_in_memory_db:
            if settings.is_production:
                raise RuntimeError("USE_IN_MEMORY_DB is not allowed in production.")
            import mongomock  # development/test dependency only

            self.client = mongomock.MongoClient()
            self.in_memory = True
            logger.warning(
                "Using the in-memory development database (mongomock). Data is NOT stored in MongoDB."
            )
        else:
            if not settings.mongodb_uri:
                raise RuntimeError(
                    "MONGODB_URI is not set. Add your MongoDB Atlas connection string to backend/.env, "
                    "or set USE_IN_MEMORY_DB=true for a local, non-persistent development database."
                )
            uri = settings.mongodb_uri.get_secret_value()
            if "<" in uri or ">" in uri:
                raise RuntimeError("MONGODB_URI still contains placeholders like <username>. "
                                   "Paste your real Atlas connection string into backend/.env.")
            try:
                self.client = MongoClient(
                    uri,
                    serverSelectionTimeoutMS=settings.mongodb_timeout_ms,
                    connectTimeoutMS=settings.mongodb_timeout_ms,
                    appname="hackmate-api",
                    tz_aware=False,
                    uuidRepresentation="standard",
                    retryWrites=True,
                )
            except (ConfigurationError, InvalidURI) as exc:
                # The message never includes the URI itself (it contains credentials).
                raise RuntimeError(f"MONGODB_URI is not a valid MongoDB connection string "
                                   f"({exc.__class__.__name__}). Check backend/.env.") from None
        self.db = self.client[settings.mongodb_db_name]
        return self.db

    def initialize(self) -> None:
        """Load the dev snapshot (if any) and create indexes. Never raises for an unreachable DB."""
        assert self.db is not None
        if self.in_memory and self.settings.in_memory_db_snapshot:
            load_snapshot(self.db, self.settings.in_memory_db_snapshot)
            self._snapshot = SnapshotWriter(self.db, self.settings.in_memory_db_snapshot)
            self._snapshot.start()
        self.ensure_indexes()

    def ensure_indexes(self) -> bool:
        assert self.db is not None
        try:
            ensure_indexes(self.db)
            self.indexes_ready = True
        except PyMongoError as exc:
            self.indexes_ready = False
            logger.error("Could not reach MongoDB to create indexes: %s", exc.__class__.__name__)
        return self.indexes_ready

    def ping(self) -> bool:
        if self.client is None:
            return False
        try:
            self.client.admin.command("ping")
        except PyMongoError:
            return False
        if not self.indexes_ready:
            self.ensure_indexes()
        return True

    def close(self) -> None:
        if self._snapshot is not None:
            self._snapshot.stop()
            self._snapshot = None
        if self.client is not None:
            self.client.close()


def get_db(request: Request) -> Database:
    return request.app.state.db_manager.db
