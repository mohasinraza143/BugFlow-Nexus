"""
Notification routes — Phase 8.

Prefix: /notifications
Auth:   All endpoints require a valid JWT (get_current_user).

Notifications are private to their owner. Even ADMIN cannot access another
user's notifications.

Route ordering matters:
  /unread-count, /preferences, /read-all must be declared BEFORE /{id}
  to prevent FastAPI matching literal strings as integer path parameters.

Endpoints:
  GET    /notifications                   list (paginated, filterable)
  GET    /notifications/unread-count      unread count
  GET    /notifications/preferences       get preferences
  PATCH  /notifications/preferences       update preferences
  PATCH  /notifications/read-all          mark all as read
  GET    /notifications/{id}              single notification (owner only)
  PATCH  /notifications/{id}/read         mark one as read
  DELETE /notifications/{id}             delete (owner only)
"""

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.dependencies.auth import get_current_user
from app.models.notification import NotificationType
from app.models.user import User
from app.schemas.notification import (
    NotificationListResponse,
    NotificationPreferenceResponse,
    NotificationPreferenceUpdate,
    NotificationResponse,
    NotificationUnreadCountResponse,
)
from app.services import notification_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["Notifications"])


# --------------------------------------------------------------------------- #
# GET /notifications                                                            #
# --------------------------------------------------------------------------- #

@router.get(
    "",
    response_model=NotificationListResponse,
    summary="List notifications",
    responses={
        401: {"description": "Not authenticated"},
    },
)
async def list_notifications(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(20, ge=1, le=100, description="Records per page"),
    unread_only: bool = Query(False, description="Return only unread notifications"),
    notification_type: NotificationType | None = Query(None, description="Filter by type"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationListResponse:
    """Return paginated notifications for the authenticated user.

    Supports filtering by read status and notification type.
    Results are ordered newest-first.
    """
    return await notification_service.list_notifications(
        db=db,
        current_user=current_user,
        page=page,
        page_size=page_size,
        unread_only=unread_only,
        notification_type=notification_type,
    )


# --------------------------------------------------------------------------- #
# GET /notifications/unread-count  (must be before /{id})                     #
# --------------------------------------------------------------------------- #

@router.get(
    "/unread-count",
    response_model=NotificationUnreadCountResponse,
    summary="Get unread notification count",
    responses={401: {"description": "Not authenticated"}},
)
async def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationUnreadCountResponse:
    """Return the number of unread notifications for the current user.

    Uses a single SELECT COUNT(*) — never loads all records into Python.
    """
    return await notification_service.get_unread_count(db=db, current_user=current_user)


# --------------------------------------------------------------------------- #
# GET /notifications/preferences  (must be before /{id})                      #
# --------------------------------------------------------------------------- #

@router.get(
    "/preferences",
    response_model=NotificationPreferenceResponse,
    summary="Get notification preferences",
    responses={401: {"description": "Not authenticated"}},
)
async def get_preferences(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationPreferenceResponse:
    """Return the current user's notification preferences.

    If no preference record exists yet, one is created with all defaults (all enabled).
    """
    return await notification_service.get_preferences(db=db, current_user=current_user)


# --------------------------------------------------------------------------- #
# PATCH /notifications/preferences  (must be before /{id})                    #
# --------------------------------------------------------------------------- #

@router.patch(
    "/preferences",
    response_model=NotificationPreferenceResponse,
    summary="Update notification preferences",
    responses={401: {"description": "Not authenticated"}},
)
async def update_preferences(
    body: NotificationPreferenceUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationPreferenceResponse:
    """Update notification preferences. Only provided fields are changed."""
    return await notification_service.update_preferences(
        db=db, current_user=current_user, body=body
    )


# --------------------------------------------------------------------------- #
# PATCH /notifications/read-all  (must be before /{id})                       #
# --------------------------------------------------------------------------- #

@router.patch(
    "/read-all",
    response_model=NotificationUnreadCountResponse,
    summary="Mark all notifications as read",
    responses={401: {"description": "Not authenticated"}},
)
async def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationUnreadCountResponse:
    """Mark all unread notifications for the current user as read.

    Uses a single bulk UPDATE. Returns unread_count=0 on success.
    """
    return await notification_service.mark_all_notifications_read(
        db=db, current_user=current_user
    )


# --------------------------------------------------------------------------- #
# GET /notifications/{id}                                                       #
# --------------------------------------------------------------------------- #

@router.get(
    "/{notification_id}",
    response_model=NotificationResponse,
    summary="Get a single notification",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Not your notification"},
        404: {"description": "Notification not found"},
    },
)
async def get_notification(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationResponse:
    """Return a single notification. Owner-only access."""
    return await notification_service.get_notification(
        db=db, notification_id=notification_id, current_user=current_user
    )


# --------------------------------------------------------------------------- #
# PATCH /notifications/{id}/read                                               #
# --------------------------------------------------------------------------- #

@router.patch(
    "/{notification_id}/read",
    response_model=NotificationResponse,
    summary="Mark a notification as read",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Not your notification"},
        404: {"description": "Notification not found"},
    },
)
async def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationResponse:
    """Mark a single notification as read. Owner-only."""
    return await notification_service.mark_notification_read(
        db=db, notification_id=notification_id, current_user=current_user
    )


# --------------------------------------------------------------------------- #
# DELETE /notifications/{id}                                                    #
# --------------------------------------------------------------------------- #

@router.delete(
    "/{notification_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a notification",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Not your notification"},
        404: {"description": "Notification not found"},
    },
)
async def delete_notification(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a notification. Owner-only.

    ADMIN does not automatically have access to other users' notifications.
    """
    await notification_service.delete_notification(
        db=db, notification_id=notification_id, current_user=current_user
    )
