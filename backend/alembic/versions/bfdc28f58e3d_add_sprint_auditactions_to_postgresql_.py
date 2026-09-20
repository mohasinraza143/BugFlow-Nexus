"""Add Sprint AuditActions to PostgreSQL Enum

Revision ID: bfdc28f58e3d
Revises: ebc89a4b0ad1
Create Date: 2026-09-02 20:44:24.851160

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bfdc28f58e3d'
down_revision: Union[str, Sequence[str], None] = 'ebc89a4b0ad1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'SPRINT_CREATED'")
    op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'SPRINT_UPDATED'")
    op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'SPRINT_STARTED'")
    op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'SPRINT_EXTENDED'")
    op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'SPRINT_COMPLETED'")
    op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'SPRINT_ARCHIVED'")
    op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'SPRINT_DELETED'")


def downgrade() -> None:
    """Downgrade schema."""
    pass
