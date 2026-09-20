"""add issue performance indexes

Revision ID: 8a5b0c3d2e7f
Revises: 7f4a9c2d1e6b
"""

from typing import Sequence, Union

from alembic import op

revision: str = "8a5b0c3d2e7f"
down_revision: Union[str, Sequence[str], None] = "7f4a9c2d1e6b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_issues_project_status", "issues", ["project_id", "status"])
    op.create_index("ix_issues_assignee_status", "issues", ["assignee_id", "status"])
    op.create_index("ix_issues_created_at", "issues", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_issues_created_at", table_name="issues")
    op.drop_index("ix_issues_assignee_status", table_name="issues")
    op.drop_index("ix_issues_project_status", table_name="issues")
