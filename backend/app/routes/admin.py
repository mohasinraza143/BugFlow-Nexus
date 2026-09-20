"""
Admin dashboard routes — Phase 6.

Endpoints:
  GET /admin/dashboard  — system-wide statistics snapshot

RBAC:
  ADMIN     → 200
  DEVELOPER → 403
  TESTER    → 403
  Unauth    → 401

All counts are real-time SQL aggregations.
No sensitive data (passwords, tokens, OTPs) is exposed.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.dependencies.auth import require_role
from app.models.user import User, UserRole
from app.schemas.admin import DashboardResponse, InactiveAssigneeList
from app.services import admin_service

router = APIRouter(prefix="/admin", tags=["Admin"])

_ADMIN = Depends(require_role(UserRole.ADMIN))


@router.get(
    "/dashboard",
    response_model=DashboardResponse,
    summary="Admin dashboard statistics",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "ADMIN access required"},
    },
)
async def dashboard(
    current_user: User = _ADMIN,
    db: AsyncSession = Depends(get_db),
) -> DashboardResponse:
    """Return real-time system statistics for the Admin dashboard.

    **ADMIN only.**

    Includes:
    - User counts (total, active, inactive, by role, verified)
    - Project counts (total, active, inactive)
    - Issue counts by status, severity, and priority
    - Recent activity (last 7 days)

    All values are computed from live SQL aggregation queries.
    No sensitive data (password_hash, tokens, OTPs) is included.
    """
    return await admin_service.get_dashboard_stats(db)


@router.get(
    "/alerts/inactive-assignees",
    response_model=InactiveAssigneeList,
    summary="Get inactive users with assigned issues",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "ADMIN access required"},
    },
)
async def inactive_assignees(
    current_user: User = _ADMIN,
    db: AsyncSession = Depends(get_db),
) -> InactiveAssigneeList:
    """Return a list of inactive users who still have open issues assigned to them.

    **ADMIN only.**
    """
    return await admin_service.get_inactive_assignees(db)
