"""Database access for command-line scripts.

* MONGODB_URI (Atlas): scripts connect directly; the server may keep running.
* USE_IN_MEMORY_DB=true: scripts edit the development snapshot file. Stop the
  backend first. Otherwise its periodic snapshot overwrites the script's changes.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from pymongo.database import Database

from app.core.config import Settings, get_settings
from app.db.connection import DatabaseManager
from app.db.local_store import load_snapshot, save_snapshot


@contextmanager
def open_database(settings: Settings | None = None) -> Iterator[Database]:
    settings = settings or get_settings()
    manager = DatabaseManager(settings)
    db = manager.connect()
    if manager.in_memory:
        snapshot = settings.in_memory_db_snapshot
        if not snapshot:
            raise SystemExit("USE_IN_MEMORY_DB=true without IN_MEMORY_DB_SNAPSHOT: nothing would be saved.")
        print(f"[dev] Editing the in-memory database snapshot at {snapshot}. Make sure the backend is stopped.")
        load_snapshot(db, snapshot)
    manager.ensure_indexes()
    try:
        yield db
        if manager.in_memory:
            save_snapshot(db, settings.in_memory_db_snapshot)  # type: ignore[arg-type]
    finally:
        if manager.client is not None:
            manager.client.close()
