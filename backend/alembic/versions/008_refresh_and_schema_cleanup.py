"""refresh-token columns, transaction source, and remaining schema drift

- user_sessions: refresh_token_hash / previous_refresh_token_hash /
  refresh_expires_at (rotating refresh tokens; only hashes are stored)
- transactions.source: where a row came from (manual / csv_import / bank_simulation)
- finishes the sync started in 007 so `scripts/check_schema.py` reports no
  difference between the migrated database and the ORM models: nullability that
  the models allow, and the three index names that still used old column names

PostgreSQL only; SQLite development databases are built by `create_all`.

Revision ID: 008_refresh_and_schema_cleanup
Revises: 007_sync_schema_with_models
"""

from alembic import op

revision = "008_refresh_and_schema_cleanup"
down_revision = "007_sync_schema_with_models"
branch_labels = None
depends_on = None

# Columns the models allow to be NULL but 001-006 made NOT NULL.
RELAXED_COLUMNS = [
    ("audit_logs", "timestamp"),
    ("chat_history", "created_at"),
    ("notifications", "status"),
    ("notifications", "created_at"),
    ("security_events", "severity"),
    ("security_events", "created_at"),
    ("user_sessions", "login_at"),
]

RENAMED_INDEXES = [
    ("ix_goals_goal_id", "ix_goals_id"),
    ("ix_savings_save_id", "ix_savings_id"),
    ("ix_transactions_trans_id", "ix_transactions_id"),
]


def upgrade():
    if op.get_bind().dialect.name != "postgresql":
        return

    # Idempotent on purpose: databases that the application created itself with
    # `create_all` are stamped at 007 by scripts/migrate.py and may already have
    # some of these columns.
    op.execute(
        "ALTER TABLE user_sessions "
        "ADD COLUMN IF NOT EXISTS refresh_token_hash VARCHAR, "
        "ADD COLUMN IF NOT EXISTS previous_refresh_token_hash VARCHAR, "
        "ADD COLUMN IF NOT EXISTS refresh_expires_at TIMESTAMP"
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'user_sessions_refresh_token_hash_key'
            ) THEN
                ALTER TABLE user_sessions ADD CONSTRAINT
                    user_sessions_refresh_token_hash_key UNIQUE (refresh_token_hash);
            END IF;
        END $$;
        """
    )

    op.execute(
        "ALTER TABLE transactions "
        "ADD COLUMN IF NOT EXISTS source VARCHAR NOT NULL DEFAULT 'manual'"
    )

    for table, column in RELAXED_COLUMNS:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} DROP NOT NULL")

    for old, new in RENAMED_INDEXES:
        op.execute(f"ALTER INDEX IF EXISTS {old} RENAME TO {new}")


def downgrade():
    # Not reversible without discarding sessions and transaction provenance.
    pass
