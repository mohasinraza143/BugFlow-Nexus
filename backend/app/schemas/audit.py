"""
Pydantic schemas for the Audit Log / Activity resource — Phase 5.

Response models only — there are no create/update request models because
audit records are written exclusively by the service layer, never by API
consumers directly.

Security notes:
  - password_hash is never included.
  - JWT tokens are never included.
  - OTP values are never included.
  - SMTP or database credentials are never included.
"""

from datetime import datetime

from pydantic import BaseModel

from app.models.audit_log import AuditAction


# --------------------------------------------------------------------------- #
# Embedded sub-schemas                                                         #
# --------------------------------------------------------------------------- #

class AuditActorBrief(BaseModel):
    """Minimal user information embedded in audit log responses.

    Intentionally excludes password_hash, JWT, OTP, and all secrets.
    """

    id: int
    full_name: str
    email: str
    role: str

    model_config = {"from_attributes": True}


# --------------------------------------------------------------------------- #
# Response schemas                                                             #
# --------------------------------------------------------------------------- #

class AuditLogResponse(BaseModel):
    """Complete representation of a single audit record.

    old_values and new_values contain only the changed fields (diff).
    They will be None when not applicable (e.g. AUTH_LOGIN).
    """

    id: int
    user_id: int | None
    actor: AuditActorBrief | None
    action: AuditAction
    entity_type: str
    entity_id: int | None
    entity_key: str | None
    description: str
    old_values: dict | None
    new_values: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogListResponse(BaseModel):
    """Paginated list of audit records, newest first."""

    items: list[AuditLogResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
