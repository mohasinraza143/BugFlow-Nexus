"""add explicit QA verification issue status

Revision ID: 7f4a9c2d1e6b
Revises: 1c2d3e4f5a6b
"""

from typing import Sequence, Union

from alembic import op

revision: str = "7f4a9c2d1e6b"
down_revision: Union[str, Sequence[str], None] = ("1c2d3e4f5a6b", "469a18a93716")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE issuestatus ADD VALUE IF NOT EXISTS 'QA_VERIFICATION'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values safely.
    pass
