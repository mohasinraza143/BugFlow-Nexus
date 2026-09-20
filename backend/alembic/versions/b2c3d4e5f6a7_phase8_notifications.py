"""Phase 8 — notifications and notification_preferences tables + notificationtype enum.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-08-26

Creates:
  - notificationtype PostgreSQL enum
  - notifications table
  - notification_preferences table
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers
revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NOTIFICATION_TYPES = (
    "ISSUE_ASSIGNED",
    "ISSUE_STATUS_CHANGED",
    "ISSUE_RESOLVED",
    "ISSUE_REOPENED",
    "ISSUE_COMMENTED",
    "ISSUE_MENTIONED",
    "ATTACHMENT_ADDED",
    "USER_ROLE_CHANGED",
    "USER_ACTIVATED",
    "USER_DEACTIVATED",
)


def upgrade() -> None:
    """Create notificationtype enum, notifications and notification_preferences tables."""
    # 1. Create notificationtype enum idempotently
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE notificationtype AS ENUM (
                'ISSUE_ASSIGNED',
                'ISSUE_STATUS_CHANGED',
                'ISSUE_RESOLVED',
                'ISSUE_REOPENED',
                'ISSUE_COMMENTED',
                'ISSUE_MENTIONED',
                'ATTACHMENT_ADDED',
                'USER_ROLE_CHANGED',
                'USER_ACTIVATED',
                'USER_DEACTIVATED'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
        """
    )

    # 2. Create notifications table
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "notification_type",
            postgresql.ENUM(*NOTIFICATION_TYPES, name="notificationtype", create_type=False),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("entity_type", sa.String(length=50), nullable=True),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("entity_key", sa.String(length=100), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_notifications_user_id"), "notifications", ["user_id"], unique=False
    )
    op.create_index(
        op.f("ix_notifications_notification_type"),
        "notifications",
        ["notification_type"],
        unique=False,
    )
    op.create_index(
        "ix_notifications_user_id_is_read",
        "notifications",
        ["user_id", "is_read"],
        unique=False,
    )
    op.create_index(
        "ix_notifications_created_at",
        "notifications",
        ["created_at"],
        unique=False,
    )

    # 3. Create notification_preferences table
    op.create_table(
        "notification_preferences",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("email_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("issue_assigned", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("issue_status_changed", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("issue_resolved", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("issue_reopened", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("issue_commented", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("attachment_added", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_notification_preferences_user_id"),
    )
    op.create_index(
        op.f("ix_notification_preferences_user_id"),
        "notification_preferences",
        ["user_id"],
        unique=True,
    )


def downgrade() -> None:
    """Drop notification_preferences, notifications tables, and notificationtype enum."""
    op.drop_index(
        op.f("ix_notification_preferences_user_id"),
        table_name="notification_preferences",
    )
    op.drop_table("notification_preferences")

    op.drop_index("ix_notifications_created_at", table_name="notifications")
    op.drop_index("ix_notifications_user_id_is_read", table_name="notifications")
    op.drop_index(
        op.f("ix_notifications_notification_type"), table_name="notifications"
    )
    op.drop_index(op.f("ix_notifications_user_id"), table_name="notifications")
    op.drop_table("notifications")

    sa.Enum(*NOTIFICATION_TYPES, name="notificationtype").drop(
        op.get_bind(), checkfirst=True
    )
