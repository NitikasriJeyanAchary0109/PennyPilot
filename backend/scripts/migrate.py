"""
Bring the database schema up to date; run before the API starts.

- Fresh database                      → `alembic upgrade head`.
- Database created earlier by the app's
  `create_all` (tables, no alembic_version) → `alembic stamp head`: its tables
  already match the models, and re-running 001-007 would fail on existing tables.
- Already managed by Alembic          → `alembic upgrade head`.

Usage (from the backend directory):  python scripts/migrate.py
"""

import os
import sys

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, BACKEND_DIR)
os.chdir(BACKEND_DIR)

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from app.database import engine  # noqa: E402
from sqlalchemy import inspect  # noqa: E402


def main() -> None:
    tables = set(inspect(engine).get_table_names())
    config = Config(os.path.join(BACKEND_DIR, "alembic.ini"))

    if "alembic_version" not in tables and "users" in tables:
        print("Existing unversioned schema found: stamping it as up to date.")
        command.stamp(config, "head")
    else:
        command.upgrade(config, "head")


if __name__ == "__main__":
    main()
