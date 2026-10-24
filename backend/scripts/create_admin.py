"""Provision an administrator. There is deliberately no HTTP endpoint for this.

Run from the backend/ folder with the virtual environment active:

    python -m scripts.create_admin --email you@example.com              # promote, or create (prompts for a password)
    python -m scripts.create_admin --email you@example.com --name "Ada"
    python -m scripts.create_admin --email you@example.com --demote     # back to a normal user

For non-interactive use (CI), set ADMIN_PASSWORD in the environment instead of typing it.
"""

from __future__ import annotations

import argparse
import getpass
import os
import sys

from email_validator import EmailNotValidError, validate_email

from app.schemas.auth import validate_new_password
from app.core.security import hash_password
from app.services.profiles import create_profile
from app.utils import utcnow
from scripts._db import open_database


def _read_password() -> str:
    password = os.environ.get("ADMIN_PASSWORD")
    if password is None:
        if not sys.stdin.isatty():
            raise SystemExit("No terminal available. Set ADMIN_PASSWORD to provide the password.")
        password = getpass.getpass("New admin password: ")
        if getpass.getpass("Repeat password: ") != password:
            raise SystemExit("Passwords do not match.")
    try:
        return validate_new_password(password)
    except ValueError as exc:
        raise SystemExit(str(exc)) from None


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Create or promote a HackMate administrator.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", default="HackMate Admin")
    parser.add_argument("--demote", action="store_true", help="Remove admin rights from this account")
    args = parser.parse_args(argv)

    try:
        email = validate_email(args.email, check_deliverability=False).normalized.lower()
    except EmailNotValidError as exc:
        raise SystemExit(f"Invalid email: {exc}") from None

    with open_database() as db:
        user = db.users.find_one({"email": email})
        if args.demote:
            if not user:
                raise SystemExit("No account with that email.")
            if user.get("role") == "admin" and db.users.count_documents({"role": "admin"}) <= 1:
                raise SystemExit("Refusing to demote the last administrator.")
            db.users.update_one({"_id": user["_id"]}, {"$set": {"role": "user", "updated_at": utcnow()}})
            print(f"{email} is now a regular user.")
            return
        if user:
            db.users.update_one({"_id": user["_id"]}, {"$set": {"role": "admin", "status": "active",
                                                                 "updated_at": utcnow()}})
            print(f"Promoted existing account {email} to administrator.")
            return
        password = _read_password()
        now = utcnow()
        user_id = db.users.insert_one({
            "email": email, "password_hash": hash_password(password), "role": "admin", "status": "active",
            "email_verified": True, "created_at": now, "updated_at": now, "last_login_at": None,
        }).inserted_id
        create_profile(db, user_id, args.name)
        print(f"Created administrator {email}. Sign in at the normal login page; the Admin link appears in the menu.")


if __name__ == "__main__":
    main()
