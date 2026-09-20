"""
Pydantic schemas for Issue Comments — Phase 7.

Security rules (enforced at schema + service layer):
  - author_id is NEVER accepted from request body.
  - password_hash, JWT tokens, OTP codes are never included in any response.
  - All response models use model_config = {"from_attributes": True}.
"""

import math
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.user import UserRole


# --------------------------------------------------------------------------- #
# Embedded author sub-schema                                                   #
# --------------------------------------------------------------------------- #

class CommentAuthorBrief(BaseModel):
    """Minimal user info embedded in comment responses. NO sensitive fields."""

    id: int
    full_name: str
    role: UserRole

    model_config = {"from_attributes": True}


# --------------------------------------------------------------------------- #
# Request schemas                                                              #
# --------------------------------------------------------------------------- #

class CommentCreate(BaseModel):
    """Payload to post a new comment on an issue."""

    body: str = Field(
        ...,
        min_length=1,
        max_length=10_000,
        description="Comment text. Whitespace-only content is rejected.",
    )

    @field_validator("body", mode="before")
    @classmethod
    def strip_and_reject_whitespace_only(cls, v: str) -> str:
        if not isinstance(v, str):
            return v
        stripped = v.strip()
        if not stripped:
            raise ValueError("Comment body must contain non-whitespace content.")
        return stripped


class CommentUpdate(BaseModel):
    """Payload to update the body of an existing comment."""

    body: str = Field(
        ...,
        min_length=1,
        max_length=10_000,
        description="Updated comment text. Whitespace-only content is rejected.",
    )

    @field_validator("body", mode="before")
    @classmethod
    def strip_and_reject_whitespace_only(cls, v: str) -> str:
        if not isinstance(v, str):
            return v
        stripped = v.strip()
        if not stripped:
            raise ValueError("Comment body must contain non-whitespace content.")
        return stripped


# --------------------------------------------------------------------------- #
# Response schemas                                                             #
# --------------------------------------------------------------------------- #

class CommentResponse(BaseModel):
    """Full representation of a single comment."""

    id: int
    issue_id: int
    author: CommentAuthorBrief
    body: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CommentListResponse(BaseModel):
    """Paginated list of comments."""

    items: list[CommentResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
