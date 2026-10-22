"""
Fail if the database schema differs from the ORM models.

Run after `python scripts/migrate.py` (CI does) to prove that migrations alone
build the schema the application expects:

    python scripts/check_schema.py
"""

import os
import sys

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, BACKEND_DIR)

import app.models.models  # noqa: E402,F401  (registers the tables)
from alembic.autogenerate import compare_metadata  # noqa: E402
from alembic.migration import MigrationContext  # noqa: E402
from app.database import Base, engine  # noqa: E402

# Kept on purpose by migration 007 (old budgets data); not part of the models.
IGNORED_TABLES = {"budgets_legacy", "alembic_version"}


def include_object(obj, name, type_, reflected, compare_to):
    if type_ == "table" and name in IGNORED_TABLES:
        return False
    if type_ == "index" and getattr(obj, "table", None) is not None:
        return obj.table.name not in IGNORED_TABLES
    return True


def main() -> int:
    with engine.connect() as connection:
        context = MigrationContext.configure(
            connection,
            opts={
                "compare_type": True,
                "compare_server_default": False,
                "include_object": include_object,
            },
        )
        diffs = compare_metadata(context, Base.metadata)

    if diffs:
        print("Schema differs from the models:")
        for diff in diffs:
            print("  ", diff)
        return 1
    print("Schema matches the models.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
