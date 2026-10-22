"""bring the PostgreSQL schema in line with the ORM models

Migrations 001-006 produced a schema that had drifted from app/models/models.py:
the app could not run on a database built only from `alembic upgrade head`
(e.g. users.university, goals.status, savings.goal_id, user_sessions.jwt_token_id
and the whole budgets table shape were missing).

PostgreSQL only. SQLite development databases are built by
`Base.metadata.create_all` (see app/main.py) and already match the models, so
this migration does nothing there.

The old `budgets` table (keyed by trans_id / report_id, no user_id) cannot hold
the rows the current code writes, so it is kept as `budgets_legacy` rather than
altered or dropped.

Revision ID: 007_sync_schema_with_models
Revises: 006_normalize_savings_source
"""

import sqlalchemy as sa
from alembic import op

revision = "007_sync_schema_with_models"
down_revision = "006_normalize_savings_source"
branch_labels = None
depends_on = None


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade():
    if not _is_postgres():
        return

    # --- budgets: replace the legacy table ---------------------------------
    op.drop_constraint(
        "ai_recommendations_budget_id_fkey", "ai_recommendations", type_="foreignkey"
    )
    # Recommendations pointed at legacy budget ids, which no longer exist.
    op.execute("UPDATE ai_recommendations SET budget_id = NULL")
    op.rename_table("budgets", "budgets_legacy")
    op.execute(
        "ALTER TABLE budgets_legacy RENAME CONSTRAINT budgets_pkey TO budgets_legacy_pkey"
    )

    op.create_table(
        "budgets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.user_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("limit_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("period", sa.String(), nullable=False),
        sa.Column("start_date", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column(
            "is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.create_index("ix_budgets_id", "budgets", ["id"])
    op.create_index("ix_budgets_user_id", "budgets", ["user_id"])

    # --- ai_recommendations --------------------------------------------------
    op.add_column(
        "ai_recommendations",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.user_id")),
    )
    op.add_column("ai_recommendations", sa.Column("input_context", sa.JSON()))
    op.add_column(
        "ai_recommendations",
        sa.Column("accepted", sa.Integer(), server_default="0"),
    )
    op.alter_column("ai_recommendations", "budget_id", nullable=True)
    op.create_foreign_key(
        "ai_recommendations_budget_id_fkey",
        "ai_recommendations",
        "budgets",
        ["budget_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # --- audit_logs ----------------------------------------------------------
    op.add_column(
        "audit_logs",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.user_id")),
    )
    op.add_column("audit_logs", sa.Column("entity_type", sa.String()))
    op.add_column("audit_logs", sa.Column("entity_id", sa.Integer()))
    op.add_column("audit_logs", sa.Column("metadata", sa.JSON()))
    # Goal / budget / savings audit entries have no transaction.
    op.alter_column("audit_logs", "trans_id", nullable=True)

    # --- chat_history, financial_health, notifications ----------------------
    op.add_column("chat_history", sa.Column("role", sa.String()))
    op.add_column("financial_health", sa.Column("contributing_factors", sa.JSON()))
    op.add_column("notifications", sa.Column("type", sa.String()))
    op.add_column("notifications", sa.Column("read_at", sa.DateTime()))

    # --- goals, savings --------------------------------------------------------
    op.add_column(
        "goals",
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
    )
    op.add_column(
        "savings",
        sa.Column("goal_id", sa.Integer(), sa.ForeignKey("goals.id"), nullable=True),
    )

    # --- sessions & security events (token revocation, audit trail) ---------
    op.add_column("user_sessions", sa.Column("jwt_token_id", sa.String()))
    op.add_column("user_sessions", sa.Column("expires_at", sa.DateTime()))
    op.add_column("user_sessions", sa.Column("revoked_at", sa.DateTime()))
    op.create_unique_constraint(
        "user_sessions_jwt_token_id_key", "user_sessions", ["jwt_token_id"]
    )
    op.add_column(
        "security_events",
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.user_id", ondelete="CASCADE"),
        ),
    )
    op.add_column("security_events", sa.Column("ip_address", sa.String()))
    op.add_column("security_events", sa.Column("user_agent", sa.String()))

    # --- users -----------------------------------------------------------------
    op.add_column("users", sa.Column("university", sa.String()))
    op.add_column("users", sa.Column("oauth_provider", sa.String()))
    op.add_column("users", sa.Column("oauth_id", sa.String()))
    op.create_unique_constraint("users_oauth_id_key", "users", ["oauth_id"])


def downgrade():
    # Intentionally not reversible: it would recreate the broken legacy shape
    # and discard data written by the current application.
    pass
