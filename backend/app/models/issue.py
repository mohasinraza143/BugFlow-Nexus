"""
Issue model.

The central entity of the defect tracking system.
An Issue belongs to a Project and is reported by a User.
It may optionally be assigned to a Developer.

Phase 4: Added defect detail columns (environment, steps_to_reproduce,
expected_result, actual_result, resolution_summary, resolved_at).
"""

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, Text, func, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


# ------------------------------------------------------------------ #
# Issue enumerations                                                   #
# ------------------------------------------------------------------ #

class IssueType(str, enum.Enum):
    BUG = "BUG"
    FEATURE_REQUEST = "FEATURE_REQUEST"
    ENHANCEMENT = "ENHANCEMENT"
    TECHNICAL_DEBT = "TECHNICAL_DEBT"
    SUPPORT_TICKET = "SUPPORT_TICKET"


class Severity(str, enum.Enum):
    MINOR = "MINOR"
    MAJOR = "MAJOR"
    CRITICAL = "CRITICAL"
    BLOCKER = "BLOCKER"


class Priority(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    URGENT = "URGENT"


class IssueStatus(str, enum.Enum):
    REPORTED = "REPORTED"
    TRIAGED = "TRIAGED"
    ASSIGNED = "ASSIGNED"
    IN_DEVELOPMENT = "IN_DEVELOPMENT"
    IN_REVIEW = "IN_REVIEW"
    IN_TESTING = "IN_TESTING"
    QA_VERIFICATION = "QA_VERIFICATION"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"
    REOPENED = "REOPENED"


# ------------------------------------------------------------------ #
# Valid status transitions                                             #
# Enforced by the issue service — not a DB constraint.                #
# ------------------------------------------------------------------ #

# Developer-driven transitions (from → set of allowed targets)
DEVELOPER_TRANSITIONS: dict[IssueStatus, set[IssueStatus]] = {
    IssueStatus.ASSIGNED:       {IssueStatus.IN_DEVELOPMENT},
    IssueStatus.IN_DEVELOPMENT: {IssueStatus.IN_REVIEW},
    IssueStatus.IN_REVIEW:      {IssueStatus.IN_TESTING, IssueStatus.IN_DEVELOPMENT},
    IssueStatus.REOPENED:       {IssueStatus.IN_DEVELOPMENT},
}

# Tester / Admin can reopen
REOPENABLE_STATUSES: set[IssueStatus] = {
    IssueStatus.RESOLVED,
    IssueStatus.CLOSED,
    IssueStatus.IN_TESTING,
}


# ------------------------------------------------------------------ #
# Issue model                                                          #
# ------------------------------------------------------------------ #

class Issue(Base):
    """A defect, feature request, or work item tracked within a Project."""

    __tablename__ = "issues"

    # ------------------------------------------------------------------ #
    # Primary key                                                          #
    # ------------------------------------------------------------------ #
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # ------------------------------------------------------------------ #
    # Identification                                                       #
    # ------------------------------------------------------------------ #
    issue_key: Mapped[str] = mapped_column(
        String(30), unique=True, index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    # ------------------------------------------------------------------ #
    # Classification                                                       #
    # ------------------------------------------------------------------ #
    issue_type: Mapped[IssueType] = mapped_column(
        Enum(IssueType, name="issuetype", create_type=True),
        nullable=False,
        default=IssueType.BUG,
    )
    severity: Mapped[Severity] = mapped_column(
        Enum(Severity, name="severity", create_type=True),
        nullable=False,
        default=Severity.MAJOR,
    )
    priority: Mapped[Priority] = mapped_column(
        Enum(Priority, name="priority", create_type=True),
        nullable=False,
        default=Priority.MEDIUM,
    )
    status: Mapped[IssueStatus] = mapped_column(
        Enum(IssueStatus, name="issuestatus", create_type=True),
        nullable=False,
        default=IssueStatus.REPORTED,
    )

    # ------------------------------------------------------------------ #
    # Defect details (Phase 4)                                             #
    # ------------------------------------------------------------------ #
    environment: Mapped[str | None] = mapped_column(String(200), nullable=True)
    steps_to_reproduce: Mapped[str | None] = mapped_column(Text, nullable=True)
    expected_result: Mapped[str | None] = mapped_column(Text, nullable=True)
    actual_result: Mapped[str | None] = mapped_column(Text, nullable=True)
    estimated_effort: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # ------------------------------------------------------------------ #
    # Resolution (Phase 4)                                                 #
    # ------------------------------------------------------------------ #
    resolution_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ------------------------------------------------------------------ #
    # Foreign keys                                                         #
    # ------------------------------------------------------------------ #
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    reporter_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    assignee_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    sprint_id: Mapped[int | None] = mapped_column(
        ForeignKey("sprints.id", ondelete="SET NULL"), nullable=True
    )

    # ------------------------------------------------------------------ #
    # Timestamps                                                           #
    # ------------------------------------------------------------------ #
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # ------------------------------------------------------------------ #
    # Relationships                                                        #
    # Use explicit foreign_keys= because Issue has two FK columns to User #
    # ------------------------------------------------------------------ #
    project: Mapped["Project"] = relationship(
        "Project",
        back_populates="issues",
        foreign_keys=[project_id],
    )
    reporter: Mapped["User"] = relationship(
        "User",
        back_populates="reported_issues",
        foreign_keys=[reporter_id],
    )
    assignee: Mapped["User | None"] = relationship(
        "User",
        back_populates="assigned_issues",
        foreign_keys=[assignee_id],
    )
    sprint: Mapped["Sprint | None"] = relationship(  # type: ignore[name-defined]
        "Sprint",
        back_populates="issues",
        foreign_keys=[sprint_id],
    )
    # Phase 7 — back-references
    comments: Mapped[list["IssueComment"]] = relationship(  # type: ignore[name-defined]
        "IssueComment",
        back_populates="issue",
        foreign_keys="IssueComment.issue_id",
        cascade="all, delete-orphan",
        lazy="select",
    )
    attachments: Mapped[list["IssueAttachment"]] = relationship(  # type: ignore[name-defined]
        "IssueAttachment",
        back_populates="issue",
        foreign_keys="IssueAttachment.issue_id",
        cascade="all, delete-orphan",
        lazy="select",
    )

    __table_args__ = (
        Index("ix_issues_project_status", "project_id", "status"),
        Index("ix_issues_assignee_status", "assignee_id", "status"),
        Index("ix_issues_created_at", "created_at"),
    )

    def __repr__(self) -> str:
        return (
            f"<Issue id={self.id} key={self.issue_key!r} "
            f"status={self.status} severity={self.severity}>"
        )

