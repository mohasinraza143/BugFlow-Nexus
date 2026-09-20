"""Add Sprint Notifications

Revision ID: ebc89a4b0ad1
Revises: 09a44fc701e4
Create Date: 2026-09-02 20:30:39.877469

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ebc89a4b0ad1'
down_revision: Union[str, Sequence[str], None] = '09a44fc701e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'SPRINT_STARTED'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'SPRINT_ENDED'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'SPRINT_OVERDUE'")


def downgrade() -> None:
    """Downgrade schema."""
    pass
