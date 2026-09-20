"""
Notification model — Phase 8.

Stores immutable in-app notification records. Every notification is private
to its recipient (user_id). The notification is created inside the same
database transaction as the business operation that caused it.

Security notes:
  - password_hash, JWT tokens, OTP codes, SMTP credentials are NEVER
    stored in notification title or message fields.
  - user_id is set server-side from the validated JWT — never from client input.
  - ON DELETE CASCADE means deleting a user removes their notifications.
"""

import enum

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class NotificationType(str, enum.Enum):
    """PostgreSQL-backed enum for notification categories.

    Mirrors the business events that generate notifications. Adding new
    values requires an Alembic migration (ALTER TYPE ... ADD VALUE).
    """

    ISSUE_ASSIGNED = "ISSUE_ASSIGNED"
    ISSUE_STATUS_CHANGED = "ISSUE_STATUS_CHANGED"
    ISSUE_RESOLVED = "ISSUE_RESOLVED"
    ISSUE_REOPENED = "ISSUE_REOPENED"
    ISSUE_COMMENTED = "ISSUE_COMMENTED"
    ISSUE_MENTIONED = "ISSUE_MENTIONED"
    ATTACHMENT_ADDED = "ATTACHMENT_ADDED"
    USER_ROLE_CHANGED = "USER_ROLE_CHANGED"
    USER_ACTIVATED = "USER_ACTIVATED"
    USER_DEACTIVATED = "USER_DEACTIVATED"
    ISSUE_REPORTED = "ISSUE_REPORTED"  # Sent to ADMINs when a USER submits a new issue
    SPRINT_STARTED = "SPRINT_STARTED"
    SPRINT_ENDED = "SPRINT_ENDED"
    SPRINT_OVERDUE = "SPRINT_OVERDUE"


class Notification(Base):
    """Persistent in-app notification record.

    Immutable after creation (no UPDATE on existing rows).
    Only is_read and read_at are mutable.
    """

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Recipient — cascade delete keeps the table clean when users are removed
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    notification_type: Mapped[NotificationType] = mapped_column(
        Enum(NotificationType, name="notificationtype", create_type=False),
        nullable=False,
        index=True,
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)

    # Optional entity reference for client-side deep linking
    entity_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    entity_key: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Read state — only mutable columns
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    read_at: Mapped[DateTime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    # Relationship (for eager loading the user when needed)
    recipient: Mapped["User"] = relationship(  # type: ignore[name-defined]
        "User",
        foreign_keys=[user_id],
        lazy="select",
    )

    # Composite index for the primary read pattern:
    # WHERE user_id = ? AND is_read = false ORDER BY created_at DESC
    __table_args__ = (
        Index(
            "ix_notifications_user_id_is_read",
            "user_id",
            "is_read",
        ),
        Index(
            "ix_notifications_created_at",
            "created_at",
        ),
    )
