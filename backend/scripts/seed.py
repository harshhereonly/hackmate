"""Load the clearly labelled HackMate demo dataset.

    python -m scripts.seed                 # add demo data (skips if it already exists)
    python -m scripts.seed --reset         # remove existing demo data first
    python -m scripts.seed --clear         # only remove demo data

Demo accounts get an unusable random password unless SEED_DEMO_PASSWORD is set
(useful for local demos only; never set it for a shared or production database).
Refuses to run when ENVIRONMENT=production unless --allow-production is given.
"""

from __future__ import annotations

import argparse
import os

from app.core.config import get_settings
from app.schemas.auth import validate_new_password
from app.services.demo_data import clear_demo_data, has_demo_data, seed_demo_data
from scripts._db import open_database


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Seed HackMate demo data.")
    parser.add_argument("--reset", action="store_true", help="Delete existing demo data before seeding")
    parser.add_argument("--clear", action="store_true", help="Delete demo data and exit")
    parser.add_argument("--allow-production", action="store_true")
    args = parser.parse_args(argv)

    settings = get_settings()
    if settings.is_production and not args.allow_production:
        raise SystemExit("Refusing to seed demo data into a production environment.")
    password = os.environ.get("SEED_DEMO_PASSWORD") or None
    if password:
        try:
            validate_new_password(password)
        except ValueError as exc:
            raise SystemExit(f"SEED_DEMO_PASSWORD: {exc}") from None

    with open_database(settings) as db:
        if args.clear or args.reset:
            clear_demo_data(db)
            print("Removed existing demo data.")
            if args.clear:
                return
        if has_demo_data(db):
            print("Demo data already exists. Use --reset to recreate it.")
            return
        counts = seed_demo_data(db, password)
        print(f"Seeded demo data: {counts}. Every item is labelled 'Sample'/'Demo' and is fictional.")
        if password:
            print("Demo accounts use SEED_DEMO_PASSWORD; their emails end in .demo@example.com.")
        else:
            print("Demo accounts have random passwords and cannot be signed into (browse them from your own account).")


if __name__ == "__main__":
    main()
