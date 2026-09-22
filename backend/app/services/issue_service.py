"""
Issue service — business logic for defect management.

Keeps all DB queries, key generation, and workflow enforcement
out of route handlers. All functions are async + AsyncSession.

Phase 5: Audit logging integrated into all mutating operations.
         Audit records are written via db.flush() inside the same
         transaction as the mutating operation.
"""

import math
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.audit_log import AuditAction, AuditLog
from app.schemas.audit import AuditLogResponse
from app.models.issue import (
    DEVELOPER_TRANSITIONS,
    REOPENABLE_STATUSES,
    Issue,
    IssueStatus,
    IssueType,
    Priority,
    Severity,
)
from app.models.project import Project, ProjectStatus
from app.models.sprint import Sprint, SprintStatus
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
from app.services.audit_service import compute_diff, create_audit_log
from app.services import notification_service
from app.models.notification import NotificationType


# --------------------------------------------------------------------------- #
# Internal helpers                                                             #
# --------------------------------------------------------------------------- #

async def _get_issue_or_404(issue_id: int, db: AsyncSession) -> Issue:
    """Fetch an Issue with relationships eagerly loaded, or raise 404."""
    result = await db.execute(
        select(Issue)
        .options(
            selectinload(Issue.project),
            selectinload(Issue.reporter),
            selectinload(Issue.assignee),
        )
        .where(Issue.id == issue_id)
    )
    issue = result.scalar_one_or_none()
    if issue is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Issue {issue_id} not found.",
        )
    return issue


async def _get_project_active_or_error(project_id: int, db: AsyncSession) -> Project:
    """Fetch a Project, raising 404 if missing and 400 if inactive."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found.",
        )
    if project.status != ProjectStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot report issues on an inactive project.",
        )
    return project


async def delete_issue(issue_id: int, current_user: User, db: AsyncSession) -> None:
    """Delete an issue owned by the reporter or by an administrator."""
    issue = await _get_issue_or_404(issue_id, db)
    if current_user.role != UserRole.ADMIN and issue.reporter_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete issues that you reported.",
        )

    await create_audit_log(
        db=db,
        actor=current_user,
        action=AuditAction.ISSUE_DELETED,
        entity_type="ISSUE",
        entity_id=issue.id,
        entity_key=issue.issue_key,
        description=f"{current_user.full_name!r} deleted issue {issue.issue_key!r}",
    )
    await db.delete(issue)
    await db.commit()


async def _generate_issue_key(project_key: str, db: AsyncSession) -> str:
    """Generate the next sequential issue key for a project.

    Format: <PROJECT_KEY>-<zero-padded-number>  e.g. DM-0001, DM-0042
    """
    # Count existing issues for this project
    result = await db.execute(
        select(func.count())
        .select_from(Issue)
        .join(Project, Issue.project_id == Project.id)
        .where(Project.project_key == project_key)
    )
    count = result.scalar_one()
    return f"{project_key}-{count + 1:04d}"


# --------------------------------------------------------------------------- #
# CRUD                                                                         #
# --------------------------------------------------------------------------- #

async def create_issue(body: IssueCreate, reporter: User, db: AsyncSession) -> tuple[IssueDetailResponse, list]:
    """Create a new defect. Reporter is always the authenticated user (USER/ADMIN).

    Returns (IssueDetailResponse, list_of_notifications) so the route handler
    can schedule WebSocket delivery to ADMINs as a BackgroundTask.
    """
    project = await _get_project_active_or_error(body.project_id, db)
    issue_key = await _generate_issue_key(project.project_key, db)

    sprint_id = None
    if body.sprint_id is not None:
        sprint_result = await db.execute(
            select(Sprint).where(Sprint.id == body.sprint_id)
        )
        sprint = sprint_result.scalar_one_or_none()
        if sprint is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Sprint {body.sprint_id} not found.",
            )
        if sprint.project_id != body.project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Issue and sprint must belong to the same project.",
            )
        sprint_id = sprint.id
    else:
        active_sprint_result = await db.execute(
            select(Sprint)
            .where(
                Sprint.project_id == body.project_id,
                Sprint.assigned_tester_id == reporter.id,
                Sprint.status.in_((
                    SprintStatus.ACTIVE,
                    SprintStatus.IN_PROGRESS,
                    SprintStatus.READY_FOR_APPROVAL,
                )),
            )
            .order_by(Sprint.actual_start_date.desc(), Sprint.id.desc())
            .limit(1)
        )
        active_sprint = active_sprint_result.scalar_one_or_none()
        if active_sprint:
            sprint_id = active_sprint.id

    issue = Issue(
        issue_key=issue_key,
        title=body.title,
        description=body.description,
        issue_type=body.issue_type,
        severity=body.severity,
        priority=body.priority,
        status=IssueStatus.REPORTED,
        environment=body.environment,
        steps_to_reproduce=body.steps_to_reproduce,
        expected_result=body.expected_result,
        actual_result=body.actual_result,
        project_id=body.project_id,
        reporter_id=reporter.id,
        assignee_id=None,
        sprint_id=sprint_id,
        estimated_effort=body.estimated_effort,
    )
    db.add(issue)
    await db.flush()

    await create_audit_log(
        db=db,
        actor=reporter,
        action=AuditAction.ISSUE_CREATED,
        entity_type="ISSUE",
        entity_id=issue.id,
        entity_key=issue_key,
        description=(
            f"{reporter.role.value.capitalize()} {reporter.full_name!r} reported issue {issue_key} "
            f"in project {project.project_key}"
        ),
        new_values={
            "issue_key": issue_key,
            "title": body.title,
            "issue_type": body.issue_type,
            "severity": body.severity,
            "priority": body.priority,
            "status": IssueStatus.REPORTED,
            "project_key": project.project_key,
            "reporter": reporter.full_name,
        },
    )

    # Notify all active ADMIN users that a new issue has been reported
    admin_result = await db.execute(
        select(User).where(
            User.role == UserRole.ADMIN,
            User.is_active == True,  # noqa: E712
        )
    )
    admin_users = admin_result.scalars().all()
    admin_ids = [u.id for u in admin_users]

    notifications = await notification_service.notify_users(
        db=db,
        user_ids=admin_ids,
        notification_type=NotificationType.ISSUE_REPORTED,
        title="New issue reported",
        message=f"New issue reported by {reporter.full_name}: {issue_key} — {body.title}",
        actor_id=reporter.id,
        entity_type="ISSUE",
        entity_id=issue.id,
        entity_key=issue_key,
    )

    # Re-fetch with relationships
    detail = await get_issue_detail(issue.id, db)
    return detail, notifications


async def get_issue_detail(
    issue_id: int, db: AsyncSession, current_user: User | None = None
) -> IssueDetailResponse:
    """Fetch full issue detail with related project, reporter, assignee and enforce RBAC."""
    issue = await _get_issue_or_404(issue_id, db)
    if current_user is not None and current_user.role != UserRole.ADMIN:
        if current_user.role == UserRole.USER and issue.reporter_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view issues you reported.",
            )
        elif (
            current_user.role in (UserRole.TESTER, UserRole.DEVELOPER)
            and issue.assignee_id != current_user.id
            and issue.reporter_id != current_user.id
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view issues assigned to you.",
            )
    return IssueDetailResponse.model_validate(issue)


async def list_issues(
    db: AsyncSession,
    current_user: User,
    page: int = 1,
    page_size: int = 20,
    status_filter: IssueStatus | None = None,
    severity_filter: Severity | None = None,
    priority_filter: Priority | None = None,
    issue_type_filter: IssueType | None = None,
    project_id: int | None = None,
    reporter_id: int | None = None,
    assignee_id: int | None = None,
    unassigned: bool | None = None,
    sprint_id: int | None = None,
    backlog: bool | None = None,
    search: str | None = None,
    sort_by: str | None = None,
    sort_desc: bool = True,
) -> IssueListResponse:
    """Return paginated issues with role-based visibility enforcement.

    Role filters:
      ADMIN     — sees all issues
      TESTER    — only issues assigned to them (assignee_id)
      USER      — only issues they personally reported (reporter_id)
      DEVELOPER — only issues assigned to them (legacy)
    """
    query = select(Issue)

    # ---- Role-based base filter ------------------------------------------- #
    if current_user.role == UserRole.USER:
        # Users can only see their own submitted issues
        query = query.where(Issue.reporter_id == current_user.id)
    elif current_user.role == UserRole.TESTER:
        # Testers see only issues assigned to them
        query = query.where(Issue.assignee_id == current_user.id)
    elif current_user.role == UserRole.DEVELOPER:
        # Legacy role — assigned issues only
        query = query.where(Issue.assignee_id == current_user.id)
    # ADMIN sees all — no base filter

    # ---- Optional filters ------------------------------------------------- #
    if status_filter is not None:
        query = query.where(Issue.status == status_filter)
    if severity_filter is not None:
        query = query.where(Issue.severity == severity_filter)
    if priority_filter is not None:
        query = query.where(Issue.priority == priority_filter)
    if issue_type_filter is not None:
        query = query.where(Issue.issue_type == issue_type_filter)
    if project_id is not None:
        query = query.where(Issue.project_id == project_id)
    if sprint_id is not None:
        query = query.where(Issue.sprint_id == sprint_id)
    if backlog is True:
        query = query.where(Issue.sprint_id.is_(None))

    # Reporter / assignee filters are ADMIN-only (to prevent enumeration)
    if current_user.role == UserRole.ADMIN:
        if reporter_id is not None:
            query = query.where(Issue.reporter_id == reporter_id)
        if assignee_id is not None:
            query = query.where(Issue.assignee_id == assignee_id)
        
        if unassigned is True:
            query = query.where(Issue.assignee_id.is_(None))
        elif unassigned is False:
            query = query.where(Issue.assignee_id.is_not(None))

    # ---- Search ----------------------------------------------------------- #
    if search:
        term = f"%{search}%"
        query = query.where(
            or_(
                Issue.issue_key.ilike(term),
                Issue.title.ilike(term),
                Issue.description.ilike(term),
            )
        )

    # ---- Pagination & Sorting --------------------------------------------- #
    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar_one()

    offset = (page - 1) * page_size
    
    # Sorting
    order_col = Issue.created_at
    if sort_by == 'updated_at':
        order_col = Issue.updated_at
        order_expr = order_col.desc() if sort_desc else order_col.asc()
    elif sort_by == 'priority':
        order_col = Issue.priority
        order_expr = order_col.desc() if sort_desc else order_col.asc()
    elif sort_by == 'recommended':
        # Recommended: Priority desc, Severity desc, created_at asc
        order_expr = [Issue.priority.desc(), Issue.severity.desc(), Issue.created_at.asc()]
    else:
        order_expr = order_col.desc() if sort_desc else order_col.asc()
        
    if not isinstance(order_expr, list):
        order_expr = [order_expr]
    
    result = await db.execute(
        query.order_by(*order_expr).offset(offset).limit(page_size)
    )
    issues = result.scalars().all()

    return IssueListResponse(
        items=[IssueResponse.model_validate(i) for i in issues],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
    )


async def update_issue(
    issue_id: int, body: IssueUpdate, current_user: User, db: AsyncSession
) -> IssueDetailResponse:
    """USER/TESTER: update their own reported issue's metadata fields."""
    issue = await _get_issue_or_404(issue_id, db)

    # Ownership check — only reporters or assignees can update issue metadata
    if current_user.role in (UserRole.USER, UserRole.TESTER) and issue.reporter_id != current_user.id and issue.assignee_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update issues you reported or are assigned to.",
        )

    # Protected statuses — cannot update resolved/closed issues
    if issue.status in (IssueStatus.RESOLVED, IssueStatus.CLOSED):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot update a resolved or closed issue. Reopen it first.",
        )

    # Snapshot before state for change tracking
    before = {
        "title": issue.title,
        "description": issue.description,
        "severity": issue.severity,
        "priority": issue.priority,
        "environment": issue.environment,
        "steps_to_reproduce": issue.steps_to_reproduce,
        "expected_result": issue.expected_result,
        "actual_result": issue.actual_result,
        "estimated_effort": issue.estimated_effort,
    }

    if body.title is not None:
        issue.title = body.title
    if body.description is not None:
        issue.description = body.description
    if body.severity is not None:
        issue.severity = body.severity
    if body.priority is not None:
        issue.priority = body.priority
    if body.environment is not None:
        issue.environment = body.environment
    if body.steps_to_reproduce is not None:
        issue.steps_to_reproduce = body.steps_to_reproduce
    if body.expected_result is not None:
        issue.expected_result = body.expected_result
    if body.actual_result is not None:
        issue.actual_result = body.actual_result
    if body.estimated_effort is not None:
        issue.estimated_effort = body.estimated_effort

    await db.flush()
    await db.refresh(issue)

    # Only emit audit record if something actually changed
    after = {
        "title": issue.title,
        "description": issue.description,
        "severity": issue.severity,
        "priority": issue.priority,
        "environment": issue.environment,
        "steps_to_reproduce": issue.steps_to_reproduce,
        "expected_result": issue.expected_result,
        "actual_result": issue.actual_result,
        "estimated_effort": issue.estimated_effort,
    }
    old_diff, new_diff = compute_diff(before, after)

    if old_diff or new_diff:
        await create_audit_log(
            db=db,
            actor=current_user,
            action=AuditAction.ISSUE_UPDATED,
            entity_type="ISSUE",
            entity_id=issue.id,
            entity_key=issue.issue_key,
            description=f"{current_user.role.value.capitalize()} {current_user.full_name!r} updated issue {issue.issue_key}",
            old_values=old_diff,
            new_values=new_diff,
        )

    await db.commit()
    return await get_issue_detail(issue_id, db)


# --------------------------------------------------------------------------- #
# Assignment                                                                   #
# --------------------------------------------------------------------------- #

async def assign_issue(
    issue_id: int, body: IssueAssign, current_user: User, db: AsyncSession
) -> tuple[IssueDetailResponse, list]:
    """ADMIN: assign/reassign an issue to a tester.

    Accepts users with the TESTER role (the role responsible for investigating
    and resolving assigned issues in the current workflow).

    Returns (IssueDetailResponse, list_of_notifications) so the route handler
    can schedule WebSocket delivery as a BackgroundTask.
    """
    issue = await _get_issue_or_404(issue_id, db)

    # Validate target user exists and has TESTER role
    dev_result = await db.execute(select(User).where(User.id == body.developer_id))
    developer: User | None = dev_result.scalar_one_or_none()
    if developer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {body.developer_id} not found.",
        )
    if developer.role not in (UserRole.TESTER, UserRole.DEVELOPER):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Issues can only be assigned to a TESTER.",
        )
    if not developer.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot assign issue to an inactive user.",
        )

    old_assignee_id = issue.assignee_id
    # Repair legacy issues that were assigned before the tester's sprint was
    # created or assigned, so their status changes appear in sprint analytics.
    if issue.sprint_id is None and current_user.role in (UserRole.TESTER, UserRole.DEVELOPER):
        sprint_result = await db.execute(
            select(Sprint)
            .where(
                Sprint.project_id == issue.project_id,
                Sprint.assigned_tester_id == current_user.id,
                Sprint.status.in_(
                    (
                        SprintStatus.ACTIVE,
                        SprintStatus.IN_PROGRESS,
                        SprintStatus.READY_FOR_APPROVAL,
                    )
                ),
            )
            .order_by(Sprint.updated_at.desc())
            .limit(1)
        )
        active_sprint = sprint_result.scalar_one_or_none()
        if active_sprint:
            issue.sprint_id = active_sprint.id

    old_status = issue.status

    issue.assignee_id = body.developer_id
    if issue.status == IssueStatus.REPORTED:
        issue.status = IssueStatus.ASSIGNED

    # Link newly assigned work to the tester's active sprint when it has not
    # already been scheduled explicitly.
    if issue.sprint_id is None and developer.role in (UserRole.TESTER, UserRole.DEVELOPER):
        sprint_result = await db.execute(
            select(Sprint)
            .where(
                Sprint.project_id == issue.project_id,
                Sprint.assigned_tester_id == developer.id,
                Sprint.status.in_((
                    SprintStatus.ACTIVE,
                    SprintStatus.IN_PROGRESS,
                    SprintStatus.READY_FOR_APPROVAL,
                )),
            )
            .order_by(Sprint.updated_at.desc())
            .limit(1)
        )
        active_sprint = sprint_result.scalar_one_or_none()
        if active_sprint:
            issue.sprint_id = active_sprint.id

    await db.flush()
    await db.refresh(issue)  # expire cached attributes so next query re-loads relationships

    await create_audit_log(
        db=db,
        actor=current_user,
        action=AuditAction.ISSUE_ASSIGNED,
        entity_type="ISSUE",
        entity_id=issue.id,
        entity_key=issue.issue_key,
        description=(
            f"Admin {current_user.full_name!r} assigned issue {issue.issue_key} "
            f"to {developer.full_name!r}"
        ),
        old_values={
            "assignee_id": old_assignee_id,
            "status": old_status,
        },
        new_values={
            "assignee_id": body.developer_id,
            "assignee_name": developer.full_name,
            "status": issue.status,
        },
    )

    # Notify the assigned tester and reporter (actor = admin, never notified)
    notify_recipients = [developer.id]
    if issue.reporter_id and issue.reporter_id != current_user.id:
        notify_recipients.append(issue.reporter_id)

    notifications = await notification_service.notify_users(
        db=db,
        user_ids=notify_recipients,
        notification_type=NotificationType.ISSUE_ASSIGNED,
        title="Issue assigned to tester",
        message=f"Issue {issue.issue_key} has been assigned to {developer.full_name}.",
        actor_id=current_user.id,
        entity_type="ISSUE",
        entity_id=issue.id,
        entity_key=issue.issue_key,
    )

    return await get_issue_detail(issue_id, db), notifications


# --------------------------------------------------------------------------- #
# Status transitions                                                           #
# --------------------------------------------------------------------------- #

async def update_issue_status(
    issue_id: int, body: IssueStatusUpdate, current_user: User, db: AsyncSession
) -> tuple[IssueDetailResponse, list]:
    """TESTER/DEVELOPER: transition their assigned issue.
    ADMIN: force-set any status.

    Also repairs legacy issues that have no sprint_id by linking them to
    the current user's active sprint when one exists. This keeps sprint
    analytics consistent for older issues.
    """
    issue = await _get_issue_or_404(issue_id, db)

    if current_user.role == UserRole.ADMIN:
        # ADMIN can set any status on any issue without restriction.
        pass
    else:
        # Non-admin must be assigned to the issue.
        if issue.assignee_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only update status on issues assigned to you.",
            )

        allowed = DEVELOPER_TRANSITIONS.get(issue.status, set())
        if body.status not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot transition from {issue.status.value} to "
                    f"{body.status.value}. "
                    f"Allowed targets: "
                    f"{[s.value for s in allowed] or 'none'}."
                ),
            )

        # Repair legacy issues that were assigned without a sprint.
        if issue.sprint_id is None and current_user.role in (
            UserRole.TESTER,
            UserRole.DEVELOPER,
        ):
            sprint_result = await db.execute(
                select(Sprint)
                .where(
                    Sprint.project_id == issue.project_id,
                    Sprint.assigned_tester_id == current_user.id,
                    Sprint.status.in_(
                        (
                            SprintStatus.ACTIVE,
                            SprintStatus.IN_PROGRESS,
                            SprintStatus.READY_FOR_APPROVAL,
                        )
                    ),
                )
                .order_by(Sprint.updated_at.desc())
                .limit(1)
            )
            active_sprint = sprint_result.scalar_one_or_none()
            if active_sprint:
                issue.sprint_id = active_sprint.id

    old_status = issue.status
    reporter_id = issue.reporter_id
    issue.status = body.status

    if body.status in (IssueStatus.RESOLVED, IssueStatus.CLOSED) and not issue.resolved_at:
        issue.resolved_at = datetime.now(UTC)
    elif body.status not in (IssueStatus.RESOLVED, IssueStatus.CLOSED):
        issue.resolved_at = None

    await db.flush()
    await db.refresh(issue)

    await create_audit_log(
        db=db,
        actor=current_user,
        action=AuditAction.ISSUE_STATUS_CHANGED,
        entity_type="ISSUE",
        entity_id=issue.id,
        entity_key=issue.issue_key,
        description=(
            f"{current_user.role.value.capitalize()} {current_user.full_name!r} "
            f"changed status of {issue.issue_key} from {old_status.value} "
            f"to {body.status.value}"
        ),
        old_values={"status": old_status},
        new_values={"status": body.status},
    )

    # Notify the reporter and admins so dashboards in other sessions refresh.
    recipient_result = await db.execute(
        select(User.id).where(User.role == UserRole.ADMIN, User.is_active == True)
    )
    recipient_ids = set(recipient_result.scalars().all())
    if reporter_id:
        recipient_ids.add(reporter_id)
    recipient_ids.discard(current_user.id)
    notifications = await notification_service.notify_users(
        db=db,
        user_ids=list(recipient_ids),
        notification_type=NotificationType.ISSUE_STATUS_CHANGED,
        title="Issue status updated",
        message=(
            f"{issue.issue_key} status changed from "
            f"{old_status.value} to {body.status.value}."
        ),
        actor_id=current_user.id,
        entity_type="ISSUE",
        entity_id=issue.id,
        entity_key=issue.issue_key,
    )

    await db.commit()

    return await get_issue_detail(issue_id, db), notifications


# --------------------------------------------------------------------------- #
# Resolution                                                                   #
# --------------------------------------------------------------------------- #

async def resolve_issue(
    issue_id: int, body: IssueResolve, current_user: User, db: AsyncSession
) -> tuple[IssueDetailResponse, list]:
    """DEVELOPER: mark their assigned issue as resolved."""
    issue = await _get_issue_or_404(issue_id, db)

    if issue.assignee_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only resolve issues assigned to you.",
        )

    if issue.status == IssueStatus.RESOLVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Issue is already resolved.",
        )

    # Resolution is allowed from IN_REVIEW or IN_TESTING
    resolvable = {IssueStatus.IN_REVIEW, IssueStatus.IN_TESTING, IssueStatus.IN_DEVELOPMENT, IssueStatus.ASSIGNED}
    if issue.status not in resolvable:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot resolve issue in status {issue.status.value}.",
        )

    old_status = issue.status
    reporter_id = issue.reporter_id

    summary = body.resolution_summary
    if body.resolution_notes:
        summary = f"{body.resolution_summary}\n\nNotes: {body.resolution_notes}"

    issue.status = IssueStatus.RESOLVED
    issue.resolution_summary = summary
    issue.resolved_at = datetime.now(UTC)
    await db.flush()
    await db.refresh(issue)

    await create_audit_log(
        db=db,
        actor=current_user,
        action=AuditAction.ISSUE_RESOLVED,
        entity_type="ISSUE",
        entity_id=issue.id,
        entity_key=issue.issue_key,
        description=(
            f"Developer {current_user.full_name!r} resolved issue {issue.issue_key}"
        ),
        old_values={"status": old_status},
        new_values={
            "status": IssueStatus.RESOLVED,
            "resolution_summary": body.resolution_summary,
            "resolved_at": issue.resolved_at,
        },
    )

    # Notify the reporter (not the developer who resolved)
    notifications = await notification_service.notify_users(
        db=db,
        user_ids=[reporter_id] if reporter_id else [],
        notification_type=NotificationType.ISSUE_RESOLVED,
        title="Issue resolved",
        message=f"{issue.issue_key} has been resolved.",
        actor_id=current_user.id,
        entity_type="ISSUE",
        entity_id=issue.id,
        entity_key=issue.issue_key,
    )

    await db.commit()

    return await get_issue_detail(issue_id, db), notifications


# --------------------------------------------------------------------------- #
# Reopen                                                                       #
# --------------------------------------------------------------------------- #

async def reopen_issue(
    issue_id: int, body: IssueReopen, current_user: User, db: AsyncSession
) -> tuple[IssueDetailResponse, list]:
    """TESTER (own issues) or ADMIN: reopen a resolved/closed issue."""
    issue = await _get_issue_or_404(issue_id, db)

    if issue.status not in REOPENABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot reopen issue in status {issue.status.value}. "
                f"Reopenable statuses: {[s.value for s in REOPENABLE_STATUSES]}."
            ),
        )

    # Ownership check
    if current_user.role == UserRole.USER and issue.reporter_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Users can only reopen issues they reported.",
        )
    elif current_user.role == UserRole.TESTER and issue.assignee_id != current_user.id and issue.reporter_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Testers can only reopen issues assigned to or reported by them.",
        )

    old_status = issue.status
    assignee_id = issue.assignee_id

    reopen_note = f"[REOPENED by {current_user.full_name}]"
    if body.reason:
        reopen_note += f" Reason: {body.reason}"

    issue.status = IssueStatus.REOPENED
    issue.resolution_summary = None  # clear resolution
    issue.resolved_at = None

    # Append reopen note to description for traceability
    if body.reason:
        issue.description = f"{issue.description}\n\n{reopen_note}"

    await db.flush()
    await db.refresh(issue)

    await create_audit_log(
        db=db,
        actor=current_user,
        action=AuditAction.ISSUE_REOPENED,
        entity_type="ISSUE",
        entity_id=issue.id,
        entity_key=issue.issue_key,
        description=(
            f"{current_user.role.value.capitalize()} {current_user.full_name!r} "
            f"reopened issue {issue.issue_key}"
        ),
        old_values={"status": old_status},
        new_values={"status": IssueStatus.REOPENED, "reason": body.reason},
    )

    # Notify the assignee if present (not the actor)
    notify_ids = [assignee_id] if assignee_id else []
    notifications = await notification_service.notify_users(
        db=db,
        user_ids=notify_ids,
        notification_type=NotificationType.ISSUE_REOPENED,
        title="Issue reopened",
        message=f"{issue.issue_key} has been reopened and requires attention.",
        actor_id=current_user.id,
        entity_type="ISSUE",
        entity_id=issue.id,
        entity_key=issue.issue_key,
    )

    await db.commit()
    return await get_issue_detail(issue_id, db), notifications


# --------------------------------------------------------------------------- #
# Close / Confirm Resolution                                                   #
# --------------------------------------------------------------------------- #

async def close_issue(
    issue_id: int, current_user: User, db: AsyncSession
) -> tuple[IssueDetailResponse, list]:
    """USER (reporter) or ADMIN: confirm resolution and close a resolved issue."""
    issue = await _get_issue_or_404(issue_id, db)

    if issue.status != IssueStatus.RESOLVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot close issue in status {issue.status.value}. Only RESOLVED issues can be closed.",
        )

    if current_user.role in (UserRole.USER, UserRole.TESTER) and issue.reporter_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Users and Testers can only confirm resolution of issues they reported.",
        )

    old_status = issue.status
    assignee_id = issue.assignee_id
    issue.status = IssueStatus.CLOSED

    await db.flush()
    await db.refresh(issue)

    await create_audit_log(
        db=db,
        actor=current_user,
        action=AuditAction.ISSUE_STATUS_CHANGED,
        entity_type="ISSUE",
        entity_id=issue.id,
        entity_key=issue.issue_key,
        description=(
            f"{current_user.role.value.capitalize()} {current_user.full_name!r} "
            f"confirmed resolution and closed issue {issue.issue_key}"
        ),
        old_values={"status": old_status},
        new_values={"status": IssueStatus.CLOSED},
    )

    notify_ids = [assignee_id] if assignee_id else []
    notifications = await notification_service.notify_users(
        db=db,
        user_ids=notify_ids,
        notification_type=NotificationType.ISSUE_STATUS_CHANGED,
        title="Issue resolution confirmed",
        message=f"{issue.issue_key} was confirmed as resolved and closed by {current_user.full_name}.",
        actor_id=current_user.id,
        entity_type="ISSUE",
        entity_id=issue.id,
        entity_key=issue.issue_key,
    )

    return await get_issue_detail(issue_id, db), notifications


# --------------------------------------------------------------------------- #
# Activity / History                                                           #
# --------------------------------------------------------------------------- #

async def get_issue_activity(
    issue_id: int, current_user: User, db: AsyncSession
) -> list[AuditLogResponse]:
    """Fetch audit history for a specific issue respecting RBAC."""
    issue = await _get_issue_or_404(issue_id, db)

    # RBAC check
    if current_user.role == UserRole.USER and issue.reporter_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Users can only view activity on issues they reported.",
        )
    elif current_user.role == UserRole.TESTER and issue.assignee_id != current_user.id and issue.reporter_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Testers can only view activity on issues assigned to or reported by them.",
        )

    result = await db.execute(
        select(AuditLog)
        .options(selectinload(AuditLog.actor))
        .where(
            AuditLog.entity_type == "ISSUE",
            AuditLog.entity_id == issue_id,
        )
        .order_by(AuditLog.created_at.asc())
    )
    logs = result.scalars().all()
    return [AuditLogResponse.model_validate(log) for log in logs]

# --------------------------------------------------------------------------- #
# Bulk Operations                                                              #
# --------------------------------------------------------------------------- #

async def bulk_update_issues_sprint(
    db: AsyncSession,
    issue_ids: list[int],
    sprint_id: int | None,
    current_user: User
) -> int:
    """ADMIN: bulk update the sprint_id for a list of issues."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can bulk assign issues to sprints."
        )

    if not issue_ids:
        return 0

    target_sprint = None
    if sprint_id is not None:
        sprint_res = await db.execute(select(Sprint).where(Sprint.id == sprint_id))
        target_sprint = sprint_res.scalar_one_or_none()
        if not target_sprint:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Target sprint {sprint_id} not found."
            )

    result = await db.execute(select(Issue).where(Issue.id.in_(issue_ids)))
    issues = result.scalars().all()

    if len(issues) != len(issue_ids):
        found_ids = {i.id for i in issues}
        missing_ids = list(set(issue_ids) - found_ids)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Issues with IDs {missing_ids} not found."
        )

    dest_name = f"Sprint '{target_sprint.name}'" if target_sprint else "Backlog"
    if target_sprint:
        for issue in issues:
            if issue.project_id != target_sprint.project_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot assign issue {issue.issue_key} to sprint '{target_sprint.name}': issue belongs to project {issue.project_id}, but sprint belongs to project {target_sprint.project_id}."
                )

    updated_count = 0
    for issue in issues:
        issue.sprint_id = sprint_id
        if target_sprint and target_sprint.assigned_tester_id:
            issue.assignee_id = target_sprint.assigned_tester_id
            if issue.status == IssueStatus.REPORTED:
                issue.status = IssueStatus.ASSIGNED

        await create_audit_log(
            db=db,
            actor=current_user,
            action=AuditAction.ISSUE_UPDATED,
            entity_type="ISSUE",
            entity_id=issue.id,
            entity_key=issue.issue_key,
            description=(
                f"Admin {current_user.full_name!r} assigned issue {issue.issue_key} to {dest_name}"
            )
        )
        updated_count += 1
        
    await db.commit()
    return updated_count

