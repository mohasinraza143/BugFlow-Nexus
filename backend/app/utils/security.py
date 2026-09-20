"""
Security utilities: password hashing and JWT operations.

Password hashing:
  - Uses bcrypt via the `bcrypt` library directly.
  - Raw passwords are never logged, returned, or stored.

JWT:
  - Uses PyJWT (not python-jose).
  - Tokens carry: sub (user_id), role, iat, exp.
  - Invalid or expired tokens raise HTTPException 401.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt
from fastapi import HTTPException, status

from app.core.config import settings

# --------------------------------------------------------------------------- #
# Password hashing (bcrypt)                                                   #
# --------------------------------------------------------------------------- #

def hash_password(password: str) -> str:
    """Return a bcrypt hash of *password*.

    The hash includes a random salt automatically.
    Raises ValueError if the password is fewer than 8 characters.
    """
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long.")
    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Return True if *plain_password* matches *hashed_password*.

    Uses a constant-time comparison to prevent timing attacks.
    Never raises — returns False on any error.
    """
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except Exception:
        return False


# --------------------------------------------------------------------------- #
# JWT                                                                         #
# --------------------------------------------------------------------------- #

def create_access_token(user_id: int, role: str) -> str:
    """Create a signed JWT access token.

    Payload:
      sub   — str(user_id)
      role  — user role string (e.g. "DEVELOPER")
      iat   — issued-at (UTC)
      exp   — expiry (UTC, ACCESS_TOKEN_EXPIRE_MINUTES from now)
    """
    now = datetime.now(UTC)
    expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "role": role,
        "iat": now,
        "exp": expire,
    }
    return jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT access token.

    Returns the payload dict on success.
    Raises HTTP 401 on invalid signature, expiry, or malformed token.
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
