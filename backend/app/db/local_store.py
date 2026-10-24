"""JSON snapshots for the development-only in-memory database.

With USE_IN_MEMORY_DB=true the API runs on mongomock. Snapshots let local data
survive restarts and `--reload`. This is a development convenience, not a
database: use MongoDB Atlas for anything real.
"""

from __future__ import annotations

import logging
import os
import threading

from bson import json_util
from pymongo.database import Database

from app.utils import utcnow

logger = logging.getLogger("hackmate.db.local")

SNAPSHOT_FORMAT = "hackmate-dev-snapshot"


def load_snapshot(db: Database, path: str) -> int:
    if not os.path.exists(path):
        return 0
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json_util.loads(fh.read())
    except (OSError, ValueError) as exc:
        logger.error("Could not read dev snapshot %s (%s); starting empty.", path, exc)
        return 0
    if not isinstance(data, dict) or data.get("format") != SNAPSHOT_FORMAT:
        logger.error("Ignoring %s: not a HackMate dev snapshot.", path)
        return 0
    total = 0
    for name, docs in (data.get("collections") or {}).items():
        if docs:
            db[name].insert_many(docs)
            total += len(docs)
    logger.info("Loaded %d documents from dev snapshot %s", total, path)
    return total


def save_snapshot(db: Database, path: str) -> None:
    payload = {
        "format": SNAPSHOT_FORMAT,
        "saved_at": utcnow(),
        "collections": {name: list(db[name].find()) for name in sorted(db.list_collection_names())},
    }
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as fh:
        fh.write(json_util.dumps(payload))
    os.replace(tmp_path, path)


class SnapshotWriter:
    """Periodically persists the in-memory database (and once more on shutdown)."""

    def __init__(self, db: Database, path: str, interval_seconds: float = 10.0) -> None:
        self._db = db
        self._path = path
        self._interval = interval_seconds
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="dev-snapshot", daemon=True)

    def start(self) -> None:
        self._thread.start()

    def _run(self) -> None:
        while not self._stop.wait(self._interval):
            self._save_quietly()

    def _save_quietly(self) -> None:
        try:
            save_snapshot(self._db, self._path)
        except Exception as exc:  # noqa: BLE001 - never crash the server over a dev snapshot
            logger.warning("Dev snapshot save failed: %s", exc)

    def stop(self) -> None:
        self._stop.set()
        if self._thread.is_alive():
            self._thread.join(timeout=5)
        self._save_quietly()
