"""
Pydantic schemas for the Project resource.

Request and response models for Phase 4 project management API.
"""

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.project import ProjectStatus


# --------------------------------------------------------------------------- #
# Request schemas                                                              #
# --------------------------------------------------------------------------- #

class ProjectCreate(BaseModel):
    """Payload to create a new project. ADMIN only."""

    name: str = Field(..., min_length=1, max_length=200, description="Human-readable project name")
    project_key: str = Field(
        ...,
        min_length=2,
        max_length=20,
        pattern=r"^[A-Z][A-Z0-9_-]{1,19}$",
        description="Short unique key (e.g. PROJ, DM-CORE). Uppercase letters, digits, hyphens, underscores.",
    )
    description: str | None = Field(None, max_length=5000)
    status: ProjectStatus = ProjectStatus.ACTIVE

    @field_validator("project_key", mode="before")
    @classmethod
    def uppercase_key(cls, v: str) -> str:
        return v.upper().strip()

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, v: str) -> str:
        return v.strip()


class ProjectUpdate(BaseModel):
    """Fields that can be updated on an existing project. ADMIN only."""

    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = Field(None, max_length=5000)
    status: ProjectStatus | None = None

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, v: str | None) -> str | None:
        return v.strip() if v else v


# --------------------------------------------------------------------------- #
# Response schemas                                                             #
# --------------------------------------------------------------------------- #

class ProjectResponse(BaseModel):
    """Public representation of a project."""

    id: int
    project_key: str
    name: str
    description: str | None
    status: ProjectStatus
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectListResponse(BaseModel):
    """Paginated list of projects."""

    items: list[ProjectResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
