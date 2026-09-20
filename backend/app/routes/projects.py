"""
Project management routes — Phase 4.

RBAC:
  POST   /projects                    → ADMIN
  GET    /projects                    → ADMIN, DEVELOPER, TESTER (all authenticated)
  GET    /projects/{id}               → ADMIN, DEVELOPER, TESTER
  PATCH  /projects/{id}               → ADMIN
  PATCH  /projects/{id}/deactivate    → ADMIN
"""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.dependencies.auth import get_current_user, require_role
from app.models.project import ProjectStatus
from app.models.user import User, UserRole
from app.schemas.project import (
    ProjectCreate,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdate,
)
from app.services import project_service

router = APIRouter(prefix="/projects", tags=["Projects"])


@router.post(
    "",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a project",
)
async def create_project(
    body: ProjectCreate,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> ProjectResponse:
    """Create a new project. **ADMIN only.**"""
    return await project_service.create_project(body, db, actor=current_user)


@router.get(
    "",
    response_model=ProjectListResponse,
    summary="List projects",
)
async def list_projects(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: ProjectStatus | None = Query(None, description="Filter by project status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectListResponse:
    """List all projects. Visible to all authenticated users."""
    return await project_service.list_projects(db, page=page, page_size=page_size, status=status)


@router.get(
    "/{project_id}",
    response_model=ProjectResponse,
    summary="Get project by ID",
)
async def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectResponse:
    """Retrieve a project by ID. Visible to all authenticated users."""
    return await project_service.get_project(project_id, db)


@router.patch(
    "/{project_id}",
    response_model=ProjectResponse,
    summary="Update a project",
)
async def update_project(
    project_id: int,
    body: ProjectUpdate,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> ProjectResponse:
    """Partially update project details. **ADMIN only.**"""
    return await project_service.update_project(project_id, body, db, actor=current_user)


@router.patch(
    "/{project_id}/deactivate",
    response_model=ProjectResponse,
    summary="Deactivate a project",
)
async def deactivate_project(
    project_id: int,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> ProjectResponse:
    """Set a project to INACTIVE status. **ADMIN only.**"""
    return await project_service.deactivate_project(project_id, db, actor=current_user)
