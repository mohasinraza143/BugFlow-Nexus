"""
Pydantic schemas for user management — Phase 6.

Provides ADMIN-only request/response models for the /users routes.

Security rules (enforced at schema layer):
  - password_hash is NEVER included in any response.
  - OTP, JWT tokens, SMTP credentials are never included.
  - All response models use model_config = {"from_attributes": True}.
"""

import enum
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.user import UserRole


# --------------------------------------------------------------------------- #
# Sorting                                                                      #
# --------------------------------------------------------------------------- #

class UserSortField(str, enum.Enum):
    created_at = "created_at"
    updated_at = "updated_at"
    full_name  = "full_name"
    email      = "email"
    role       = "role"


# --------------------------------------------------------------------------- #
# Response schemas                                                             #
# --------------------------------------------------------------------------- #

class UserDetailResponse(BaseModel):
    """Full, safe user representation for ADMIN management APIs.

    Deliberately excludes: password_hash, OTP codes, JWT tokens.
    """

    id: int
    full_name: str
    email: str
    role: UserRole
    is_active: bool
    is_email_verified: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserListResponse(BaseModel):
    """Paginated list of users."""

    items: list[UserDetailResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# --------------------------------------------------------------------------- #
# Request schemas                                                              #
# --------------------------------------------------------------------------- #

class UserUpdateRequest(BaseModel):
    """Body for PATCH /users/{user_id}.

    All fields optional — send only what should change.
    id, password_hash, is_email_verified, created_at, updated_at
    are NOT updatable through this endpoint.
    """

    full_name: str | None = Field(
        None,
        min_length=1,
        max_length=200,
        examples=["Jane Developer"],
    )
    email: EmailStr | None = Field(
        None,
        examples=["jane@example.com"],
    )


class UserRoleUpdateRequest(BaseModel):
    """Body for PATCH /users/{user_id}/role."""

    role: UserRole = Field(..., examples=["DEVELOPER"])
