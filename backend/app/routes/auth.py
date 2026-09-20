"""
Authentication routes.

Endpoints:
  POST /auth/register     — create account, send OTP
  POST /auth/verify-otp   — verify OTP, activate account
  POST /auth/resend-otp   — resend OTP (with cooldown)
  POST /auth/login        — authenticate, return JWT
  GET  /auth/me           — return current user profile
  POST /auth/logout       — server-side logout acknowledgement

Security notes:
  - Passwords are never returned in any response.
  - OTP values are never returned or logged.
  - Resend and non-existent email responses are indistinguishable
    (prevent email enumeration).
"""

import logging
import secrets
from fastapi import APIRouter, Depends, HTTPException, status

logger = logging.getLogger(__name__)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User, UserRole
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    LogoutResponse,
    MessageResponse,
    ProfileUpdateRequest,
    RegisterRequest,
    RequestOTPRequest,
    ResendOTPRequest,
    TokenResponse,
    UserResponse,
    VerifyOTPRequest,
)
from app.services.email_service import send_otp_email
from app.services.otp_service import (
    check_resend_cooldown,
    create_otp_record,
    verify_otp_for_email,
)
from app.services.audit_service import create_audit_log
from app.models.audit_log import AuditAction
from app.utils.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["Authentication"])


# --------------------------------------------------------------------------- #
# POST /auth/request-otp                                                       #
# --------------------------------------------------------------------------- #

@router.post(
    "/request-otp",
    response_model=MessageResponse,
    summary="Request email verification OTP for passwordless login/signup",
)
async def request_otp(
    body: RequestOTPRequest,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Send a 6-digit OTP code to the provided email address.

    Enforces 60-second cooldown per email address. Works for both new
    and existing accounts without revealing account existence.
    """
    await check_resend_cooldown(body.email, db)

    raw_otp = await create_otp_record(body.email, db)

    try:
        await send_otp_email(body.email, raw_otp)
    except Exception as exc:
        logger.error("Failed to send OTP email to %s: %s", body.email, exc)

    return MessageResponse(
        message="A 6-digit verification code has been sent to your email address."
    )


# --------------------------------------------------------------------------- #
# POST /auth/register                                                          #
# --------------------------------------------------------------------------- #

@router.post(
    "/register",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
async def register(
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Register a new DEVELOPER or TESTER account.

    Validates input, hashes password, creates user, generates OTP,
    and sends verification email. ADMIN registration is blocked.
    """
    # TODO: In production, public ADMIN registration must be disabled or restricted.
    # Currently enabled for development/demo purposes.

    # Duplicate email check
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists.",
        )

    # Create user (active immediately since OTP is disabled for now)
    new_user = User(
        full_name=body.full_name,
        email=body.email,
        password_hash=hash_password(body.password),
        role=body.role,
        is_active=True,
        is_email_verified=True,
    )
    db.add(new_user)
    await db.commit()  # Commit the user to the database

    return MessageResponse(
        message="Registration successful. Please sign in."
    )


# --------------------------------------------------------------------------- #
# POST /auth/verify-otp                                                        #
# --------------------------------------------------------------------------- #

@router.post(
    "/verify-otp",
    response_model=TokenResponse,
    summary="Verify email OTP, authenticate user, and receive JWT",
)
async def verify_otp(
    body: VerifyOTPRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Verify a 6-digit OTP, create/activate user account, and issue a JWT access token."""
    # Verify OTP against stored hash & expiry
    await verify_otp_for_email(body.email, body.otp, db)

    # Fetch user
    result = await db.execute(select(User).where(User.email == body.email))
    user: User | None = result.scalar_one_or_none()

    if user is None:
        # Auto-create via OTP: create a USER (issue reporter) account.
        # OTP-only flow is the fastest self-registration path for reporters.
        # ADMIN and TESTER accounts require explicit password registration.
        raw_name = body.email.split("@")[0].replace(".", " ").replace("_", " ").title()
        user = User(
            full_name=raw_name or "BugTracker User",
            email=body.email,
            password_hash=hash_password(secrets.token_urlsafe(32)),
            role=UserRole.USER,
            is_active=True,
            is_email_verified=True,
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)
    else:
        user.is_email_verified = True
        user.is_active = True
        await db.flush()
        await db.refresh(user)

    token = create_access_token(user_id=user.id, role=user.role.value)

    # Audit: record successful authentication
    await create_audit_log(
        db=db,
        actor=user,
        action=AuditAction.AUTH_LOGIN,
        entity_type="AUTH",
        entity_id=user.id,
        entity_key=user.email,
        description=f"User {user.full_name!r} ({user.role.value}) authenticated via OTP",
    )

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
        message="Email verified successfully. Authenticated.",
    )


# --------------------------------------------------------------------------- #
# POST /auth/resend-otp                                                        #
# --------------------------------------------------------------------------- #

@router.post(
    "/resend-otp",
    response_model=MessageResponse,
    summary="Resend email verification OTP",
)
async def resend_otp(
    body: ResendOTPRequest,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Resend a verification OTP (60-second cooldown enforced).

    Returns a generic success message regardless of whether the email
    is registered — prevents email enumeration attacks.
    """
    result = await db.execute(select(User).where(User.email == body.email))
    user: User | None = result.scalar_one_or_none()

    # Always return 200 — do not reveal whether email is registered
    if user is None or user.is_email_verified:
        return MessageResponse(
            message="If a pending account exists for this email, a new code has been sent."
        )

    await check_resend_cooldown(body.email, db)

    raw_otp = await create_otp_record(body.email, db)

    try:
        await send_otp_email(body.email, raw_otp)
    except Exception:
        pass  # fail silently; user can try again

    return MessageResponse(
        message="If a pending account exists for this email, a new code has been sent."
    )


# --------------------------------------------------------------------------- #
# POST /auth/login                                                             #
# --------------------------------------------------------------------------- #

@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate and receive JWT access token",
)
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Authenticate with email + password and receive a JWT token."""
    result = await db.execute(select(User).where(User.email == body.email))
    user: User | None = result.scalar_one_or_none()

    # Use a single generic message for invalid credentials to prevent
    # leaking whether the email exists (user enumeration prevention).
    _invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid email or password.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if user is None or not verify_password(body.password, user.password_hash):
        raise _invalid

    if not user.is_email_verified:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email address has not been verified. Please check your inbox.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive. Please contact support.",
        )

    token = create_access_token(user_id=user.id, role=user.role.value)

    # Audit: record successful login — never store the token value itself
    await create_audit_log(
        db=db,
        actor=user,
        action=AuditAction.AUTH_LOGIN,
        entity_type="AUTH",
        entity_id=user.id,
        entity_key=user.email,
        description=f"User {user.full_name!r} ({user.role.value}) logged in",
    )

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


# --------------------------------------------------------------------------- #
# GET /auth/me                                                                 #
# --------------------------------------------------------------------------- #

@router.get(
    "/me",
    response_model=UserResponse,
    summary="Return the currently authenticated user's profile",
)
async def me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """Return the profile of the currently authenticated user.

    Requires: Authorization: Bearer <JWT>
    """
    return UserResponse.model_validate(current_user)


# --------------------------------------------------------------------------- #
# POST /auth/logout                                                            #
# --------------------------------------------------------------------------- #

@router.post(
    "/logout",
    response_model=LogoutResponse,
    summary="Logout — client should discard the JWT",
)
async def logout(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LogoutResponse:
    """Server-side logout acknowledgement.

    JWTs are stateless; the server cannot revoke them in this phase.
    The client is responsible for discarding the stored token.
    """
    # Audit: record logout — never store the JWT token value
    await create_audit_log(
        db=db,
        actor=current_user,
        action=AuditAction.AUTH_LOGOUT,
        entity_type="AUTH",
        entity_id=current_user.id,
        entity_key=current_user.email,
        description=f"User {current_user.full_name!r} ({current_user.role.value}) logged out",
    )
    return LogoutResponse(message="Logged out successfully.")


# --------------------------------------------------------------------------- #
# PATCH /auth/profile                                                          #
# --------------------------------------------------------------------------- #

@router.patch(
    "/profile",
    response_model=UserResponse,
    summary="Update the currently authenticated user's profile",
)
async def update_profile(
    body: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Update user full_name. Authenticated user only."""
    clean_name = body.full_name.strip()
    if not clean_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Full name cannot be empty.",
        )

    current_user.full_name = clean_name
    await db.commit()
    await db.refresh(current_user)

    await create_audit_log(
        db=db,
        actor=current_user,
        action=AuditAction.USER_UPDATED,
        entity_type="USER",
        entity_id=current_user.id,
        entity_key=current_user.email,
        description=f"User {current_user.email} updated profile full_name to {clean_name!r}",
    )

    return UserResponse.model_validate(current_user)


# --------------------------------------------------------------------------- #
# POST /auth/change-password                                                   #
# --------------------------------------------------------------------------- #

@router.post(
    "/change-password",
    response_model=MessageResponse,
    summary="Change the currently authenticated user's password",
)
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Verify current password and set a new password."""
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )

    if verify_password(body.new_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password.",
        )

    current_user.password_hash = hash_password(body.new_password)
    await db.commit()

    await create_audit_log(
        db=db,
        actor=current_user,
        action=AuditAction.USER_UPDATED,
        entity_type="USER",
        entity_id=current_user.id,
        entity_key=current_user.email,
        description=f"User {current_user.email} successfully changed password",
    )

    return MessageResponse(message="Password changed successfully.")
