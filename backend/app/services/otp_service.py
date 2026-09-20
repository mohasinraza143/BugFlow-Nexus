"""
OTP service.

Responsible for generating, hashing, storing, and verifying
one-time passwords used for email verification.

Security principles:
  - OTPs are generated with `secrets` (cryptographically secure).
  - Only the bcrypt hash of the OTP is stored in the database.
  - The raw OTP is NEVER logged or persisted.
  - Attempt counting prevents brute-force attacks.
  - Expired and used OTPs are rejected.
"""

import secrets
from datetime import UTC, datetime, timedelta

import bcrypt
from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.email_otp import EmailOTP


def generate_otp() -> str:
    """Return a cryptographically secure 6-digit OTP string.

    Uses `secrets.randbelow` to avoid modulo bias.
    The result is zero-padded to always be exactly 6 digits.
    """
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(otp: str) -> str:
    """Return a bcrypt hash of *otp*.

    The raw OTP is never stored — only this hash is persisted.
    """
    return bcrypt.hashpw(otp.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_otp_hash(otp: str, otp_hash: str) -> bool:
    """Return True if *otp* matches *otp_hash*."""
    try:
        return bcrypt.checkpw(otp.encode("utf-8"), otp_hash.encode("utf-8"))
    except Exception:
        return False


async def invalidate_previous_otps(email: str, db: AsyncSession) -> None:
    """Mark all existing OTP records for *email* as used.

    Called before issuing a new OTP to prevent replay of old codes.
    """
    await db.execute(
        update(EmailOTP)
        .where(EmailOTP.email == email, EmailOTP.is_used.is_(False))
        .values(is_used=True)
    )


async def create_otp_record(email: str, db: AsyncSession) -> str:
    """Generate a new OTP, persist its hash, and return the raw OTP.

    Steps:
      1. Invalidate all previous OTPs for *email*.
      2. Generate a 6-digit OTP with `secrets`.
      3. Hash the OTP with bcrypt.
      4. Store the hash + expiry in `email_otps`.
      5. Return the raw OTP (caller sends it by email; it is never stored).

    Returns:
      The raw 6-digit OTP string (single use — hand to email service only).
    """
    await invalidate_previous_otps(email, db)

    raw_otp = generate_otp()
    otp_hash = hash_otp(raw_otp)
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

    record = EmailOTP(
        email=email,
        otp_hash=otp_hash,
        expires_at=expires_at,
        attempts=0,
        is_used=False,
    )
    db.add(record)
    await db.flush()  # write to DB within current transaction

    return raw_otp  # caller sends this via email; do NOT log it


async def verify_otp_for_email(email: str, otp: str, db: AsyncSession) -> None:
    """Verify *otp* for *email* and mark the record as used on success.

    Attempt counting uses a nested SAVEPOINT so increments survive even when
    the outer request transaction is rolled back on validation failure.

    Raises:
      HTTP 400 — no valid OTP found.
      HTTP 400 — OTP expired.
      HTTP 400 — OTP already used.
      HTTP 429 — maximum attempts exceeded.
      HTTP 400 — OTP does not match.
    """
    # Fetch the latest unused OTP for this email
    result = await db.execute(
        select(EmailOTP)
        .where(
            EmailOTP.email == email,
            EmailOTP.is_used.is_(False),
        )
        .order_by(EmailOTP.created_at.desc())
        .limit(1)
    )
    record: EmailOTP | None = result.scalar_one_or_none()

    if record is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No pending verification found. Please request a new OTP.",
        )

    now = datetime.now(UTC)

    # Expiry check
    expires_at = record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    else:
        expires_at = expires_at.astimezone(UTC)

    if now > expires_at:
        record.is_used = True
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP has expired. Please request a new one.",
        )

    # Already-used check
    if record.is_used:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP has already been used.",
        )

    record_id = record.id
    current_attempts = record.attempts

    await db.execute(
        update(EmailOTP)
        .where(EmailOTP.id == record_id)
        .values(attempts=current_attempts + 1)
    )
    await db.commit()
    await db.refresh(record)

    if record.attempts > settings.OTP_MAX_ATTEMPTS:
        await db.execute(
            update(EmailOTP)
            .where(EmailOTP.id == record_id)
            .values(is_used=True)
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts. Please request a new OTP.",
        )

    # Hash verification
    if not verify_otp_hash(otp, record.otp_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OTP.",
        )

    # Success — mark as used
    record.is_used = True


async def check_resend_cooldown(email: str, db: AsyncSession) -> None:
    """Raise HTTP 429 if a new OTP was issued within the cooldown window."""
    result = await db.execute(
        select(EmailOTP)
        .where(EmailOTP.email == email)
        .order_by(EmailOTP.created_at.desc())
        .limit(1)
    )
    last: EmailOTP | None = result.scalar_one_or_none()
    if last is None or last.created_at is None:
        return

    now = datetime.now(UTC)
    created_at = last.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=UTC)
    else:
        created_at = created_at.astimezone(UTC)

    elapsed = (now - created_at).total_seconds()
    # Guard against clock skew or timezone mismatch (must be positive and within cooldown)
    if 0 <= elapsed < settings.OTP_RESEND_COOLDOWN_SECONDS:
        remaining = max(1, int(settings.OTP_RESEND_COOLDOWN_SECONDS - elapsed))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Please wait {remaining} seconds before requesting a new OTP.",
        )
