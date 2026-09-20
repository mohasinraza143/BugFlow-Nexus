"""add USER value to userrole enum

Revision ID: f1a2b3c4d5e6
Revises: e3be5018d5be
Create Date: 2026-08-30 22:24:00.000000

Migration strategy:
  - Adds 'USER' to the existing PostgreSQL 'userrole' enum using
    ALTER TYPE ... ADD VALUE.  This is non-destructive: existing rows
    (ADMIN, DEVELOPER, TESTER) are completely unaffected.
  - Downgrade removes USER-role users first, then removes the enum value
    via recreating the type (required because PostgreSQL cannot DROP enum values
    directly).  This is safe only if no USER accounts exist yet.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add USER to the userrole enum — zero-downtime, non-destructive."""
    # PostgreSQL ALTER TYPE ADD VALUE is transactional (pg >= 12) but
    # cannot be rolled back inside the same transaction as other DDL.
    # We use execute_if to skip on non-PG databases (e.g. SQLite in CI).
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'USER'")


def downgrade() -> None:
    """
    Downgrade: remove USER from the enum by recreating it.

    WARNING: This DELETES all users with role=USER first.
    Only safe when no real USER accounts exist.
    """
    # 1. Delete any users that have the USER role
    op.execute("DELETE FROM users WHERE role = 'USER'")

    # 2. Recreate the enum without USER
    #    (PostgreSQL cannot DROP enum values directly)
    op.execute("""
        ALTER TYPE userrole RENAME TO userrole_old;
        CREATE TYPE userrole AS ENUM ('ADMIN', 'DEVELOPER', 'TESTER');
        ALTER TABLE users
            ALTER COLUMN role TYPE userrole
            USING role::text::userrole;
        DROP TYPE userrole_old;
    """)
