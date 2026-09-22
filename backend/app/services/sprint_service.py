from datetime import datetime, timezone, timedelta
from typing import Sequence
from fastapi import HTTPException, status
from sqlalchemy import select, func, case, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.models.sprint import Sprint, SprintStatus
from app.models.issue import Issue, IssueStatus
from app.models.project import Project
from app.models.user import User, UserRole
from app.schemas.sprint import (
    SprintCreate, SprintUpdate, SprintAnalytics, SprintOverview, SprintRead,
    SprintAssignTester, SprintRequestChanges
)
from app.services.audit_service import create_audit_log
from app.models.audit_log import AuditAction
from app.services import notification_service
from app.models.notification import NotificationType
from app.schemas.notification import NotificationResponse
from app.services.websocket_manager import ws_manager

# Statuses that count as "active/in-flight" for burndown/health purposes
_ACTIVE_STATUSES = {
    SprintStatus.ACTIVE,
    SprintStatus.IN_PROGRESS,
    SprintStatus.READY_FOR_APPROVAL,
}


async def get_sprints_for_project(db: AsyncSession, project_id: int) -> Sequence[Sprint]:
    result = await db.execute(
        select(Sprint)
        .options(
            selectinload(Sprint.assigned_tester),
            selectinload(Sprint.submitted_by),
            selectinload(Sprint.approved_by),
        )
        .where(Sprint.project_id == project_id)
        .order_by(Sprint.start_date.desc())
    )
    return result.scalars().all()


async def get_sprint_by_id(db: AsyncSession, sprint_id: int) -> Sprint:
    result = await db.execute(
        select(Sprint)
        .options(
            selectinload(Sprint.assigned_tester),
            selectinload(Sprint.submitted_by),
            selectinload(Sprint.approved_by),
        )
        .where(Sprint.id == sprint_id)
    )
    sprint = result.scalar_one_or_none()
    if not sprint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sprint not found")
    return sprint


async def create_sprint(db: AsyncSession, sprint_in: SprintCreate, actor: User | None = None) -> Sprint:
    # Verify project exists
    result = await db.execute(select(Project).where(Project.id == sprint_in.project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if sprint_in.end_date <= sprint_in.start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sprint end date must be after start date"
        )
        
    # Ensure name uniqueness within the project
    result = await db.execute(
        select(Sprint).where(Sprint.project_id == sprint_in.project_id, Sprint.name == sprint_in.name)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A sprint with this name already exists in the project"
        )

    sprint = Sprint(
        name=sprint_in.name.strip(),
        goal=sprint_in.goal,
        start_date=sprint_in.start_date,
        end_date=sprint_in.end_date,
        project_id=sprint_in.project_id,
        status=SprintStatus.PLANNED,
        estimated_team_members=sprint_in.estimated_team_members,
        working_days=sprint_in.working_days,
        hours_per_day=sprint_in.hours_per_day,
    )
    db.add(sprint)
    await db.flush()

    # Assign issues if provided
    if sprint_in.issue_ids:
        issue_result = await db.execute(
            select(Issue).where(Issue.id.in_(sprint_in.issue_ids))
        )
        issues = issue_result.scalars().all()
        if len(issues) != len(sprint_in.issue_ids):
            found_ids = {i.id for i in issues}
            missing_ids = list(set(sprint_in.issue_ids) - found_ids)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Issues with IDs {missing_ids} not found."
            )
        for issue in issues:
            if issue.project_id != sprint.project_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot assign issue {issue.issue_key} to sprint '{sprint.name}': issue belongs to project {issue.project_id}, but sprint belongs to project {sprint.project_id}."
                )
            issue.sprint_id = sprint.id
            if actor:
                await create_audit_log(
                    db=db, actor=actor, action=AuditAction.ISSUE_UPDATED,
                    entity_type="ISSUE", entity_id=issue.id, entity_key=issue.issue_key,
                    description=f"Issue assigned to Sprint '{sprint.name}' on creation"
                )

    if actor:
        await create_audit_log(
            db=db, actor=actor, action=AuditAction.SPRINT_CREATED,
            entity_type="SPRINT", entity_id=sprint.id, entity_key=sprint.name,
            description=f"Created sprint '{sprint.name}'"
        )

    await db.commit()
    await db.refresh(sprint)
    return sprint


async def update_sprint(db: AsyncSession, sprint_id: int, sprint_in: SprintUpdate, actor: User | None = None) -> Sprint:
    sprint = await get_sprint_by_id(db, sprint_id)

    if sprint_in.name and sprint_in.name.strip() != sprint.name:
        # Ensure name uniqueness within the project
        result = await db.execute(
            select(Sprint).where(Sprint.project_id == sprint.project_id, Sprint.name == sprint_in.name.strip())
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A sprint with this name already exists in the project"
            )

    update_data = sprint_in.model_dump(exclude_unset=True)
    if "name" in update_data and update_data["name"]:
        update_data["name"] = update_data["name"].strip()

    if "status" in update_data and update_data["status"] == SprintStatus.ACTIVE and sprint.status != SprintStatus.ACTIVE:
        result = await db.execute(
            select(Sprint).where(
                Sprint.project_id == sprint.project_id,
                Sprint.status == SprintStatus.ACTIVE,
                Sprint.id != sprint.id,
            )
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Another sprint is already active for this project."
            )

    for field, value in update_data.items():
        setattr(sprint, field, value)

    # Validate dates if they were updated
    if sprint.end_date <= sprint.start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sprint end date must be after start date"
        )

    if actor:
        await create_audit_log(
            db=db, actor=actor, action=AuditAction.SPRINT_UPDATED,
            entity_type="SPRINT", entity_id=sprint.id, entity_key=sprint.name,
            description=f"Updated sprint '{sprint.name}'"
        )

    await db.commit()
    await db.refresh(sprint)
    return sprint


async def start_sprint(db: AsyncSession, sprint_id: int, actor: User) -> Sprint:
    sprint = await get_sprint_by_id(db, sprint_id)
    
    if sprint.status != SprintStatus.PLANNED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Sprint cannot be started because it is in {sprint.status} state"
        )
        
    # Check if another sprint is already ACTIVE
    result = await db.execute(
        select(Sprint).where(Sprint.project_id == sprint.project_id, Sprint.status == SprintStatus.ACTIVE)
    )
    active_sprint = result.scalar_one_or_none()
    if active_sprint:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Another sprint is already active for this project."
        )

    sprint.status = SprintStatus.ACTIVE
    sprint.actual_start_date = datetime.now(timezone.utc)
    
    await create_audit_log(
        db=db, actor=actor, action=AuditAction.SPRINT_STARTED,
        entity_type="SPRINT", entity_id=sprint.id, entity_key=sprint.name,
        description=f"Started sprint '{sprint.name}'"
    )

    admin_result = await db.execute(select(User.id).where(User.role == UserRole.ADMIN, User.is_active == True))
    admin_ids = admin_result.scalars().all()
    notifications = await notification_service.notify_users(
        db=db, user_ids=admin_ids, notification_type=NotificationType.SPRINT_STARTED,
        title="Sprint Started", message=f"Sprint '{sprint.name}' has been started by {actor.full_name}.",
        actor_id=actor.id, entity_type="SPRINT", entity_id=sprint.id, entity_key=sprint.name
    )

    await db.commit()
    
    # Broadcast to connected admins
    for notif in notifications:
        payload = NotificationResponse.model_validate(notif).model_dump(mode="json")
        await ws_manager.send_personal_notification(notif.user_id, payload)

    await db.refresh(sprint)
    return sprint


async def complete_sprint(db: AsyncSession, sprint_id: int, move_remaining_to_sprint_id: int | None, actor: User) -> Sprint:
    sprint = await get_sprint_by_id(db, sprint_id)
    
    if sprint.status not in (SprintStatus.ACTIVE, SprintStatus.READY_FOR_APPROVAL):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only ACTIVE or READY_FOR_APPROVAL sprints can be completed"
        )

    # Find unfinished issues
    unfinished_issues_result = await db.execute(
        select(Issue).where(
            Issue.sprint_id == sprint.id,
            Issue.status.notin_([IssueStatus.RESOLVED, IssueStatus.CLOSED]),
        )
    )
    unfinished_issues = unfinished_issues_result.scalars().all()
    
    # Auto-move unfinished issues to backlog (or another sprint)
    for issue in unfinished_issues:
        issue.sprint_id = move_remaining_to_sprint_id

    # Keep only completed issues in this sprint for historical analytics
    issue_count_result = await db.execute(
        select(func.count(Issue.id)).where(Issue.sprint_id == sprint.id)
    )
    issue_count = issue_count_result.scalar() or 0

    sprint.status = SprintStatus.COMPLETED
    sprint.completed_at = datetime.now(timezone.utc)
    
    await create_audit_log(
        db=db, actor=actor, action=AuditAction.SPRINT_COMPLETED,
        entity_type="SPRINT", entity_id=sprint.id, entity_key=sprint.name,
        description=f"Completed sprint '{sprint.name}'. {len(unfinished_issues)} unfinished issues auto-moved to backlog/next sprint."
    )

    admin_result = await db.execute(select(User.id).where(User.role == UserRole.ADMIN, User.is_active == True))
    admin_ids = admin_result.scalars().all()
    notifications = await notification_service.notify_users(
        db=db, user_ids=admin_ids, notification_type=NotificationType.SPRINT_ENDED,
        title="Sprint Completed", message=f"Sprint '{sprint.name}' has been completed by {actor.full_name}.",
        actor_id=actor.id, entity_type="SPRINT", entity_id=sprint.id, entity_key=sprint.name
    )

    await db.commit()
    
    # Broadcast
    for notif in notifications:
        payload = NotificationResponse.model_validate(notif).model_dump(mode="json")
        await ws_manager.send_personal_notification(notif.user_id, payload)

    await db.refresh(sprint)
    return sprint


async def delete_sprint(db: AsyncSession, sprint_id: int, actor: User) -> None:
    sprint = await get_sprint_by_id(db, sprint_id)
    # Deleting a sprint never deletes its issues; return them to the backlog.
    result = await db.execute(select(Issue).where(Issue.sprint_id == sprint.id))
    unassigned_issues = result.scalars().all()
    for issue in unassigned_issues:
        issue.sprint_id = None
        await create_audit_log(
            db=db, actor=actor, action=AuditAction.ISSUE_UPDATED,
            entity_type="ISSUE", entity_id=issue.id, entity_key=issue.issue_key,
            description=f"Issue unassigned from deleted sprint '{sprint.name}' back to Backlog"
        )

    await db.delete(sprint)
    await create_audit_log(
        db=db, actor=actor, action=AuditAction.SPRINT_DELETED,
        entity_type="SPRINT", entity_id=sprint.id, entity_key=sprint.name,
        description=f"Deleted sprint '{sprint.name}'"
    )
    await db.commit()

async def archive_sprint(db: AsyncSession, sprint_id: int, actor: User) -> Sprint:
    sprint = await get_sprint_by_id(db, sprint_id)
    if sprint.status != SprintStatus.COMPLETED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only completed sprints can be archived")
        
    sprint.status = SprintStatus.ARCHIVED
    await create_audit_log(
        db=db, actor=actor, action=AuditAction.SPRINT_ARCHIVED,
        entity_type="SPRINT", entity_id=sprint.id, entity_key=sprint.name,
        description=f"Archived sprint '{sprint.name}'"
    )
    await db.commit()
    await db.refresh(sprint)
    return sprint

async def extend_sprint(db: AsyncSession, sprint_id: int, new_end_date: datetime, actor: User) -> Sprint:
    sprint = await get_sprint_by_id(db, sprint_id)
    if sprint.status not in [SprintStatus.ACTIVE, SprintStatus.PLANNED]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Can only extend ACTIVE or PLANNED sprints")
        
    if new_end_date <= sprint.end_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New end date must be after current end date")
        
    sprint.end_date = new_end_date
    await create_audit_log(
        db=db, actor=actor, action=AuditAction.SPRINT_EXTENDED,
        entity_type="SPRINT", entity_id=sprint.id, entity_key=sprint.name,
        description=f"Extended sprint '{sprint.name}' to {new_end_date.strftime('%Y-%m-%d')}"
    )
    await db.commit()
    await db.refresh(sprint)
    return sprint

async def get_project_sprint_summary(db: AsyncSession, project_id: int) -> SprintOverview:
    sprints = await get_sprints_for_project(db, project_id)
    
    total = len(sprints)
    completed_sprints = [s for s in sprints if s.status in [SprintStatus.COMPLETED, SprintStatus.ARCHIVED]]
    active_sprint = next((s for s in sprints if s.status in _ACTIVE_STATUSES), None)
    
    now = datetime.now(timezone.utc)
    overdue_count = sum(1 for s in sprints if s.status in _ACTIVE_STATUSES and s.end_date < now)
    
    avg_comp_rate = 0.0
    avg_velocity = 0.0
    
    if completed_sprints:
        total_comp_rate = 0.0
        total_completed_issues = 0
        for s in completed_sprints:
            # Note: This is an approximation as calculating exact for each could be slow.
            # In a real app we might store these stats. We'll compute it via DB for all completed.
            pass
            
        # Optimize: get completion stats for all completed sprints in one query
        sprint_ids = [s.id for s in completed_sprints]
        stats_query = select(
            Issue.sprint_id,
            func.count().label("total"),
            func.count(case((Issue.status.in_([IssueStatus.RESOLVED, IssueStatus.CLOSED]), 1))).label("completed")
        ).where(Issue.sprint_id.in_(sprint_ids)).group_by(Issue.sprint_id)
        
        stats_res = await db.execute(stats_query)
        stats = stats_res.all()
        
        stats_by_sprint = {row.sprint_id: row for row in stats}
        rates = []
        velos = []
        for sprint_id in sprint_ids:
            row = stats_by_sprint.get(sprint_id)
            total_issues = row.total if row else 0
            completed_issues = row.completed if row else 0
            rates.append((completed_issues / total_issues * 100) if total_issues > 0 else 0)
            velos.append(completed_issues)
            
        if rates:
            avg_comp_rate = sum(rates) / len(rates)
            avg_velocity = sum(velos) / len(velos)

    return SprintOverview(
        total_sprints=total,
        active_sprint=SprintRead.model_validate(active_sprint) if active_sprint else None,
        completed_sprints=len(completed_sprints),
        avg_completion_rate=round(avg_comp_rate, 2),
        avg_velocity=round(avg_velocity, 2),
        overdue_sprints=overdue_count
    )

async def get_sprint_analytics(db: AsyncSession, sprint_id: int) -> SprintAnalytics:
    sprint = await get_sprint_by_id(db, sprint_id)
    
    issue_query = select(
        func.count().label("total"),
        func.count(
            case((Issue.status.in_([IssueStatus.REPORTED, IssueStatus.TRIAGED, IssueStatus.ASSIGNED, IssueStatus.REOPENED]), 1))
        ).label("open"),
        func.count(
            case((Issue.status.in_([
                IssueStatus.IN_DEVELOPMENT,
                IssueStatus.IN_REVIEW,
                IssueStatus.IN_TESTING,
                IssueStatus.QA_VERIFICATION,
            ]), 1))
        ).label("in_progress"),
        func.count(case((Issue.status == IssueStatus.RESOLVED, 1))).label("resolved"),
        func.count(case((Issue.status == IssueStatus.CLOSED, 1))).label("closed"),
        func.sum(Issue.estimated_effort).label("total_effort"),
        func.sum(case((Issue.status.in_([IssueStatus.RESOLVED, IssueStatus.CLOSED]), Issue.estimated_effort), else_=0)).label("completed_effort"),
    ).select_from(Issue).where(Issue.sprint_id == sprint_id)
    
    row = (await db.execute(issue_query)).one()
    
    total = row.total or 0
    completed_issues = (row.resolved or 0) + (row.closed or 0)
    remaining_issues = (row.open or 0) + (row.in_progress or 0)
    completion_rate = round((completed_issues / total * 100.0), 2) if total > 0 else 0.0
    
    total_effort = row.total_effort or 0
    completed_effort = row.completed_effort or 0
    remaining_effort = total_effort - completed_effort

    capacity = None
    if sprint.estimated_team_members and sprint.working_days and sprint.hours_per_day:
        capacity = sprint.estimated_team_members * sprint.working_days * sprint.hours_per_day

    now = datetime.now(timezone.utc)
    is_overdue = sprint.status in _ACTIVE_STATUSES and sprint.end_date < now
    days_overdue = (now - sprint.end_date).days if is_overdue else 0
    
    sprint_health = "ON_TRACK"
    if is_overdue:
        sprint_health = "OFF_TRACK"
    elif sprint.status in _ACTIVE_STATUSES:
        days_total = max(1, (sprint.end_date - sprint.start_date).days)
        days_elapsed = (now - sprint.start_date).days
        time_elapsed_pct = max(0.0, min(1.0, days_elapsed / days_total))
        
        if total > 0:
            if completion_rate < (time_elapsed_pct * 100) - 20:
                sprint_health = "OFF_TRACK"
            elif completion_rate < (time_elapsed_pct * 100) - 10:
                sprint_health = "AT_RISK"
                
    if sprint.status in [SprintStatus.COMPLETED, SprintStatus.ARCHIVED, SprintStatus.PLANNED]:
        sprint_health = None

    # Workload: issues without an individual assignee belong to the sprint's
    # assigned tester, so tester-owned sprint work is visible in the chart.
    assigned_tester = aliased(User)
    workload_query = select(
        func.coalesce(User.id, assigned_tester.id, 0).label("developer_id"),
        func.coalesce(User.full_name, assigned_tester.full_name, "Unassigned").label("developer_name"),
        func.count().label("assigned_issues"),
        func.count(case((Issue.status.in_([IssueStatus.RESOLVED, IssueStatus.CLOSED]), 1))).label("completed_issues"),
        func.count(case((Issue.status.in_([
            IssueStatus.IN_DEVELOPMENT,
            IssueStatus.IN_REVIEW,
            IssueStatus.IN_TESTING,
            IssueStatus.QA_VERIFICATION,
        ]), 1))).label("in_progress_issues"),
        func.count(case((Issue.status.in_([IssueStatus.REPORTED, IssueStatus.TRIAGED, IssueStatus.ASSIGNED, IssueStatus.REOPENED]), 1))).label("open_issues"),
    ).select_from(Issue).outerjoin(User, Issue.assignee_id == User.id).outerjoin(
        assigned_tester, assigned_tester.id == sprint.assigned_tester_id
    ).where(Issue.sprint_id == sprint_id).group_by(
        User.id, User.full_name, assigned_tester.id, assigned_tester.full_name
    )

    wl_result = await db.execute(workload_query)
    workload = []
    for wl in wl_result.all():
        workload.append({
            "developer_id": wl.developer_id,
            "developer_name": wl.developer_name,
            "assigned_issues": wl.assigned_issues,
            "completed_issues": wl.completed_issues,
            "in_progress_issues": wl.in_progress_issues,
            "open_issues": wl.open_issues
        })

    # Real Historical Burndown Calculation
    burndown_points = []
    if sprint.status in (
        _ACTIVE_STATUSES | {SprintStatus.COMPLETED, SprintStatus.ARCHIVED}
    ) and total > 0:
        start_date_val = (sprint.actual_start_date or sprint.start_date).date()
        end_date_val = (sprint.completed_at or sprint.end_date).date()
        total_days = max(1, (end_date_val - start_date_val).days)
        today_val = now.date()
        current_cutoff = min(today_val, end_date_val) if sprint.status in _ACTIVE_STATUSES else end_date_val

        # Query all issues in this sprint with their resolution date
        issue_status_query = select(
            Issue.id,
            Issue.status,
            Issue.resolved_at,
            Issue.updated_at
        ).where(Issue.sprint_id == sprint_id)
        issues_res = await db.execute(issue_status_query)
        sprint_issues_list = issues_res.all()

        day_count = (current_cutoff - start_date_val).days
        if day_count >= 0:
            for day_idx in range(day_count + 1):
                day_date = start_date_val + timedelta(days=day_idx)
                resolved_up_to_day = 0
                for iss in sprint_issues_list:
                    if iss.status in [IssueStatus.RESOLVED, IssueStatus.CLOSED]:
                        res_date = (iss.resolved_at or iss.updated_at).date()
                        # If the issue was resolved on or before this day, count it.
                        # Also, if this is the final day of a completed sprint's chart, 
                        # count ANY resolved issue so the final drop is accurate even if resolved late.
                        if res_date <= day_date or (
                            day_idx == day_count and sprint.status in [SprintStatus.COMPLETED, SprintStatus.ARCHIVED]
                        ):
                            resolved_up_to_day += 1
                
                ideal_remaining = max(0.0, round(total - (total / total_days) * day_idx, 1))
                actual_remaining = total - resolved_up_to_day
                burndown_points.append({
                    "date": day_date.strftime("%b %d"),
                    "remaining": actual_remaining,
                    "ideal": ideal_remaining
                })

    return SprintAnalytics(
        total_issues=total,
        completed_issues=completed_issues,
        remaining_issues=remaining_issues,
        completion_rate=completion_rate,
        open_issues=row.open,
        in_progress_issues=row.in_progress,
        resolved_issues=row.resolved,
        closed_issues=row.closed,
        total_capacity_hours=capacity,
        workload=workload,
        burndown_points=burndown_points,
        sprint_health=sprint_health,
        is_overdue=is_overdue,
        days_overdue=days_overdue,
        total_estimated_effort=total_effort,
        completed_effort=completed_effort,
        remaining_effort=remaining_effort
    )


async def add_issue_to_sprint(db: AsyncSession, sprint_id: int, issue_id: int, actor: User | None = None) -> Issue:
    sprint = await get_sprint_by_id(db, sprint_id)
    result = await db.execute(select(Issue).where(Issue.id == issue_id))
    issue = result.scalar_one_or_none()
    
    if not issue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    
    if issue.project_id != sprint.project_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Issue and Sprint must belong to the same project"
        )

    issue.sprint_id = sprint.id
    
    if sprint.assigned_tester_id:
        issue.assignee_id = sprint.assigned_tester_id
        if issue.status == IssueStatus.REPORTED:
            issue.status = IssueStatus.ASSIGNED
    
    if actor:
        await create_audit_log(
            db=db, actor=actor, action=AuditAction.ISSUE_UPDATED,
            entity_type="ISSUE", entity_id=issue.id, entity_key=issue.issue_key,
            description=f"Issue added to Sprint '{sprint.name}'"
        )
        
    await db.commit()
    
    # Reload issue with relationships
    result = await db.execute(
        select(Issue)
        .options(selectinload(Issue.project), selectinload(Issue.reporter), selectinload(Issue.assignee))
        .where(Issue.id == issue_id)
    )
    return result.scalar_one()


async def remove_issue_from_sprint(db: AsyncSession, sprint_id: int, issue_id: int, actor: User | None = None) -> Issue:
    sprint = await get_sprint_by_id(db, sprint_id)
    result = await db.execute(select(Issue).where(Issue.id == issue_id))
    issue = result.scalar_one_or_none()
    
    if not issue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    
    if issue.sprint_id != sprint.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Issue is not assigned to this sprint"
        )

    issue.sprint_id = None
    if actor:
        await create_audit_log(
            db=db, actor=actor, action=AuditAction.ISSUE_UPDATED,
            entity_type="ISSUE", entity_id=issue.id, entity_key=issue.issue_key,
            description=f"Issue removed from Sprint '{sprint.name}'"
        )
        
    await db.commit()
    
    # Reload issue with relationships
    result = await db.execute(
        select(Issue)
        .options(selectinload(Issue.project), selectinload(Issue.reporter), selectinload(Issue.assignee))
        .where(Issue.id == issue_id)
    )
    return result.scalar_one()


# --------------------------------------------------------------------------- #
# Approval workflow functions                                                  #
# --------------------------------------------------------------------------- #

async def assign_tester(
    db: AsyncSession, sprint_id: int, tester_id: int, actor: User
) -> Sprint:
    """Assign a tester to a sprint. ADMIN only."""
    sprint = await get_sprint_by_id(db, sprint_id)

    # Validate tester exists and has TESTER/DEVELOPER role
    tester_result = await db.execute(select(User).where(User.id == tester_id))
    tester = tester_result.scalar_one_or_none()
    if not tester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tester user not found")
    if tester.role not in (UserRole.TESTER, UserRole.DEVELOPER):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User '{tester.full_name}' does not have TESTER or DEVELOPER role"
        )

    old_tester_id = sprint.assigned_tester_id
    sprint.assigned_tester_id = tester_id

    # Keep sprint analytics meaningful: only issues already assigned to this
    # tester in the same project are adopted when the sprint is assigned.
    unassigned_issue_result = await db.execute(
        select(Issue).where(
            Issue.project_id == sprint.project_id,
            Issue.sprint_id.is_(None),
            or_(Issue.assignee_id == tester_id, Issue.reporter_id == tester_id),
        )
    )
    for issue in unassigned_issue_result.scalars().all():
        issue.sprint_id = sprint.id

    # Ensure all issues in the sprint are actually assigned to this tester
    # so they can see and update them in the workflow.
    sprint_issues_result = await db.execute(
        select(Issue).where(Issue.sprint_id == sprint.id)
    )
    for issue in sprint_issues_result.scalars().all():
        issue.assignee_id = tester_id
        if issue.status == IssueStatus.REPORTED:
            issue.status = IssueStatus.ASSIGNED

    # Move PLANNED → ACTIVE automatically when tester is assigned
    if sprint.status == SprintStatus.PLANNED:
        sprint.status = SprintStatus.ACTIVE
        sprint.actual_start_date = datetime.now(timezone.utc)

    await create_audit_log(
        db=db, actor=actor, action=AuditAction.SPRINT_TESTER_ASSIGNED,
        entity_type="SPRINT", entity_id=sprint.id, entity_key=sprint.name,
        description=f"Sprint '{sprint.name}' assigned to tester '{tester.full_name}'",
        old_values={"assigned_tester_id": old_tester_id},
        new_values={"assigned_tester_id": tester_id, "tester_name": tester.full_name},
    )

    notifications = await notification_service.notify_users(
        db=db,
        user_ids=[tester_id],
        notification_type=NotificationType.SPRINT_STARTED,
        title="Assigned to new sprint",
        message=f"You have been assigned to sprint '{sprint.name}'.",
        actor_id=actor.id,
        entity_type="SPRINT",
        entity_id=sprint.id,
        entity_key=sprint.name,
    )

    await db.commit()

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
        await ws_manager.send_personal_notification(notif.user_id, payload)

    return await get_sprint_by_id(db, sprint.id)


async def submit_for_approval(db: AsyncSession, sprint_id: int, actor: User) -> Sprint:
    """Tester submits a sprint for admin review."""
    sprint = await get_sprint_by_id(db, sprint_id)

    # Must be the assigned tester (or an admin acting on behalf)
    if actor.role == UserRole.TESTER and sprint.assigned_tester_id != actor.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not the assigned tester for this sprint"
        )

    # Only IN_PROGRESS → READY_FOR_APPROVAL is allowed.
    # Tester must first use "Begin Work" (ACTIVE → IN_PROGRESS) before submitting.
    if sprint.status != SprintStatus.IN_PROGRESS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Sprint cannot be submitted for approval from status '{sprint.status.value}'. "
                "Use 'Begin Work' first to move the sprint to IN_PROGRESS."
            )
        )

    old_status = sprint.status
    sprint.status = SprintStatus.READY_FOR_APPROVAL
    sprint.submitted_by_id = actor.id
    sprint.submitted_at = datetime.now(timezone.utc)
    sprint.review_comment = None  # clear previous rejection comment

    await create_audit_log(
        db=db, actor=actor, action=AuditAction.SPRINT_SUBMITTED_FOR_APPROVAL,
        entity_type="SPRINT", entity_id=sprint.id, entity_key=sprint.name,
        description=f"Tester '{actor.full_name}' submitted sprint '{sprint.name}' for admin approval",
        old_values={"status": old_status.value},
        new_values={"status": SprintStatus.READY_FOR_APPROVAL.value, "submitted_by": actor.full_name},
    )
    await db.commit()
    return await get_sprint_by_id(db, sprint.id)


async def approve_sprint(db: AsyncSession, sprint_id: int, actor: User) -> Sprint:
    """Admin approves a READY_FOR_APPROVAL sprint → COMPLETED."""
    sprint = await get_sprint_by_id(db, sprint_id)

    if sprint.status != SprintStatus.READY_FOR_APPROVAL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Sprint must be READY_FOR_APPROVAL to approve. Current status: '{sprint.status.value}'"
        )

    old_status = sprint.status
    sprint.status = SprintStatus.COMPLETED
    sprint.approved_by_id = actor.id
    sprint.approved_at = datetime.now(timezone.utc)
    sprint.completed_at = datetime.now(timezone.utc)

    await create_audit_log(
        db=db, actor=actor, action=AuditAction.SPRINT_APPROVED,
        entity_type="SPRINT", entity_id=sprint.id, entity_key=sprint.name,
        description=f"Admin '{actor.full_name}' approved sprint '{sprint.name}'",
        old_values={"status": old_status.value},
        new_values={"status": SprintStatus.COMPLETED.value, "approved_by": actor.full_name},
    )
    await db.commit()
    return await get_sprint_by_id(db, sprint.id)


async def request_changes(
    db: AsyncSession, sprint_id: int, comment: str | None, actor: User
) -> Sprint:
    """Admin requests changes on a READY_FOR_APPROVAL sprint → IN_PROGRESS."""
    sprint = await get_sprint_by_id(db, sprint_id)

    if sprint.status != SprintStatus.READY_FOR_APPROVAL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Sprint must be READY_FOR_APPROVAL to request changes. Current status: '{sprint.status.value}'"
        )

    old_status = sprint.status
    sprint.status = SprintStatus.IN_PROGRESS
    sprint.review_comment = comment

    await create_audit_log(
        db=db, actor=actor, action=AuditAction.SPRINT_CHANGES_REQUESTED,
        entity_type="SPRINT", entity_id=sprint.id, entity_key=sprint.name,
        description=f"Admin '{actor.full_name}' requested changes on sprint '{sprint.name}'",
        old_values={"status": old_status.value},
        new_values={"status": SprintStatus.IN_PROGRESS.value, "review_comment": comment},
    )
    await db.commit()
    return await get_sprint_by_id(db, sprint.id)


async def get_assigned_sprints_for_tester(
    db: AsyncSession, tester_id: int
) -> Sequence[Sprint]:
    """Return all sprints assigned to a specific tester, ordered by most recent first."""
    result = await db.execute(
        select(Sprint)
        .options(
            selectinload(Sprint.assigned_tester),
            selectinload(Sprint.submitted_by),
            selectinload(Sprint.approved_by),
        )
        .where(Sprint.assigned_tester_id == tester_id)
        .order_by(Sprint.updated_at.desc())
    )
    return result.scalars().all()


async def get_sprints_awaiting_approval(db: AsyncSession) -> Sequence[Sprint]:
    """Return all sprints in READY_FOR_APPROVAL status, oldest submission first."""
    result = await db.execute(
        select(Sprint)
        .options(
            selectinload(Sprint.assigned_tester),
            selectinload(Sprint.submitted_by),
            selectinload(Sprint.approved_by),
        )
        .where(Sprint.status == SprintStatus.READY_FOR_APPROVAL)
        .order_by(Sprint.submitted_at.asc())
    )
    return result.scalars().all()


async def begin_work(
    db: AsyncSession, sprint_id: int, actor: User
) -> Sprint:
    """Tester begins work on an ACTIVE sprint → IN_PROGRESS."""
    sprint = await get_sprint_by_id(db, sprint_id)

    # Only the assigned tester (or admin) may begin work
    if actor.role == UserRole.TESTER and sprint.assigned_tester_id != actor.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not the assigned tester for this sprint"
        )

    if sprint.status != SprintStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Sprint must be ACTIVE to begin work. Current status: '{sprint.status.value}'"
        )

    old_status = sprint.status
    sprint.status = SprintStatus.IN_PROGRESS

    # Auto-progress all ASSIGNED issues to IN_DEVELOPMENT when the sprint begins.
    # This ensures graphs (Pie chart, Workload) instantly reflect the active work state!
    sprint_issues_result = await db.execute(
        select(Issue).where(Issue.sprint_id == sprint.id, Issue.status == IssueStatus.ASSIGNED)
    )
    for issue in sprint_issues_result.scalars().all():
        issue.status = IssueStatus.IN_DEVELOPMENT

    await create_audit_log(
        db=db, actor=actor, action=AuditAction.SPRINT_UPDATED,
        entity_type="SPRINT", entity_id=sprint.id, entity_key=sprint.name,
        description=f"Tester '{actor.full_name}' began work on sprint '{sprint.name}', auto-progressing its issues.",
        old_values={"status": old_status.value},
        new_values={"status": SprintStatus.IN_PROGRESS.value},
    )
    await db.commit()
    return await get_sprint_by_id(db, sprint.id)
