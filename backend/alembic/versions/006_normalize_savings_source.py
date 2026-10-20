"""normalize savings source from roundup to round_up

Revision ID: 006_normalize_savings_source
Revises: 005_add_onboarding_completion
"""

from alembic import op
import sqlalchemy as sa


revision = "006_normalize_savings_source"
down_revision = "005_add_onboarding_completion"
branch_labels = None
depends_on = None


def upgrade():
    # Compatible across SQLite and PostgreSQL
    op.execute(
        sa.text("UPDATE savings SET source = 'round_up' WHERE source = 'roundup'")
    )


def downgrade():
    pass
