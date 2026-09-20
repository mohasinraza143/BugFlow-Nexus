"""
User service — Phase 6.

Admin-only business logic for user management.

All mutating functions:
  - Accept actor (the authenticated admin) for audit logging.
  - Call audit_service.create_audit_log() with db.flush() so the audit
    record is part of the same transaction.
  - Never store password_hash, OTP, JWT, or any secret in audit records.

Last-admin protection:
  deactivate_user() and change_user_role() check that at least one OTHER
  active ADMIN will remain after the operation. This prevents accidental
  lock-out of the entire admin tier.
"""

import math

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditAction
from app.models.user import User, UserRole
from app.schemas.user import (
    UserDetailResponse,
    UserListResponse,
    UserRoleUpdateRequest,
    UserSortField,
    UserUpdateRequest,
)
from app.services.audit_service import compute_diff, create_audit_log
from app.services import notification_service
from app.models.notification import NotificationType



# --------------------------------------------------------------------------- #
# Internal helpers                                                             #
# --------------------------------------------------------------------------- #

async def _get_user_or_404(user_id: int, db: AsyncSession) -> User:
    """Fetch a user by ID or raise HTTP 404."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {user_id} not found.",
        )
    return user


async def _count_active_admins(db: AsyncSession) -> int:
    """Return the number of currently active ADMIN users."""
    result = await db.execute(
        select(func.count())
        .select_from(User)
        .where(User.role == UserRole.ADMIN, User.is_active == True)  # noqa: E712
    )
    return result.scalar_one()


# --------------------------------------------------------------------------- #
# READ                                                                         #
# --------------------------------------------------------------------------- #

async def list_users(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
    role: UserRole | None = None,
    is_active: bool | None = None,
    sort_by: UserSortField = UserSortField.created_at,
    sort_desc: bool = True,
) -> UserListResponse:
    """Return paginated, filterable, searchable list of all users.

    Uses pure SQL — no Python-level iteration over all rows.
    """
    query = select(User)

    # ---- Filters ----------------------------------------------------------- #
    if search:
        term = f"%{search}%"
        query = query.where(
            or_(
                User.full_name.ilike(term),
                User.email.ilike(term),
            )
        )
    if role is not None:
        query = query.where(User.role == role)
    if is_active is not None:
        query = query.where(User.is_active == is_active)

    # ---- Sort -------------------------------------------------------------- #
    sort_col = getattr(User, sort_by.value)
    query = query.order_by(sort_col.desc() if sort_desc else sort_col.asc())

    # ---- Count ------------------------------------------------------------- #
    count_result = await db.execute(
        select(func.count()).select_from(query.subquery())
    )
    total = count_result.scalar_one()

    # ---- Paginate ---------------------------------------------------------- #
    offset = (page - 1) * page_size
    result = await db.execute(query.offset(offset).limit(page_size))
    users = result.scalars().all()

    return UserListResponse(
        items=[UserDetailResponse.model_validate(u) for u in users],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
    )


async def get_user(user_id: int, db: AsyncSession) -> UserDetailResponse:
    """Fetch a single user by ID or raise 404."""
    user = await _get_user_or_404(user_id, db)
    return UserDetailResponse.model_validate(user)


# --------------------------------------------------------------------------- #
# UPDATE                                                                       #
# --------------------------------------------------------------------------- #

async def update_user(
    user_id: int,
    body: UserUpdateRequest,
    actor: User,
    db: AsyncSession,
) -> UserDetailResponse:
    """Update a user's full_name and/or email.

    - Validates email uniqueness if email is being changed.
    - Records only changed fields in audit log.
    - Never touches password_hash, role, or auth fields.
    """
    user = await _get_user_or_404(user_id, db)

    # Snapshot before state
    before = {
        "full_name": user.full_name,
        "email": user.email,
    }

    # Email uniqueness check
    if body.email is not None and body.email != user.email:
        existing = await db.execute(
            select(User).where(User.email == body.email, User.id != user_id)
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Email '{body.email}' is already in use by another account.",
            )
        user.email = body.email

    if body.full_name is not None:
        user.full_name = body.full_name

    await db.flush()
    await db.refresh(user)

    after = {
        "full_name": user.full_name,
        "email": user.email,
    }
    old_diff, new_diff = compute_diff(before, after)

    if old_diff or new_diff:
        await create_audit_log(
            db=db,
            actor=actor,
            action=AuditAction.USER_UPDATED,
            entity_type="USER",
            entity_id=user.id,
            entity_key=user.email,
            description=(
                f"Admin {actor.full_name!r} updated profile for user {user.email!r}"
            ),
            old_values=old_diff,
            new_values=new_diff,
        )

    return UserDetailResponse.model_validate(user)


# --------------------------------------------------------------------------- #
# ACTIVATE / DEACTIVATE                                                        #
# --------------------------------------------------------------------------- #

async def activate_user(
    user_id: int,
    actor: User,
    db: AsyncSession,
) -> tuple[UserDetailResponse, list]:
    """Set user.is_active = True."""
    user = await _get_user_or_404(user_id, db)

    if user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already active.",
        )

    user.is_active = True
    await db.flush()
    await db.refresh(user)

    await create_audit_log(
        db=db,
        actor=actor,
        action=AuditAction.USER_ACTIVATED,
        entity_type="USER",
        entity_id=user.id,
        entity_key=user.email,
        description=(
            f"Admin {actor.full_name!r} activated user account {user.email!r}"
        ),
        old_values={"is_active": False},
        new_values={"is_active": True},
    )

    # Notify the target user (not the admin actor)
    notifications = await notification_service.notify_users(
        db=db,
        user_ids=[user.id],
        notification_type=NotificationType.USER_ACTIVATED,
        title="Your account has been activated",
        message="Your BugTracker account has been activated by an administrator.",
        actor_id=actor.id,
        entity_type="USER",
        entity_id=user.id,
        entity_key=user.email,
    )

    return UserDetailResponse.model_validate(user), notifications


async def deactivate_user(
    user_id: int,
    actor: User,
    db: AsyncSession,
) -> tuple[UserDetailResponse, list]:
    """Set user.is_active = False.

    Last-admin protection: refuses to deactivate if this is the only
    remaining active ADMIN.
    """
    user = await _get_user_or_404(user_id, db)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already inactive.",
        )

    # Last-admin protection
    if user.role == UserRole.ADMIN:
        active_admin_count = await _count_active_admins(db)
        if active_admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Cannot deactivate the last active ADMIN. "
                    "Promote another user to ADMIN first."
                ),
            )

    user.is_active = False
    await db.flush()
    await db.refresh(user)

    await create_audit_log(
        db=db,
        actor=actor,
        action=AuditAction.USER_DEACTIVATED,
        entity_type="USER",
        entity_id=user.id,
        entity_key=user.email,
        description=(
            f"Admin {actor.full_name!r} deactivated user account {user.email!r}"
        ),
        old_values={"is_active": True},
        new_values={"is_active": False},
    )

    # Notify the target user (not the admin actor)
    notifications = await notification_service.notify_users(
        db=db,
        user_ids=[user.id],
        notification_type=NotificationType.USER_DEACTIVATED,
        title="Your account has been deactivated",
        message="Your BugTracker account has been deactivated by an administrator.",
        actor_id=actor.id,
        entity_type="USER",
        entity_id=user.id,
        entity_key=user.email,
    )

    return UserDetailResponse.model_validate(user), notifications


# --------------------------------------------------------------------------- #
# ROLE MANAGEMENT                                                              #
# --------------------------------------------------------------------------- #

async def change_user_role(
    user_id: int,
    body: UserRoleUpdateRequest,
    actor: User,
    db: AsyncSession,
) -> tuple[UserDetailResponse, list]:
    """Change a user's role.

    Last-admin protection: refuses to change the role of the last active
    ADMIN away from ADMIN.

    Security: actor comes from the verified JWT — never from request body.
    """
    user = await _get_user_or_404(user_id, db)

    if user.role == body.role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User already has role {body.role.value}.",
        )

    # Last-admin protection: would this remove the last active admin?
    if user.role == UserRole.ADMIN and body.role != UserRole.ADMIN:
        if user.is_active:
            active_admin_count = await _count_active_admins(db)
            if active_admin_count <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "Cannot remove ADMIN role from the last active ADMIN. "
                        "Promote another user to ADMIN first."
                    ),
                )

    old_role = user.role
    user.role = body.role
    await db.flush()
    await db.refresh(user)

    await create_audit_log(
        db=db,
        actor=actor,
        action=AuditAction.USER_ROLE_CHANGED,
        entity_type="USER",
        entity_id=user.id,
        entity_key=user.email,
        description=(
            f"Admin {actor.full_name!r} changed role of {user.email!r} "
            f"from {old_role.value} to {body.role.value}"
        ),
        old_values={"role": old_role},
        new_values={"role": body.role},
    )

    # Notify the target user (not the admin actor)
    notifications = await notification_service.notify_users(
        db=db,
        user_ids=[user.id],
        notification_type=NotificationType.USER_ROLE_CHANGED,
        title="Your role has been updated",
        message=(
            f"Your BugTracker role has been changed from "
            f"{old_role.value} to {body.role.value}."
        ),
        actor_id=actor.id,
        entity_type="USER",
        entity_id=user.id,
        entity_key=user.email,
    )

    return UserDetailResponse.model_validate(user), notifications
