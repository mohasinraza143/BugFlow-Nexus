"""sprint_approval_workflow

Revision ID: 469a18a93716
Revises: bfdc28f58e3d
Create Date: 2026-09-08 19:08:00.769079

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '469a18a93716'
down_revision: Union[str, Sequence[str], None] = 'bfdc28f58e3d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ── 1. Add new SprintStatus enum values (PostgreSQL ALTER TYPE ADD VALUE) ──
    # These must happen BEFORE any column uses the new values.
    # IF NOT EXISTS guards are safe for idempotent reruns.
    op.execute("ALTER TYPE sprintstatus ADD VALUE IF NOT EXISTS 'IN_PROGRESS'")
    op.execute("ALTER TYPE sprintstatus ADD VALUE IF NOT EXISTS 'READY_FOR_APPROVAL'")

    # ── 2. Add new AuditAction enum values ─────────────────────────────────────
    op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'SPRINT_TESTER_ASSIGNED'")
    op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'SPRINT_SUBMITTED_FOR_APPROVAL'")
    op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'SPRINT_APPROVED'")
    op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'SPRINT_CHANGES_REQUESTED'")

    # ── 3. Add new sprint columns ───────────────────────────────────────────────
    op.add_column('sprints', sa.Column('assigned_tester_id', sa.Integer(), nullable=True))
    op.add_column('sprints', sa.Column('submitted_by_id', sa.Integer(), nullable=True))
    op.add_column('sprints', sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('sprints', sa.Column('approved_by_id', sa.Integer(), nullable=True))
    op.add_column('sprints', sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('sprints', sa.Column('review_comment', sa.Text(), nullable=True))

    # ── 4. Foreign keys ─────────────────────────────────────────────────────────
    op.create_foreign_key(
        'fk_sprints_assigned_tester_id_users', 'sprints', 'users',
        ['assigned_tester_id'], ['id'], ondelete='SET NULL'
    )
    op.create_foreign_key(
        'fk_sprints_submitted_by_id_users', 'sprints', 'users',
        ['submitted_by_id'], ['id'], ondelete='SET NULL'
    )
    op.create_foreign_key(
        'fk_sprints_approved_by_id_users', 'sprints', 'users',
        ['approved_by_id'], ['id'], ondelete='SET NULL'
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_sprints_approved_by_id_users', 'sprints', type_='foreignkey')
    op.drop_constraint('fk_sprints_submitted_by_id_users', 'sprints', type_='foreignkey')
    op.drop_constraint('fk_sprints_assigned_tester_id_users', 'sprints', type_='foreignkey')
    op.drop_column('sprints', 'review_comment')
    op.drop_column('sprints', 'approved_at')
    op.drop_column('sprints', 'approved_by_id')
    op.drop_column('sprints', 'submitted_at')
    op.drop_column('sprints', 'submitted_by_id')
    op.drop_column('sprints', 'assigned_tester_id')
    # Note: PostgreSQL does not support removing enum values via ALTER TYPE DROP VALUE.
    # To fully revert the enum, a more complex migration would be needed.
