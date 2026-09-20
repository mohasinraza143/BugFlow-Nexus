"""
IssueAttachment model — Phase 7.

Stores metadata for file attachments uploaded to issues.
Binary files are NOT stored in PostgreSQL; they live on the filesystem
under the configured ATTACHMENT_STORAGE_PATH.

Security design:
  - `original_filename` is only a display label — never used for storage.
  - `stored_filename` is a server-generated UUID-based name.
  - `storage_path` is a relative internal path; never exposed via API.
  - `uploaded_by` is always taken from the authenticated JWT — never
    accepted from the request body.
  - `mime_type` stored here is the server-validated MIME type,
    not the raw client-supplied Content-Type.
  - ON DELETE CASCADE on issue_id removes metadata when the issue is deleted.
    (The physical files must be cleaned up separately.)
  - ON DELETE RESTRICT on uploaded_by prevents deleting users with attachments.
"""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class IssueAttachment(Base):
    """File attachment metadata for an Issue."""

    __tablename__ = "issue_attachments"

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
    # Uploader (always set from JWT — never from request body)            #
    # ------------------------------------------------------------------ #
    uploaded_by: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # ------------------------------------------------------------------ #
    # Filename metadata                                                    #
    # ------------------------------------------------------------------ #
    original_filename: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
        comment="Display name only — never used for storage.",
    )
    stored_filename: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
        unique=True,
        comment="Server-generated UUID-based filename used on disk.",
    )
    storage_path: Mapped[str] = mapped_column(
        String(1000),
        nullable=False,
        comment="Relative internal path — never exposed in API responses.",
    )

    # ------------------------------------------------------------------ #
    # File properties                                                      #
    # ------------------------------------------------------------------ #
    mime_type: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        comment="Server-validated MIME type, not raw client Content-Type.",
    )
    file_size: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        comment="File size in bytes.",
    )

    # ------------------------------------------------------------------ #
    # Timestamp                                                            #
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
    issue: Mapped["Issue"] = relationship(  # type: ignore[name-defined]
        "Issue",
        back_populates="attachments",
        foreign_keys=[issue_id],
        lazy="select",
    )
    uploader: Mapped["User"] = relationship(  # type: ignore[name-defined]
        "User",
        foreign_keys=[uploaded_by],
        lazy="select",
    )

    def __repr__(self) -> str:
        return (
            f"<IssueAttachment id={self.id} issue_id={self.issue_id} "
            f"filename={self.original_filename!r}>"
        )
