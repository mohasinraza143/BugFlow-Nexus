"""
Issue / Defect management routes.

RBAC summary:
  POST   /issues                        → USER, ADMIN (reporters)
  GET    /issues                        → ALL (role-filtered in service)
  GET    /issues/{id}                   → ALL (ownership check in service)
  PATCH  /issues/{id}                   → USER (own issues), ADMIN
  PATCH  /issues/{id}/assign            → ADMIN
  PATCH  /issues/{id}/status            → TESTER (assigned)
  PATCH  /issues/{id}/resolve           → TESTER (assigned)
  PATCH  /issues/{id}/reopen            → USER (own) | TESTER (own) | ADMIN

  Smart features (Milestone 3):
  POST   /issues/calculate-priority     → ALL authenticated
  GET    /issues/{id}/suggest-assignee  → ADMIN only
"""

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.dependencies.auth import get_current_user, require_role
from app.models.issue import IssueStatus, IssueType, Priority, Severity
from app.models.user import User, UserRole
from app.schemas.issue import (
    IssueAssign,
    IssueCreate,
    IssueDetailResponse,
    IssueListResponse,
    IssueReopen,
    IssueResolve,
    IssueResponse,
    IssueStatusUpdate,
    IssueUpdate,
)
from pydantic import BaseModel
from app.schemas.audit import AuditLogResponse
from app.schemas.smart import PriorityCalcRequest, PriorityCalcResponse, DeveloperMatchResponse
from app.services import issue_service
from app.services import smart_service

router = APIRouter(prefix="/issues", tags=["Issues"])


# --------------------------------------------------------------------------- #
# Smart Priority Calculator (STATIC — before dynamic routes)                   #
# --------------------------------------------------------------------------- #

@router.post(
    "/calculate-priority",
    response_model=PriorityCalcResponse,
    summary="Smart Priority Calculator (mentor formula: severity_weight × category_urgency_weight)",
    description=(
        "Mentor formula: priority_score = severity_weight × category_urgency_weight.\n"
        "Severity: CRITICAL=4, MAJOR=3, MINOR=2, TRIVIAL=1.\n"
        "Category: Security/Database=3, API/Backend=2, UI/Colors/Typo=1.\n"
        "Thresholds: >=10→URGENT, 7-9→HIGH, 4-6→MEDIUM, <4→LOW."
    ),
)
async def calculate_priority(
    body: PriorityCalcRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PriorityCalcResponse:
    """Compute a recommended Priority using the mentor's exact formula."""
    return await smart_service.calculate_priority(body, db)


@router.post(
    "/triage-recommendation",
    response_model=PriorityCalcResponse,
    summary="[Alias] Triage recommendation — same as /calculate-priority",
    description="Mentor-required alias for POST /issues/calculate-priority.",
)
async def triage_recommendation(
    body: PriorityCalcRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PriorityCalcResponse:
    """Mentor-compatible alias for the Smart Priority Calculator."""
    return await smart_service.calculate_priority(body, db)


@router.post(
    "",
    response_model=IssueDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Report a defect",
)
async def create_issue(
    body: IssueCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_role(UserRole.USER, UserRole.DEVELOPER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> IssueDetailResponse:
    """Report a new defect. **USER, DEVELOPER (legacy), or ADMIN.**
    The reporter is automatically set to the authenticated user.
    Status is always set to REPORTED. Assignee is always NULL.
    ADMINs receive a real-time WebSocket notification via BackgroundTask.
    """
    from app.services.websocket_manager import ws_manager
    detail, notifications = await issue_service.create_issue(body, current_user, db)
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


@router.get(
    "",
    response_model=IssueListResponse,
    summary="List issues",
)
async def list_issues(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    skip: int | None = Query(None, ge=0, description="Offset alias for pagination"),
    limit: int | None = Query(None, ge=1, le=100, description="Page-size alias for pagination"),
    status: IssueStatus | None = Query(None),
    severity: Severity | None = Query(None),
    priority: Priority | None = Query(None),
    issue_type: IssueType | None = Query(None),
    project_id: int | None = Query(None),
    reporter_id: int | None = Query(None, description="ADMIN only"),
    assignee_id: int | None = Query(None, description="ADMIN only"),
    unassigned: bool | None = Query(None, description="ADMIN only"),
    sprint_id: int | None = Query(None, description="Filter by Sprint ID"),
    backlog: bool | None = Query(None, description="If true, only return issues with no sprint_id"),
    search: str | None = Query(None, min_length=3, description="Search key, title, or description"),
    sort_by: str | None = Query(None, description="Field to sort by (created_at, updated_at, priority)"),
    sort_desc: bool = Query(True, description="Sort in descending order"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List issues with pagination, filtering, and role-based visibility."""
    if skip is not None:
        page_size = limit or page_size
        page = (skip // page_size) + 1
    elif limit is not None:
        page_size = limit
    return await issue_service.list_issues(
        db=db,
        current_user=current_user,
        page=page,
        page_size=page_size,
        status_filter=status,
        severity_filter=severity,
        priority_filter=priority,
        issue_type_filter=issue_type,
        project_id=project_id,
        reporter_id=reporter_id,
        assignee_id=assignee_id,
        unassigned=unassigned,
        sprint_id=sprint_id,
        backlog=backlog,
        search=search,
        sort_by=sort_by,
        sort_desc=sort_desc,
    )


@router.delete(
    "/{issue_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an issue",
)
async def delete_issue(
    issue_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete an issue reported by the current user, or any issue as ADMIN."""
    await issue_service.delete_issue(issue_id, current_user, db)


@router.get(
    "/{issue_id}",
    response_model=IssueDetailResponse,
    summary="Get issue details",
)
async def get_issue(
    issue_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IssueDetailResponse:
    """Get full issue detail with role-based access control."""
    detail = await issue_service.get_issue_detail(issue_id, db, current_user=current_user)
    return detail


@router.patch(
    "/{issue_id}",
    response_model=IssueDetailResponse,
    summary="Update issue metadata",
)
async def update_issue(
    issue_id: int,
    body: IssueUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IssueDetailResponse:
    """Update permitted fields on an issue.
    **TESTER** can update their own reported issues.
    **ADMIN** can update any issue.
    Protected fields (reporter_id, issue_key, project_id, created_at) are never modifiable.
    """
    return await issue_service.update_issue(issue_id, body, current_user, db)


@router.patch(
    "/{issue_id}/assign",
    response_model=IssueDetailResponse,
    summary="Assign issue to a developer",
)
async def assign_issue(
    issue_id: int,
    body: IssueAssign,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> IssueDetailResponse:
    """Assign or reassign an issue to a developer. **ADMIN only.**"""
    from app.services.websocket_manager import ws_manager
    detail, notifications = await issue_service.assign_issue(issue_id, body, current_user, db)
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


@router.patch(
    "/{issue_id}/status",
    response_model=IssueDetailResponse,
    summary="Update issue status",
)
async def update_issue_status(
    issue_id: int,
    body: IssueStatusUpdate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_role(UserRole.TESTER, UserRole.DEVELOPER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> IssueDetailResponse:
    """Transition an issue through the investigation workflow.
    **TESTER (or legacy DEVELOPER)** — must be assigned to the issue.
    **ADMIN** — can force-change status on any issue.

    Valid transitions:
    - ASSIGNED → IN_DEVELOPMENT
    - IN_DEVELOPMENT → IN_REVIEW
    - IN_REVIEW → IN_TESTING or IN_DEVELOPMENT
    - REOPENED → IN_DEVELOPMENT
    """
    from app.services.websocket_manager import ws_manager
    detail, notifications = await issue_service.update_issue_status(issue_id, body, current_user, db)
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


@router.patch(
    "/{issue_id}/resolve",
    response_model=IssueDetailResponse,
    summary="Resolve an issue",
)
async def resolve_issue(
    issue_id: int,
    body: IssueResolve,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_role(UserRole.TESTER, UserRole.DEVELOPER)),
    db: AsyncSession = Depends(get_db),
) -> IssueDetailResponse:
    """Mark an assigned issue as RESOLVED. **TESTER (or legacy DEVELOPER)** — must be assigned."""
    from app.services.websocket_manager import ws_manager
    detail, notifications = await issue_service.resolve_issue(issue_id, body, current_user, db)
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


@router.patch(
    "/{issue_id}/reopen",
    response_model=IssueDetailResponse,
    summary="Reopen an issue",
)
async def reopen_issue(
    issue_id: int,
    body: IssueReopen,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IssueDetailResponse:
    """Reopen a resolved, closed, or in-testing issue.
    - **TESTER**: can reopen their own reported issues
    - **ADMIN**: can reopen any issue
    """
    if current_user.role not in (UserRole.USER, UserRole.TESTER, UserRole.ADMIN):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only USER, TESTER, or ADMIN can reopen issues.",
        )
    from app.services.websocket_manager import ws_manager
    detail, notifications = await issue_service.reopen_issue(issue_id, body, current_user, db)
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


@router.patch(
    "/{issue_id}/close",
    response_model=IssueDetailResponse,
    summary="Confirm resolution and close an issue",
)
async def close_issue(
    issue_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IssueDetailResponse:
    """Confirm resolution and mark a RESOLVED issue as CLOSED.
    - **USER**: can confirm resolution of their own reported issues
    - **ADMIN**: can confirm resolution and close any issue
    """
    if current_user.role not in (UserRole.USER, UserRole.ADMIN):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only USER (reporter) or ADMIN can confirm resolution and close issues.",
        )
    from app.services.websocket_manager import ws_manager
    detail, notifications = await issue_service.close_issue(issue_id, current_user, db)
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


@router.get(
    "/{issue_id}/activity",
    response_model=list[AuditLogResponse],
    summary="Get issue activity timeline",
)
async def get_issue_activity(
    issue_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AuditLogResponse]:
    """Get audit history timeline for a specific issue.
    - **USER**: own reported issues
    - **TESTER**: assigned or reported issues
    - **ADMIN**: all issues
    """
    return await issue_service.get_issue_activity(issue_id, current_user, db)


class BulkSprintAssignRequest(BaseModel):
    issue_ids: list[int]
    sprint_id: int | None

@router.post("/bulk-assign-sprint")
async def bulk_assign_sprint(
    request: BulkSprintAssignRequest,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Bulk assign issues to a sprint."""
    updated_count = await issue_service.bulk_update_issues_sprint(
        db=db, issue_ids=request.issue_ids, sprint_id=request.sprint_id, current_user=current_user
    )
    return {"message": f"Successfully updated {updated_count} issues."}


# --------------------------------------------------------------------------- #
# Smart Developer Matcher (DYNAMIC — after static routes)                      #
# --------------------------------------------------------------------------- #

@router.get(
    "/{issue_id}/suggest-assignee",
    response_model=DeveloperMatchResponse,
    summary="Smart Developer Matcher — ranked assignee suggestions",
    description=(
        "Return a ranked list of TESTER/DEVELOPER users for the given issue, "
        "scored by resolution rate, current workload, and average resolution speed."
    ),
)
async def suggest_assignee(
    issue_id: int,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> DeveloperMatchResponse:
    """Return ranked assignee suggestions for an issue. **ADMIN only.**"""
    return await smart_service.suggest_assignee(issue_id, db)
