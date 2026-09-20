"""
SQLAlchemy declarative base.

All ORM models must inherit from `Base`.
Alembic reads `Base.metadata` to detect schema changes.

IMPORTANT: All model modules are imported at the bottom of this file
so that Alembic can discover every table when autogenerating migrations.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Project-wide SQLAlchemy declarative base."""
    pass


# ---------------------------------------------------------------------------
# Model imports — keep in dependency order (no circular imports).
# These imports register models against Base.metadata.
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Model imports - keep in dependency order (no circular imports).
# These imports register models against Base.metadata.
# ---------------------------------------------------------------------------
from app.models import user, project, issue, audit_log, issue_comment, issue_attachment, notification, notification_preference  # noqa: E402, F401

