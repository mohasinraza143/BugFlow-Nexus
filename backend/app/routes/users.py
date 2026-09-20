"""
User management routes — Phase 6.

All routes are ADMIN-only.

RBAC:
  ADMIN       → 200 / 201
  DEVELOPER   → 403
  TESTER      → 403
  Unauth      → 401

Endpoints:
  GET    /users                    list users (paginated, filtered, searched)
  GET    /users/{user_id}          user detail
  PATCH  /users/{user_id}          update full_name / email
  PATCH  /users/{user_id}/activate activate user
  PATCH  /users/{user_id}/deactivate deactivate user (last-admin protected)
  PATCH  /users/{user_id}/role     change role (last-admin protected)

Security:
  - All responses exclude password_hash, OTP, JWT tokens.
  - actor (current_user) is obtained from the verified JWT — never from
    request body input.
  - Role information for authorisation comes from the live database row,
    not from the JWT claim, for the target user.
"""

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.dependencies.auth import require_role
from app.models.user import User, UserRole
from app.schemas.user import (
    UserDetailResponse,
    UserListResponse,
    UserRoleUpdateRequest,
    UserSortField,
    UserUpdateRequest,
)
from app.services import user_service

router = APIRouter(prefix="/users", tags=["Users"])

_ADMIN = Depends(require_role(UserRole.ADMIN))


# --------------------------------------------------------------------------- #
# GET /users                                                                   #
# --------------------------------------------------------------------------- #

@router.get(
    "",
    response_model=UserListResponse,
    summary="List all users",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "ADMIN access required"},
    },
)
async def list_users(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(20, ge=1, le=100, description="Records per page"),
    search: str | None = Query(None, description="Search by name or email"),
    role: UserRole | None = Query(None, description="Filter by role"),
    is_active: bool | None = Query(None, description="Filter by active status"),
    sort_by: UserSortField = Query(UserSortField.created_at, description="Sort field"),
    sort_desc: bool = Query(True, description="Sort descending"),
    current_user: User = _ADMIN,
    db: AsyncSession = Depends(get_db),
) -> UserListResponse:
    """Return paginated list of all users. **ADMIN only.**

    Supports search (name/email), role filter, active/inactive filter,
    and sort by any user field.
    """
    return await user_service.list_users(
        db=db,
        page=page,
        page_size=page_size,
        search=search,
        role=role,
        is_active=is_active,
        sort_by=sort_by,
        sort_desc=sort_desc,
    )


# --------------------------------------------------------------------------- #
# GET /users/{user_id}                                                         #
# --------------------------------------------------------------------------- #

@router.get(
    "/{user_id}",
    response_model=UserDetailResponse,
    summary="Get user detail",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "ADMIN access required"},
        404: {"description": "User not found"},
    },
)
async def get_user(
    user_id: int,
    current_user: User = _ADMIN,
    db: AsyncSession = Depends(get_db),
) -> UserDetailResponse:
    """Return detailed profile for a specific user. **ADMIN only.**"""
    return await user_service.get_user(user_id, db)


# --------------------------------------------------------------------------- #
# PATCH /users/{user_id}                                                       #
# --------------------------------------------------------------------------- #

@router.patch(
    "/{user_id}",
    response_model=UserDetailResponse,
    summary="Update user profile",
    responses={
        400: {"description": "Invalid input"},
        401: {"description": "Not authenticated"},
        403: {"description": "ADMIN access required"},
        404: {"description": "User not found"},
        409: {"description": "Email already in use"},
    },
)
async def update_user(
    user_id: int,
    body: UserUpdateRequest,
    current_user: User = _ADMIN,
    db: AsyncSession = Depends(get_db),
) -> UserDetailResponse:
    """Update a user's full_name and/or email. **ADMIN only.**

    Fields not provided remain unchanged.
    id, password_hash, role, is_email_verified, created_at, updated_at
    cannot be changed through this endpoint.
    """
    return await user_service.update_user(user_id, body, actor=current_user, db=db)


# --------------------------------------------------------------------------- #
# PATCH /users/{user_id}/activate                                              #
# --------------------------------------------------------------------------- #

@router.patch(
    "/{user_id}/activate",
    response_model=UserDetailResponse,
    summary="Activate a user account",
    responses={
        400: {"description": "User already active"},
        401: {"description": "Not authenticated"},
        403: {"description": "ADMIN access required"},
        404: {"description": "User not found"},
    },
)
async def activate_user(
    user_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = _ADMIN,
    db: AsyncSession = Depends(get_db),
) -> UserDetailResponse:
    """Set is_active = True for a user. **ADMIN only.**"""
    from app.services.websocket_manager import ws_manager
    detail, notifications = await user_service.activate_user(user_id, actor=current_user, db=db)
    for notif in notifications:
        payload = {
            "type": "notification",
            "data": {
                "id": notif.id,
                "notification_type": notif.notification_type.value,
                "title": notif.title,
                "message": notif.message,
                "entity_type": notif.entity_type,
                "entity_id": notif.entity_id,
                "entity_key": notif.entity_key,
                "created_at": notif.created_at.isoformat() if notif.created_at else None,
            },
        }
        background_tasks.add_task(ws_manager.send_personal_notification, notif.user_id, payload)
    return detail


# --------------------------------------------------------------------------- #
# PATCH /users/{user_id}/deactivate                                            #
# --------------------------------------------------------------------------- #

@router.patch(
    "/{user_id}/deactivate",
    response_model=UserDetailResponse,
    summary="Deactivate a user account",
    responses={
        400: {"description": "User already inactive or last-admin protection triggered"},
        401: {"description": "Not authenticated"},
        403: {"description": "ADMIN access required"},
        404: {"description": "User not found"},
    },
)
async def deactivate_user(
    user_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = _ADMIN,
    db: AsyncSession = Depends(get_db),
) -> UserDetailResponse:
    """Set is_active = False for a user. **ADMIN only.**

    Will refuse if the target is the last active ADMIN (last-admin protection).
    Deactivated users receive 403 on next login attempt.
    """
    from app.services.websocket_manager import ws_manager
    detail, notifications = await user_service.deactivate_user(user_id, actor=current_user, db=db)
    for notif in notifications:
        payload = {
            "type": "notification",
            "data": {
                "id": notif.id,
                "notification_type": notif.notification_type.value,
                "title": notif.title,
                "message": notif.message,
                "entity_type": notif.entity_type,
                "entity_id": notif.entity_id,
                "entity_key": notif.entity_key,
                "created_at": notif.created_at.isoformat() if notif.created_at else None,
            },
        }
        background_tasks.add_task(ws_manager.send_personal_notification, notif.user_id, payload)
    return detail


# --------------------------------------------------------------------------- #
# PATCH /users/{user_id}/role                                                  #
# --------------------------------------------------------------------------- #

@router.patch(
    "/{user_id}/role",
    response_model=UserDetailResponse,
    summary="Change a user's role",
    responses={
        400: {"description": "Same role, invalid role, or last-admin protection"},
        401: {"description": "Not authenticated"},
        403: {"description": "ADMIN access required"},
        404: {"description": "User not found"},
    },
)
async def change_user_role(
    user_id: int,
    body: UserRoleUpdateRequest,
    background_tasks: BackgroundTasks,
    current_user: User = _ADMIN,
    db: AsyncSession = Depends(get_db),
) -> UserDetailResponse:
    """Change the role of a user. **ADMIN only.**

    Allowed roles: ADMIN, DEVELOPER, TESTER.

    Will refuse if the target is the last active ADMIN and the new role
    is not ADMIN (last-admin protection).

    Role for the authenticated admin comes from the verified JWT — not from
    the request body.
    """
    from app.services.websocket_manager import ws_manager
    detail, notifications = await user_service.change_user_role(user_id, body, actor=current_user, db=db)
    for notif in notifications:
        payload = {
            "type": "notification",
            "data": {
                "id": notif.id,
                "notification_type": notif.notification_type.value,
                "title": notif.title,
                "message": notif.message,
                "entity_type": notif.entity_type,
                "entity_id": notif.entity_id,
                "entity_key": notif.entity_key,
                "created_at": notif.created_at.isoformat() if notif.created_at else None,
            },
        }
        background_tasks.add_task(ws_manager.send_personal_notification, notif.user_id, payload)
    return detail
