from typing import Sequence
from fastapi import APIRouter, Depends, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.responses import StreamingResponse

from app.database.session import get_db
from app.dependencies.auth import get_current_user, require_role
from app.models.user import User, UserRole
from app.schemas.sprint import (
    SprintCreate, SprintRead, SprintUpdate, SprintAnalytics, SprintExtend,
    SprintOverview, SprintAssignTester, SprintRequestChanges,
)
from app.schemas.issue import IssueDetailResponse
from app.services import sprint_service
from app.services.pdf_service import generate_sprint_report

router = APIRouter(prefix="/sprints", tags=["Sprints"])


@router.post("", response_model=SprintRead, status_code=status.HTTP_201_CREATED)
async def create_sprint(
    sprint_in: SprintCreate,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Create a new sprint. ADMIN only."""
    return await sprint_service.create_sprint(db, sprint_in, actor=current_user)


@router.get("/project/{project_id}", response_model=list[SprintRead])
async def get_sprints_by_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all sprints for a project. Any authenticated user."""
    return await sprint_service.get_sprints_for_project(db, project_id)

@router.get("/project/{project_id}/summary", response_model=SprintOverview)
async def get_project_sprint_summary(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get high-level summary of sprint metrics for a project."""
    return await sprint_service.get_project_sprint_summary(db, project_id)


@router.patch("/{sprint_id}", response_model=SprintRead)
async def update_sprint(
    sprint_id: int,
    sprint_in: SprintUpdate,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Update a sprint. ADMIN only."""
    return await sprint_service.update_sprint(db, sprint_id, sprint_in, actor=current_user)


@router.post("/{sprint_id}/start", response_model=SprintRead)
async def start_sprint(
    sprint_id: int,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Start a sprint. ADMIN only."""
    return await sprint_service.start_sprint(db, sprint_id, actor=current_user)


@router.post("/{sprint_id}/complete", response_model=SprintRead)
async def complete_sprint(
    sprint_id: int,
    move_remaining_to_sprint_id: int | None = Query(None, description="Optional sprint ID to move remaining issues to"),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Complete a sprint. ADMIN only."""
    return await sprint_service.complete_sprint(db, sprint_id, move_remaining_to_sprint_id, actor=current_user)

@router.post("/{sprint_id}/archive", response_model=SprintRead)
async def archive_sprint(
    sprint_id: int,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Archive a completed sprint. ADMIN only."""
    return await sprint_service.archive_sprint(db, sprint_id, actor=current_user)

@router.post("/{sprint_id}/extend", response_model=SprintRead)
async def extend_sprint(
    sprint_id: int,
    extend_in: SprintExtend,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Extend a sprint. ADMIN only."""
    return await sprint_service.extend_sprint(db, sprint_id, extend_in.new_end_date, actor=current_user)

@router.delete("/{sprint_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sprint(
    sprint_id: int,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Delete a planned/empty sprint. ADMIN only."""
    await sprint_service.delete_sprint(db, sprint_id, actor=current_user)


@router.get("/{sprint_id}/analytics", response_model=SprintAnalytics)
async def get_sprint_analytics(
    sprint_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get real-time analytics for a sprint. Any authenticated user."""
    return await sprint_service.get_sprint_analytics(db, sprint_id)


@router.get("/{sprint_id}/report")
async def download_sprint_report(
    sprint_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download sprint report as PDF."""
    sprint = await sprint_service.get_sprint_by_id(db, sprint_id)
    analytics = await sprint_service.get_sprint_analytics(db, sprint_id)
    
    pdf_buffer = generate_sprint_report(sprint, analytics, generated_by=current_user)
    
    date_str = (sprint.completed_at or sprint.start_date).strftime("%Y-%m-%d")
    filename = f"BugTracker_Sprint_Report_{sprint.name.replace(' ', '_')}_{date_str}.pdf"
    
    return StreamingResponse(
        pdf_buffer, 
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.post("/{sprint_id}/issues/{issue_id}", response_model=IssueDetailResponse)
async def add_issue_to_sprint(
    sprint_id: int,
    issue_id: int,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Add an issue to a sprint. ADMIN only."""
    return await sprint_service.add_issue_to_sprint(db, sprint_id, issue_id, actor=current_user)


@router.delete("/{sprint_id}/issues/{issue_id}", response_model=IssueDetailResponse)
async def remove_issue_from_sprint(
    sprint_id: int,
    issue_id: int,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Remove an issue from a sprint. ADMIN only."""
    return await sprint_service.remove_issue_from_sprint(db, sprint_id, issue_id, actor=current_user)


# --------------------------------------------------------------------------- #
# Mentor-required alias: /sprints/{id}/add-issue/{issue_id}                    #
# (existing route uses /sprints/{id}/issues/{issue_id})                        #
# --------------------------------------------------------------------------- #

@router.post("/{sprint_id}/add-issue/{issue_id}", response_model=IssueDetailResponse)
async def add_issue_to_sprint_alias(
    sprint_id: int,
    issue_id: int,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """[Alias] Add an issue to a sprint using mentor-required path format. ADMIN only."""
    return await sprint_service.add_issue_to_sprint(db, sprint_id, issue_id, actor=current_user)


# --------------------------------------------------------------------------- #
# Sprint Approval Workflow                                                      #
# --------------------------------------------------------------------------- #

@router.post("/{sprint_id}/assign-tester", response_model=SprintRead)
async def assign_tester(
    sprint_id: int,
    body: SprintAssignTester,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Assign a tester to a sprint. Moves PLANNED → ACTIVE automatically. ADMIN only."""
    return await sprint_service.assign_tester(db, sprint_id, body.tester_id, actor=current_user)


@router.post("/{sprint_id}/submit-for-approval", response_model=SprintRead)
async def submit_for_approval(
    sprint_id: int,
    current_user: User = Depends(require_role(UserRole.TESTER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Tester submits a sprint for admin approval. Moves IN_PROGRESS → READY_FOR_APPROVAL."""
    return await sprint_service.submit_for_approval(db, sprint_id, actor=current_user)


@router.post("/{sprint_id}/begin-work", response_model=SprintRead)
async def begin_work(
    sprint_id: int,
    current_user: User = Depends(require_role(UserRole.TESTER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Tester begins work on an ACTIVE sprint. Moves ACTIVE → IN_PROGRESS. TESTER/ADMIN only."""
    return await sprint_service.begin_work(db, sprint_id, actor=current_user)


@router.post("/{sprint_id}/approve", response_model=SprintRead)
async def approve_sprint(
    sprint_id: int,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Admin approves a sprint. Moves READY_FOR_APPROVAL → COMPLETED. ADMIN only."""
    return await sprint_service.approve_sprint(db, sprint_id, actor=current_user)


@router.post("/{sprint_id}/request-changes", response_model=SprintRead)
async def request_changes(
    sprint_id: int,
    body: SprintRequestChanges,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Admin requests changes. Moves READY_FOR_APPROVAL → IN_PROGRESS. ADMIN only."""
    return await sprint_service.request_changes(db, sprint_id, body.comment, actor=current_user)


@router.get("/assigned", response_model=list[SprintRead])
async def get_assigned_sprints(
    current_user: User = Depends(require_role(UserRole.TESTER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Get all sprints assigned to the current tester."""
    return await sprint_service.get_assigned_sprints_for_tester(db, current_user.id)


@router.get("/awaiting-approval", response_model=list[SprintRead])
async def get_awaiting_approval(
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Get all sprints pending admin approval. ADMIN only."""
    return await sprint_service.get_sprints_awaiting_approval(db)
