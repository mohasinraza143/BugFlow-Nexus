"""
IssueComment model — Phase 7.

Stores discussion comments on defect issues.
Each comment is authored by a verified user and belongs to exactly one issue.

Security notes:
  - `author_id` is NEVER accepted from request body; it is always set from
    the authenticated JWT user in the service layer.
  - Raw password, JWT tokens, and OTP codes are never stored here.
  - ON DELETE CASCADE on issue_id ensures comments are removed when the
    parent issue is deleted.
  - ON DELETE RESTRICT on author_id prevents deleting a user who has comments;
    the admin must reassign or delete comments first.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class IssueComment(Base):
    """A discussion comment attached to an Issue."""

    __tablename__ = "issue_comments"

    # ------------------------------------------------------------------ #
    # Primary key                                                          #
    # ------------------------------------------------------------------ #
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # ------------------------------------------------------------------ #
    # Parent issue                                                         #
    # ------------------------------------------------------------------ #
    issue_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("issues.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ------------------------------------------------------------------ #
    # Author (never accept from request body — always set from JWT)        #
    # ------------------------------------------------------------------ #
    author_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # ------------------------------------------------------------------ #
    # Comment content                                                      #
    # ------------------------------------------------------------------ #
    body: Mapped[str] = mapped_column(Text, nullable=False)

    # ------------------------------------------------------------------ #
    # Timestamps                                                           #
    # ------------------------------------------------------------------ #
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
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
    issue: Mapped["Issue"] = relationship(  # type: ignore[name-defined]
        "Issue",
        back_populates="comments",
        foreign_keys=[issue_id],
        lazy="select",
    )
    author: Mapped["User"] = relationship(  # type: ignore[name-defined]
        "User",
        foreign_keys=[author_id],
        lazy="select",
    )

    def __repr__(self) -> str:
        return (
            f"<IssueComment id={self.id} issue_id={self.issue_id} "
            f"author_id={self.author_id}>"
        )
