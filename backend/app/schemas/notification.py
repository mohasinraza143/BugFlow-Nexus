"""
Notification schemas — Phase 8.

All response schemas intentionally omit:
  - password_hash
  - JWT tokens
  - OTP codes
  - SMTP credentials
  - internal filesystem paths

NotificationResponse is the primary public contract.
"""

from datetime import datetime

from pydantic import BaseModel, field_validator

from app.models.notification import NotificationType


# --------------------------------------------------------------------------- #
# Notification response                                                         #
# --------------------------------------------------------------------------- #

class NotificationResponse(BaseModel):
    """Public representation of a single notification.

    Never exposes sensitive user data or internal system details.
    """

    id: int
    notification_type: NotificationType
    title: str
    message: str
    entity_type: str | None
    entity_id: int | None
    entity_key: str | None
    is_read: bool
    read_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationListResponse(BaseModel):
    """Paginated list of notifications."""

    items: list[NotificationResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class NotificationUnreadCountResponse(BaseModel):
    """Lightweight unread count response."""

    unread_count: int


# --------------------------------------------------------------------------- #
# Notification preferences                                                      #
# --------------------------------------------------------------------------- #

class NotificationPreferenceResponse(BaseModel):
    """Current notification preferences for a user."""

    email_enabled: bool
    issue_assigned: bool
    issue_status_changed: bool
    issue_resolved: bool
    issue_reopened: bool
    issue_commented: bool
    attachment_added: bool
    updated_at: datetime

    model_config = {"from_attributes": True}


class NotificationPreferenceUpdate(BaseModel):
    """Partial update for notification preferences.

    All fields are optional — only provided fields are updated.
    """

    email_enabled: bool | None = None
    issue_assigned: bool | None = None
    issue_status_changed: bool | None = None
    issue_resolved: bool | None = None
    issue_reopened: bool | None = None
    issue_commented: bool | None = None
    attachment_added: bool | None = None
