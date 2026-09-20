"""
Notification preference model — Phase 8.

One record per user (UNIQUE on user_id). Get-or-create behaviour:
if no record exists for a user, defaults are used (all enabled).

Do NOT bulk-create preference records for every existing user via migration —
the get-or-create pattern handles missing records transparently.
"""

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class NotificationPreference(Base):
    """Per-user notification preference record.

    All flags default to True. Users can disable specific notification
    categories or turn off email entirely.
    """

    __tablename__ = "notification_preferences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # Global email toggle — when False, no notification emails are sent
    email_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    # Per-event switches
    issue_assigned: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    issue_status_changed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    issue_resolved: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    issue_reopened: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    issue_commented: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    attachment_added: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
        onupdate=text("now()"),
    )

    # Relationship
    user: Mapped["User"] = relationship(  # type: ignore[name-defined]
        "User",
        foreign_keys=[user_id],
        lazy="select",
    )

    __table_args__ = (
        UniqueConstraint("user_id", name="uq_notification_preferences_user_id"),
    )
