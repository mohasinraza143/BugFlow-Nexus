"""
Pydantic schemas for authentication endpoints.

All response models deliberately exclude password_hash, otp, and otp_hash.
"""

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.user import UserRole


# --------------------------------------------------------------------------- #
# Request schemas                                                              #
# --------------------------------------------------------------------------- #

class RegisterRequest(BaseModel):
    """Body for POST /auth/register."""

    full_name: str = Field(
        ..., min_length=1, max_length=200, examples=["Jane Reporter"]
    )
    email: EmailStr = Field(..., examples=["jane@example.com"])
    password: str = Field(..., min_length=8, examples=["StrongPass123"])
    role: UserRole = Field(default=UserRole.USER, examples=["USER"])


class RequestOTPRequest(BaseModel):
    """Body for POST /auth/request-otp."""

    email: EmailStr = Field(..., examples=["jane@example.com"])


class VerifyOTPRequest(BaseModel):
    """Body for POST /auth/verify-otp."""

    email: EmailStr = Field(..., examples=["jane@example.com"])
    otp: str = Field(
        ...,
        min_length=6,
        max_length=6,
        pattern=r"^\d{6}$",
        examples=["483921"],
    )


class ResendOTPRequest(BaseModel):
    """Body for POST /auth/resend-otp."""

    email: EmailStr = Field(..., examples=["jane@example.com"])


class LoginRequest(BaseModel):
    """Body for POST /auth/login."""

    email: EmailStr = Field(..., examples=["jane@example.com"])
    password: str = Field(..., min_length=1, examples=["StrongPass123"])


class ProfileUpdateRequest(BaseModel):
    """Body for PATCH /auth/profile."""

    full_name: str = Field(
        ..., min_length=1, max_length=200, examples=["Jane Reporter"]
    )


class ChangePasswordRequest(BaseModel):
    """Body for POST /auth/change-password."""

    current_password: str = Field(..., min_length=1, examples=["CurrentPass123"])
    new_password: str = Field(..., min_length=8, max_length=128, examples=["NewStrongPass123"])


# --------------------------------------------------------------------------- #
# Response schemas                                                             #
# --------------------------------------------------------------------------- #

class UserResponse(BaseModel):
    """Safe public user representation — never includes password or OTP fields."""

    id: int
    full_name: str
    email: str
    role: UserRole
    is_active: bool
    is_email_verified: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    """Response for POST /auth/login and POST /auth/verify-otp."""

    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    message: str | None = None


class MessageResponse(BaseModel):
    """Generic success message response."""

    message: str


class LogoutResponse(BaseModel):
    """Response for POST /auth/logout."""

    message: str = "Logged out successfully."
