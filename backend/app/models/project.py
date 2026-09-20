"""
Project model.

A Project groups related Issues together.
"""

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class ProjectStatus(str, enum.Enum):
    """Lifecycle status of a project."""
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class Project(Base):
    """Software project that Issues belong to."""

    __tablename__ = "projects"

    # ------------------------------------------------------------------ #
    # Primary key                                                          #
    # ------------------------------------------------------------------ #
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # ------------------------------------------------------------------ #
    # Identification                                                       #
    # ------------------------------------------------------------------ #
    project_key: Mapped[str] = mapped_column(
        String(20), unique=True, index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ------------------------------------------------------------------ #
    # Status                                                               #
    # ------------------------------------------------------------------ #
    status: Mapped[ProjectStatus] = mapped_column(
        Enum(ProjectStatus, name="projectstatus", create_type=True),
        nullable=False,
        default=ProjectStatus.ACTIVE,
        server_default=ProjectStatus.ACTIVE.value,
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
    issues: Mapped[list["Issue"]] = relationship(
        "Issue",
        back_populates="project",
    )
    sprints: Mapped[list["Sprint"]] = relationship(
        "Sprint",
        back_populates="project",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Project id={self.id} key={self.project_key!r} name={self.name!r}>"
