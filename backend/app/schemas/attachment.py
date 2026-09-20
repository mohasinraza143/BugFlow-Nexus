"""
Pydantic schemas for Issue Attachments — Phase 7.

Security rules:
  - storage_path, stored_filename, and absolute filesystem paths are NEVER
    included in any response schema.
  - uploaded_by (user id) is always set from the JWT — never from request body.
  - password_hash, JWT tokens, OTP codes are never included.
  - All response models use model_config = {"from_attributes": True}.
"""

from datetime import datetime

from pydantic import BaseModel

from app.models.user import UserRole


# --------------------------------------------------------------------------- #
# Embedded uploader sub-schema                                                 #
# --------------------------------------------------------------------------- #

class AttachmentUploaderBrief(BaseModel):
    """Minimal uploader info embedded in attachment responses. NO sensitive data."""

    id: int
    full_name: str
    role: UserRole

    model_config = {"from_attributes": True}


# --------------------------------------------------------------------------- #
# Response schemas                                                             #
# --------------------------------------------------------------------------- #

class AttachmentResponse(BaseModel):
    """Public metadata for a single attachment.

    Intentionally omits:
      - storage_path (internal filesystem location)
      - stored_filename (internal secure name)
      - Any absolute filesystem paths
      - password_hash or other user secrets
    """

    id: int
    issue_id: int
    uploader: AttachmentUploaderBrief
    original_filename: str
    mime_type: str
    file_size: int
    created_at: datetime

    model_config = {"from_attributes": True}



class AttachmentListResponse(BaseModel):
    """Paginated list of attachments."""

    items: list[AttachmentResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
