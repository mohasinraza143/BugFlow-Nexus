"""Add issue deletion audit action to PostgreSQL enum.

Revision ID: 1c2d3e4f5a6b
Revises: 09a44fc701e4
"""
from typing import Sequence, Union

from alembic import op


revision: str = "1c2d3e4f5a6b"
down_revision: Union[str, Sequence[str], None] = "09a44fc701e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'ISSUE_DELETED'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values safely.
    pass
