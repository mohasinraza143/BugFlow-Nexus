"""
Audit log / Activity routes — Phase 5.

Provides read-only access to the immutable audit trail.

RBAC:
  GET /activity             → ADMIN only (paginated, filterable)
  GET /activity/{audit_id}  → ADMIN only (single record detail)

No PATCH or DELETE routes exist — audit records are immutable.

Security:
  - Only ADMIN can view audit logs.
  - user_id in records comes from the persisted JWT claim at write time —
    it is never settable by API consumers.
  - Passwords, tokens, OTP values, and secrets are never stored in
    old_values / new_values (enforced in audit_service.py).
  - All filter parameters use parameterised SQLAlchemy queries —
    SQL injection is not possible.
"""

import math

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database.session import get_db
from app.dependencies.auth import require_role
from app.models.audit_log import AuditAction, AuditLog
from app.models.user import User, UserRole
from app.schemas.audit import AuditLogListResponse, AuditLogResponse

router = APIRouter(prefix="/activity", tags=["Activity / Audit Logs"])


# --------------------------------------------------------------------------- #
# GET /activity                                                                #
# --------------------------------------------------------------------------- #

@router.get(
    "",
    response_model=AuditLogListResponse,
    summary="List all audit log entries",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "ADMIN access required"},
    },
)
async def list_activity(
    # --- Pagination ---
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(20, ge=1, le=100, description="Records per page"),
    # --- Filters ---
    action: AuditAction | None = Query(None, description="Filter by action type"),
    entity_type: str | None = Query(
        None, description="Filter by entity type: ISSUE | PROJECT | AUTH"
    ),
    user_id: int | None = Query(None, description="Filter by actor user ID"),
    entity_id: int | None = Query(None, description="Filter by affected resource ID"),
    date_from: str | None = Query(
        None, description="ISO-8601 date/datetime lower bound (inclusive)"
    ),
    date_to: str | None = Query(
        None, description="ISO-8601 date/datetime upper bound (inclusive)"
    ),
    search: str | None = Query(
        None, description="Full-text search against entity_key and description"
    ),
    # --- Auth ---
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> AuditLogListResponse:
    """Return a paginated, filterable list of audit log entries.

    **ADMIN only.**

    All filters are optional and can be combined. Results are ordered
    newest-first. The `actor` field in each item contains a brief user
    snapshot (no password_hash or secrets).
    """
    query = select(AuditLog).options(selectinload(AuditLog.actor))

    # ---- Filters ----------------------------------------------------------- #
    conditions = []

    if action is not None:
        conditions.append(AuditLog.action == action)
    if entity_type is not None:
        conditions.append(AuditLog.entity_type == entity_type.upper())
    if user_id is not None:
        conditions.append(AuditLog.user_id == user_id)
    if entity_id is not None:
        conditions.append(AuditLog.entity_id == entity_id)

    # Date range — parse ISO-8601 strings
    if date_from is not None:
        try:
            from datetime import datetime
            dt_from = datetime.fromisoformat(date_from)
            conditions.append(AuditLog.created_at >= dt_from)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="date_from must be a valid ISO-8601 date or datetime string.",
            )
    if date_to is not None:
        try:
            from datetime import datetime
            dt_to = datetime.fromisoformat(date_to)
            conditions.append(AuditLog.created_at <= dt_to)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="date_to must be a valid ISO-8601 date or datetime string.",
            )

    # Full-text search (parameterised — SQL injection safe)
    if search:
        term = f"%{search}%"
        conditions.append(
            or_(
                AuditLog.entity_key.ilike(term),
                AuditLog.description.ilike(term),
            )
        )

    if conditions:
        query = query.where(and_(*conditions))

    # ---- Count ------------------------------------------------------------- #
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # ---- Paginate ---------------------------------------------------------- #
    offset = (page - 1) * page_size
    result = await db.execute(
        query.order_by(AuditLog.created_at.desc()).offset(offset).limit(page_size)
    )
    logs = result.scalars().all()

    return AuditLogListResponse(
        items=[AuditLogResponse.model_validate(log) for log in logs],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
    )


# --------------------------------------------------------------------------- #
# GET /activity/{audit_id}                                                     #
# --------------------------------------------------------------------------- #

@router.get(
    "/{audit_id}",
    response_model=AuditLogResponse,
    summary="Get a single audit log entry by ID",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "ADMIN access required"},
        404: {"description": "Audit log entry not found"},
    },
)
async def get_activity_detail(
    audit_id: int,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> AuditLogResponse:
    """Retrieve the complete detail of a single audit record.

    **ADMIN only.**

    Returns 404 if the audit record does not exist.
    """
    result = await db.execute(
        select(AuditLog)
        .options(selectinload(AuditLog.actor))
        .where(AuditLog.id == audit_id)
    )
    log = result.scalar_one_or_none()

    if log is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Audit log entry {audit_id} not found.",
        )

    return AuditLogResponse.model_validate(log)


# --------------------------------------------------------------------------- #
# Immutability note                                                            #
# --------------------------------------------------------------------------- #
# There are intentionally NO PATCH or DELETE routes in this file.
# Audit records must not be modified or removed through normal API calls.
# Immutability is enforced at the API layer (no routes) and the service
# layer (create_audit_log writes via flush, never update/delete).
