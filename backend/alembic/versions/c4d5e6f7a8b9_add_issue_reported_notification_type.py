"""Add ISSUE_REPORTED value to notificationtype enum.

Revision ID: c4d5e6f7a8b9
Revises: b2c3d4e5f6a7
Create Date: 2026-09-01

PostgreSQL ALTER TYPE ... ADD VALUE is non-transactional; it cannot be run
inside an explicit transaction block. Alembic's op.execute() wraps calls in
the autobegin transaction, so we must use IF NOT EXISTS (PG ≥ 9.6) which
makes the operation idempotent.
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers
revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add ISSUE_REPORTED to the notificationtype PostgreSQL enum."""
    # ALTER TYPE … ADD VALUE cannot run inside a transaction block.
    # We use a DO block with a check to make the operation idempotent.
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_enum
                WHERE enumlabel = 'ISSUE_REPORTED'
                  AND enumtypid = (
                      SELECT oid FROM pg_type WHERE typname = 'notificationtype'
                  )
            ) THEN
                ALTER TYPE notificationtype ADD VALUE 'ISSUE_REPORTED';
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    """
    PostgreSQL does not support removing enum values without recreating the type.
    Downgrade is intentionally a no-op — the extra value is harmless.
    """
    pass
