"""financial_health.summary_source: plain vs AI-written wellness summary

The wellness score is returned immediately with a plain factual summary; the AI's
narration is added afterwards. `summary_source` records which one is stored.

PostgreSQL only (SQLite dev databases are upgraded in place on start-up).
Idempotent, like 008.

Revision ID: 009_wellness_summary_source
Revises: 008_refresh_and_schema_cleanup
"""

from alembic import op

revision = "009_wellness_summary_source"
down_revision = "008_refresh_and_schema_cleanup"
branch_labels = None
depends_on = None


def upgrade():
    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute(
        "ALTER TABLE financial_health "
        "ADD COLUMN IF NOT EXISTS summary_source VARCHAR NOT NULL DEFAULT 'factual'"
    )


def downgrade():
    pass
