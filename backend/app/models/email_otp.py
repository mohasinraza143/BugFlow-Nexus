"""
EmailOTP model.

Stores hashed one-time passwords for email verification.

Security notes:
  - The raw OTP is NEVER stored; only a bcrypt hash is persisted.
  - Each record has a hard expiry (expires_at).
  - Attempt counting prevents brute-force.
  - is_used prevents replay attacks.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class EmailOTP(Base):
    """Hashed one-time password record for email verification."""

    __tablename__ = "email_otps"

    # ------------------------------------------------------------------ #
    # Primary key                                                          #
    # ------------------------------------------------------------------ #
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # ------------------------------------------------------------------ #
    # Target email                                                         #
    # ------------------------------------------------------------------ #
    email: Mapped[str] = mapped_column(
        String(255), index=True, nullable=False
    )

    # ------------------------------------------------------------------ #
    # OTP security fields                                                  #
    # NEVER store the raw OTP — only the hash is kept here.               #
    # ------------------------------------------------------------------ #
    otp_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # ------------------------------------------------------------------ #
    # Timestamps                                                           #
    # ------------------------------------------------------------------ #
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return (
            f"<EmailOTP id={self.id} email={self.email!r} "
            f"is_used={self.is_used} expires_at={self.expires_at}>"
        )
