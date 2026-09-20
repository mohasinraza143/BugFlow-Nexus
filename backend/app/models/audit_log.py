"""
AuditLog model — Phase 5.

Immutable record of every significant action performed in the system.
Records are written once and never modified or deleted through normal APIs.

Table: audit_logs
"""

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


# --------------------------------------------------------------------------- #
# Audit action enumeration                                                     #
# --------------------------------------------------------------------------- #

class AuditAction(str, enum.Enum):
    """All auditable actions currently supported by the application."""

    # Issue lifecycle
    ISSUE_CREATED        = "ISSUE_CREATED"
    ISSUE_DELETED        = "ISSUE_DELETED"
    ISSUE_UPDATED        = "ISSUE_UPDATED"
    ISSUE_ASSIGNED       = "ISSUE_ASSIGNED"
    ISSUE_STATUS_CHANGED = "ISSUE_STATUS_CHANGED"
    ISSUE_RESOLVED       = "ISSUE_RESOLVED"
    ISSUE_REOPENED       = "ISSUE_REOPENED"

    # Project lifecycle
    PROJECT_CREATED      = "PROJECT_CREATED"
    PROJECT_UPDATED      = "PROJECT_UPDATED"
    PROJECT_DEACTIVATED  = "PROJECT_DEACTIVATED"
    
    # Sprint lifecycle
    SPRINT_CREATED                 = "SPRINT_CREATED"
    SPRINT_UPDATED                 = "SPRINT_UPDATED"
    SPRINT_STARTED                 = "SPRINT_STARTED"
    SPRINT_EXTENDED                = "SPRINT_EXTENDED"
    SPRINT_COMPLETED               = "SPRINT_COMPLETED"
    SPRINT_ARCHIVED                = "SPRINT_ARCHIVED"
    SPRINT_DELETED                 = "SPRINT_DELETED"
    # Sprint approval workflow
    SPRINT_TESTER_ASSIGNED         = "SPRINT_TESTER_ASSIGNED"
    SPRINT_SUBMITTED_FOR_APPROVAL  = "SPRINT_SUBMITTED_FOR_APPROVAL"
    SPRINT_APPROVED                = "SPRINT_APPROVED"
    SPRINT_CHANGES_REQUESTED       = "SPRINT_CHANGES_REQUESTED"

    # Authentication events
    AUTH_LOGIN           = "AUTH_LOGIN"
    AUTH_LOGOUT          = "AUTH_LOGOUT"

    # User management (Phase 6)
    USER_UPDATED         = "USER_UPDATED"
    USER_ACTIVATED       = "USER_ACTIVATED"
    USER_DEACTIVATED     = "USER_DEACTIVATED"
    USER_ROLE_CHANGED    = "USER_ROLE_CHANGED"

    # Comments (Phase 7)
    COMMENT_CREATED      = "COMMENT_CREATED"
    COMMENT_UPDATED      = "COMMENT_UPDATED"
    COMMENT_DELETED      = "COMMENT_DELETED"

    # Attachments (Phase 7)
    ATTACHMENT_UPLOADED  = "ATTACHMENT_UPLOADED"
    ATTACHMENT_DELETED   = "ATTACHMENT_DELETED"



# --------------------------------------------------------------------------- #
# AuditLog ORM model                                                           #
# --------------------------------------------------------------------------- #

class AuditLog(Base):
    """Immutable audit record.

    Written inside the same database transaction as the mutating operation.
    If the parent transaction rolls back, the audit record also rolls back —
    ensuring no misleading entries for failed operations.

    Design constraints:
    - No `updated_at` column: records must not be updated.
    - No normal UPDATE/DELETE APIs are exposed.
    - `user_id` is SET NULL on user deletion so historical records are
      preserved without referencing a deleted account.
    """

    __tablename__ = "audit_logs"

    # ------------------------------------------------------------------ #
    # Primary key                                                          #
    # ------------------------------------------------------------------ #
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # ------------------------------------------------------------------ #
    # Actor                                                                #
    # ------------------------------------------------------------------ #
    user_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # ------------------------------------------------------------------ #
    # Action classification                                                #
    # ------------------------------------------------------------------ #
    action: Mapped[AuditAction] = mapped_column(
        Enum(AuditAction, name="auditaction", create_type=True),
        nullable=False,
        index=True,
    )

    # ------------------------------------------------------------------ #
    # Affected resource                                                    #
    # ------------------------------------------------------------------ #
    entity_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        comment="ISSUE | PROJECT | AUTH",
    )
    entity_id: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        index=True,
        comment="Integer ID of the affected resource, if applicable.",
    )
    entity_key: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        index=True,
        comment="Human-readable key, e.g. DM-0001 or AGRO.",
    )

    # ------------------------------------------------------------------ #
    # Description                                                          #
    # ------------------------------------------------------------------ #
    description: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="",
        comment="Human-readable sentence describing the action.",
    )

    # ------------------------------------------------------------------ #
    # Change data (JSON diff — only changed fields are stored)             #
    # ------------------------------------------------------------------ #
    old_values: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="Previous field values (changed fields only).",
    )
    new_values: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="New field values (changed fields only).",
    )

    # ------------------------------------------------------------------ #
    # Timestamp (immutable — no updated_at)                                #
    # ------------------------------------------------------------------ #
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    # ------------------------------------------------------------------ #
    # Relationships                                                        #
    # ------------------------------------------------------------------ #
    actor: Mapped["User | None"] = relationship(  # type: ignore[name-defined]
        "User",
        foreign_keys=[user_id],
        lazy="select",
    )

    # ------------------------------------------------------------------ #
    # Composite index for common admin query patterns                      #
    # ------------------------------------------------------------------ #
    __table_args__ = (
        Index("ix_audit_logs_entity_type_action", "entity_type", "action"),
        Index("ix_audit_logs_created_at_desc", created_at.desc()),
    )

    def __repr__(self) -> str:
        return (
            f"<AuditLog id={self.id} action={self.action} "
            f"entity={self.entity_type}:{self.entity_key}>"
        )
