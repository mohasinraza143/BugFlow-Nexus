"""
Notification service — Phase 8.

Core responsibilities:
  1. create_notification()    — creates one notification within the caller's DB transaction.
  2. notify_users()           — deduplicates recipients, skips actor, creates one per user.
  3. list_notifications()     — paginated retrieval (SQL-level pagination).
  4. get_notification()       — single-record owner check.
  5. mark_notification_read() — sets is_read + read_at.
  6. mark_all_notifications_read() — bulk mark-as-read.
  7. get_unread_count()       — pure SELECT COUNT(*) — never loads all rows.
  8. delete_notification()    — owner-only soft delete (hard delete from table).
  9. create_or_get_preferences() — get-or-create pattern.
  10. update_preferences()    — partial update.

Transactional contract:
  create_notification() uses db.flush() — it participates in the caller's
  transaction. If the parent operation rolls back, the notification rolls back too.

WebSocket / email delivery:
  These are handled by the CALLER (route handler) via BackgroundTasks, after
  the HTTP response has been committed. This file does NOT import ws_manager
  or send_notification_email — it stays purely in the DB layer.

Security:
  - Notification ownership is verified server-side from validated JWT.
  - No password_hash, OTP, JWT, or SMTP credentials are ever stored in notifications.
  - SQLAlchemy parameterized queries — no raw SQL string interpolation.
"""

import logging
import math
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification, NotificationType
from app.models.notification_preference import NotificationPreference
from app.models.user import User
from app.schemas.notification import (
    NotificationListResponse,
    NotificationPreferenceResponse,
    NotificationPreferenceUpdate,
    NotificationResponse,
    NotificationUnreadCountResponse,
)

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# Internal helpers                                                              #
# --------------------------------------------------------------------------- #

async def _get_notification_or_404(notification_id: int, db: AsyncSession) -> Notification:
    """Fetch a notification by ID or raise HTTP 404."""
    result = await db.execute(
        select(Notification).where(Notification.id == notification_id)
    )
    notif = result.scalar_one_or_none()
    if notif is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Notification {notification_id} not found.",
        )
    return notif


def _check_notification_ownership(notif: Notification, current_user: User) -> None:
    """Raise HTTP 403 if current_user does not own the notification.

    Notifications are private — even ADMIN cannot access another user's notifications.
    """
    if notif.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this notification.",
        )


# --------------------------------------------------------------------------- #
# Core creation                                                                 #
# --------------------------------------------------------------------------- #

async def create_notification(
    db: AsyncSession,
    user_id: int,
    notification_type: NotificationType,
    title: str,
    message: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
    entity_key: str | None = None,
) -> Notification:
    """Create a single notification record within the caller's DB transaction.

    Uses db.flush() — does NOT commit. The caller is responsible for
    committing (or the FastAPI route's auto-commit does it).

    Returns the flushed (but not yet committed) Notification object so
    the caller can include it in a WebSocket background task.
    """
    notif = Notification(
        user_id=user_id,
        notification_type=notification_type,
        title=title,
        message=message,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_key=entity_key,
        is_read=False,
    )
    db.add(notif)
    await db.flush()
    await db.refresh(notif)
    return notif


async def notify_users(
    db: AsyncSession,
    user_ids: list[int],
    notification_type: NotificationType,
    title: str,
    message: str,
    actor_id: int | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    entity_key: str | None = None,
) -> list[Notification]:
    """Create notifications for multiple users.

    Deduplication rules:
      - Duplicate user_ids are collapsed to unique set.
      - actor_id is excluded (actor is never notified about their own action).
      - user_id=0 or None entries are skipped.

    Returns list of created Notification objects (flushed, not committed).
    """
    unique_ids = {uid for uid in user_ids if uid and uid != actor_id}
    if not unique_ids:
        return []

    notifications: list[Notification] = []
    for uid in unique_ids:
        notif = await create_notification(
            db=db,
            user_id=uid,
            notification_type=notification_type,
            title=title,
            message=message,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_key=entity_key,
        )
        notifications.append(notif)

    return notifications


# --------------------------------------------------------------------------- #
# Read operations                                                               #
# --------------------------------------------------------------------------- #

async def list_notifications(
    db: AsyncSession,
    current_user: User,
    page: int = 1,
    page_size: int = 20,
    unread_only: bool = False,
    notification_type: NotificationType | None = None,
) -> NotificationListResponse:
    """Return paginated notifications for current_user.

    Ordered newest-first. Pagination is done at SQL level — no Python iteration
    over all rows.
    """
    base_q = select(Notification).where(Notification.user_id == current_user.id)

    if unread_only:
        base_q = base_q.where(Notification.is_read == False)  # noqa: E712

    if notification_type is not None:
        base_q = base_q.where(Notification.notification_type == notification_type)

    # COUNT
    count_q = select(func.count()).select_from(base_q.subquery())
    total = (await db.execute(count_q)).scalar_one()

    # Data
    offset = (page - 1) * page_size
    result = await db.execute(
        base_q.order_by(Notification.created_at.desc(), Notification.id.desc())
        .offset(offset)
        .limit(page_size)
    )
    items = result.scalars().all()

    return NotificationListResponse(
        items=[NotificationResponse.model_validate(n) for n in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
    )


async def get_notification(
    db: AsyncSession,
    notification_id: int,
    current_user: User,
) -> NotificationResponse:
    """Return a single notification. Owner-only access."""
    notif = await _get_notification_or_404(notification_id, db)
    _check_notification_ownership(notif, current_user)
    return NotificationResponse.model_validate(notif)


async def get_unread_count(
    db: AsyncSession,
    current_user: User,
) -> NotificationUnreadCountResponse:
    """Return count of unread notifications using SELECT COUNT(*).

    Never loads all notification rows into Python.
    """
    result = await db.execute(
        select(func.count())
        .select_from(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,  # noqa: E712
        )
    )
    count = result.scalar_one()
    return NotificationUnreadCountResponse(unread_count=count)


# --------------------------------------------------------------------------- #
# Mutation operations                                                           #
# --------------------------------------------------------------------------- #

async def mark_notification_read(
    db: AsyncSession,
    notification_id: int,
    current_user: User,
) -> NotificationResponse:
    """Mark a single notification as read. Owner-only."""
    notif = await _get_notification_or_404(notification_id, db)
    _check_notification_ownership(notif, current_user)

    if not notif.is_read:
        notif.is_read = True
        notif.read_at = datetime.now(UTC)
        await db.flush()

    return NotificationResponse.model_validate(notif)


async def mark_all_notifications_read(
    db: AsyncSession,
    current_user: User,
) -> NotificationUnreadCountResponse:
    """Mark ALL unread notifications for current_user as read.

    Uses a single bulk UPDATE — not a Python loop.
    """
    now = datetime.now(UTC)
    await db.execute(
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,  # noqa: E712
        )
        .values(is_read=True, read_at=now)
    )
    await db.flush()
    return NotificationUnreadCountResponse(unread_count=0)


async def delete_notification(
    db: AsyncSession,
    notification_id: int,
    current_user: User,
) -> None:
    """Hard-delete a notification. Owner-only access."""
    notif = await _get_notification_or_404(notification_id, db)
    _check_notification_ownership(notif, current_user)
    await db.delete(notif)
    await db.flush()


# --------------------------------------------------------------------------- #
# Preferences                                                                   #
# --------------------------------------------------------------------------- #

async def create_or_get_preferences(
    db: AsyncSession,
    user_id: int,
) -> NotificationPreference:
    """Get-or-create a NotificationPreference record for user_id.

    If no record exists, one is created with all-defaults (all enabled).
    This is cheaper and safer than a bulk migration that touches every user.
    """
    result = await db.execute(
        select(NotificationPreference).where(NotificationPreference.user_id == user_id)
    )
    prefs = result.scalar_one_or_none()
    if prefs is None:
        prefs = NotificationPreference(user_id=user_id)
        db.add(prefs)
        await db.flush()
        await db.refresh(prefs)
    return prefs


async def get_preferences(
    db: AsyncSession,
    current_user: User,
) -> NotificationPreferenceResponse:
    """Return current user's notification preferences (get-or-create)."""
    prefs = await create_or_get_preferences(db, current_user.id)
    return NotificationPreferenceResponse.model_validate(prefs)


async def update_preferences(
    db: AsyncSession,
    current_user: User,
    body: NotificationPreferenceUpdate,
) -> NotificationPreferenceResponse:
    """Partial-update notification preferences. Only provided fields change."""
    prefs = await create_or_get_preferences(db, current_user.id)

    update_data = body.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(prefs, field, value)

    await db.flush()
    await db.refresh(prefs)
    return NotificationPreferenceResponse.model_validate(prefs)


# --------------------------------------------------------------------------- #
# Email helper (called from background tasks — not from DB transaction)        #
# --------------------------------------------------------------------------- #

async def should_send_email(
    db: AsyncSession,
    user_id: int,
    notification_type: NotificationType,
) -> bool:
    """Check if an email should be sent for this notification type.

    Returns False if:
      - NOTIFICATION_EMAIL_ENABLED global setting is off
      - User has email_enabled = false
      - User's specific preference for this type is false
    """
    from app.core.config import settings

    if not getattr(settings, "NOTIFICATION_EMAIL_ENABLED", True):
        return False

    prefs = await create_or_get_preferences(db, user_id)

    if not prefs.email_enabled:
        return False

    type_to_field: dict[NotificationType, str] = {
        NotificationType.ISSUE_ASSIGNED: "issue_assigned",
        NotificationType.ISSUE_STATUS_CHANGED: "issue_status_changed",
        NotificationType.ISSUE_RESOLVED: "issue_resolved",
        NotificationType.ISSUE_REOPENED: "issue_reopened",
        NotificationType.ISSUE_COMMENTED: "issue_commented",
        NotificationType.ATTACHMENT_ADDED: "attachment_added",
        NotificationType.ISSUE_REPORTED: "issue_assigned",    # use email_enabled check only
        NotificationType.USER_ROLE_CHANGED: "issue_assigned",  # no specific field — use email_enabled check only
        NotificationType.USER_ACTIVATED: "issue_assigned",     # same
        NotificationType.USER_DEACTIVATED: "issue_assigned",   # same
        NotificationType.ISSUE_MENTIONED: "issue_commented",
        NotificationType.SPRINT_STARTED: "issue_assigned",
        NotificationType.SPRINT_ENDED: "issue_assigned",
        NotificationType.SPRINT_OVERDUE: "issue_assigned",
    }

    field = type_to_field.get(notification_type)
    if field and field not in ("issue_assigned",):
        return bool(getattr(prefs, field, True))

    return True
