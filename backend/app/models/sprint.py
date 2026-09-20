"""
Sprint model.

A Sprint belongs to a Project and groups a set of issues for a specific time period.
"""

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class SprintStatus(str, enum.Enum):
    PLANNED             = "PLANNED"
    ACTIVE              = "ACTIVE"
    IN_PROGRESS         = "IN_PROGRESS"          # Tester actively working (post-assign)
    READY_FOR_APPROVAL  = "READY_FOR_APPROVAL"   # Tester submitted, awaiting admin review
    COMPLETED           = "COMPLETED"
    ARCHIVED            = "ARCHIVED"


class Sprint(Base):
    """A sprint tracking work items within a Project."""

    __tablename__ = "sprints"

    # ------------------------------------------------------------------ #
    # Primary key                                                          #
    # ------------------------------------------------------------------ #
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # ------------------------------------------------------------------ #
    # Identification                                                       #
    # ------------------------------------------------------------------ #
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    goal: Mapped[str | None] = mapped_column(Text, nullable=True)
    goal_status: Mapped[str] = mapped_column(String(50), nullable=False, default="NOT_STARTED")

    # ------------------------------------------------------------------ #
    # Schedule & Status                                                    #
    # ------------------------------------------------------------------ #
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[SprintStatus] = mapped_column(
        Enum(SprintStatus, name="sprintstatus", create_type=True),
        nullable=False,
        default=SprintStatus.PLANNED,
    )
    actual_start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ------------------------------------------------------------------ #
    # Capacity Planning                                                    #
    # ------------------------------------------------------------------ #
    estimated_team_members: Mapped[int | None] = mapped_column(nullable=True)
    working_days: Mapped[int | None] = mapped_column(nullable=True)
    hours_per_day: Mapped[int | None] = mapped_column(nullable=True)

    # ------------------------------------------------------------------ #
    # Approval workflow                                                    #
    # ------------------------------------------------------------------ #
    assigned_tester_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    submitted_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ------------------------------------------------------------------ #
    # Foreign keys                                                         #
    # ------------------------------------------------------------------ #
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
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
    # ------------------------------------------------------------------ #
    project: Mapped["Project"] = relationship(  # type: ignore[name-defined]
        "Project",
        back_populates="sprints",
        foreign_keys=[project_id],
    )
    issues: Mapped[list["Issue"]] = relationship(  # type: ignore[name-defined]
        "Issue",
        back_populates="sprint",
        cascade="all, save-update",
        lazy="select",
    )
    assigned_tester: Mapped["User | None"] = relationship(  # type: ignore[name-defined]
        "User",
        foreign_keys=[assigned_tester_id],
        lazy="selectin",
    )
    submitted_by: Mapped["User | None"] = relationship(  # type: ignore[name-defined]
        "User",
        foreign_keys=[submitted_by_id],
        lazy="selectin",
    )
    approved_by: Mapped["User | None"] = relationship(  # type: ignore[name-defined]
        "User",
        foreign_keys=[approved_by_id],
        lazy="selectin",
    )

    @property
    def assigned_tester_name(self) -> str | None:
        tester = self.__dict__.get("assigned_tester")
        if tester and hasattr(tester, "full_name"):
            return tester.full_name
        return None

    def __repr__(self) -> str:
        return f"<Sprint id={self.id} name={self.name!r} status={self.status}>"
