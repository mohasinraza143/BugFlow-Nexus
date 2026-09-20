"""Phase 7 — issue_comments, issue_attachments tables + extend auditaction enum.

Revision ID: a1b2c3d4e5f6
Revises: 280234b7b1f6
Create Date: 2026-08-25

Manually written migration.

Creates:
  - issue_comments table
  - issue_attachments table

Extends the `auditaction` PostgreSQL enum with 5 new values:
  COMMENT_CREATED, COMMENT_UPDATED, COMMENT_DELETED,
  ATTACHMENT_UPLOADED, ATTACHMENT_DELETED

NOTE: PostgreSQL enum values can only be ADDED, not removed.
The downgrade() drops the two new tables but cannot remove the enum values.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "280234b7b1f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create issue_comments + issue_attachments tables and extend auditaction enum."""

    # ------------------------------------------------------------------ #
    # 1. Extend the auditaction PostgreSQL enum (must run before tables   #
    #    that reference the enum type, though these tables don't use it   #
    #    directly — kept here for logical grouping).                       #
    # PostgreSQL requires ADD VALUE to run outside a transaction in PG<12,#
    # but PG 12+ allows it inside a transaction. We use IF NOT EXISTS for #
    # idempotency (requires PG 9.6+).                                     #
    # ------------------------------------------------------------------ #
    op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'COMMENT_CREATED'")
    op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'COMMENT_UPDATED'")
    op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'COMMENT_DELETED'")
    op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'ATTACHMENT_UPLOADED'")
    op.execute("ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'ATTACHMENT_DELETED'")

    # ------------------------------------------------------------------ #
    # 2. Create issue_comments table                                       #
    # ------------------------------------------------------------------ #
    op.create_table(
        "issue_comments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("issue_id", sa.Integer(), nullable=False),
        sa.Column("author_id", sa.Integer(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
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
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["issue_id"], ["issues.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_issue_comments_issue_id"), "issue_comments", ["issue_id"], unique=False
    )
    op.create_index(
        op.f("ix_issue_comments_author_id"), "issue_comments", ["author_id"], unique=False
    )
    op.create_index(
        op.f("ix_issue_comments_created_at"), "issue_comments", ["created_at"], unique=False
    )

    # ------------------------------------------------------------------ #
    # 3. Create issue_attachments table                                    #
    # ------------------------------------------------------------------ #
    op.create_table(
        "issue_attachments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("issue_id", sa.Integer(), nullable=False),
        sa.Column("uploaded_by", sa.Integer(), nullable=False),
        sa.Column(
            "original_filename",
            sa.String(length=500),
            nullable=False,
            comment="Display name only — never used for storage.",
        ),
        sa.Column(
            "stored_filename",
            sa.String(length=500),
            nullable=False,
            comment="Server-generated UUID-based filename used on disk.",
        ),
        sa.Column(
            "storage_path",
            sa.String(length=1000),
            nullable=False,
            comment="Relative internal path — never exposed in API responses.",
        ),
        sa.Column(
            "mime_type",
            sa.String(length=200),
            nullable=False,
            comment="Server-validated MIME type, not raw client Content-Type.",
        ),
        sa.Column(
            "file_size",
            sa.BigInteger(),
            nullable=False,
            comment="File size in bytes.",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["issue_id"], ["issues.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("stored_filename", name="uq_issue_attachments_stored_filename"),
    )
    op.create_index(
        op.f("ix_issue_attachments_issue_id"),
        "issue_attachments",
        ["issue_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_issue_attachments_uploaded_by"),
        "issue_attachments",
        ["uploaded_by"],
        unique=False,
    )
    op.create_index(
        op.f("ix_issue_attachments_created_at"),
        "issue_attachments",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    """Drop issue_attachments and issue_comments tables.

    NOTE: The 5 added auditaction enum values cannot be removed in PostgreSQL.
    Manual intervention is required to reverse the enum change.
    """
    # Drop attachments first (no dependency on comments)
    op.drop_index(op.f("ix_issue_attachments_created_at"), table_name="issue_attachments")
    op.drop_index(op.f("ix_issue_attachments_uploaded_by"), table_name="issue_attachments")
    op.drop_index(op.f("ix_issue_attachments_issue_id"), table_name="issue_attachments")
    op.drop_table("issue_attachments")

    # Drop comments
    op.drop_index(op.f("ix_issue_comments_created_at"), table_name="issue_comments")
    op.drop_index(op.f("ix_issue_comments_author_id"), table_name="issue_comments")
    op.drop_index(op.f("ix_issue_comments_issue_id"), table_name="issue_comments")
    op.drop_table("issue_comments")

    # NOTE: PostgreSQL does not support removing enum values.
    # The COMMENT_* and ATTACHMENT_* values remain in the auditaction enum.
    # To remove them: recreate the enum without these values (requires no rows using them).
