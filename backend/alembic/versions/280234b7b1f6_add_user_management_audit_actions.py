"""add user management audit actions

Revision ID: 280234b7b1f6
Revises: e3be5018d5be
Create Date: 2026-08-25

Manually written migration — Alembic autogenerate cannot detect
PostgreSQL enum value additions.

Adds 4 new values to the `auditaction` PostgreSQL enum:
  USER_UPDATED, USER_ACTIVATED, USER_DEACTIVATED, USER_ROLE_CHANGED

PostgreSQL allows adding enum values inside a transaction only from
version 12+.  We use `IF NOT EXISTS` (PG 9.6+) for idempotency.
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers
revision: str = "280234b7b1f6"
down_revision: Union[str, Sequence[str], None] = "e3be5018d5be"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add user-management audit action values to the auditaction enum."""
    op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'USER_UPDATED'")
    op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'USER_ACTIVATED'")
    op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'USER_DEACTIVATED'")
    op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'USER_ROLE_CHANGED'")


def downgrade() -> None:
    """PostgreSQL does not support removing enum values.

    To reverse this migration you would need to:
      1. Migrate all rows using the old values to a different value.
      2. Recreate the enum without those values.
      3. Alter the column to use the new enum.

    For safety in a development environment, this downgrade is intentionally
    left as a no-op with a clear comment.
    """
    # NOTE: PostgreSQL does not support DROP VALUE on enum types.
    # Manual intervention is required to reverse this change.
    pass
