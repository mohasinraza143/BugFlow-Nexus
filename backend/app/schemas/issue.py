"""
Pydantic schemas for the Issue / Defect resource.

Phase 4 — request and response models.
Enums are imported from the model to avoid duplication.
"""

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.issue import IssueStatus, IssueType, Priority, Severity


# --------------------------------------------------------------------------- #
# Embedded sub-schemas (used inside IssueDetailResponse)                      #
# --------------------------------------------------------------------------- #

class UserBrief(BaseModel):
    """Minimal user info embedded in issue responses — NO password_hash."""

    id: int
    full_name: str
    email: str
    role: str

    model_config = {"from_attributes": True}


class ProjectBrief(BaseModel):
    """Minimal project info embedded in issue responses."""

    id: int
    project_key: str
    name: str

    model_config = {"from_attributes": True}


# --------------------------------------------------------------------------- #
# Request schemas                                                              #
# --------------------------------------------------------------------------- #

class IssueCreate(BaseModel):
    """Payload to report a new defect. TESTER only."""

    project_id: int
    title: str = Field(..., min_length=5, max_length=500)
    description: str = Field(..., min_length=10)
    issue_type: IssueType = IssueType.BUG
    severity: Severity = Severity.MAJOR
    priority: Priority = Priority.MEDIUM
    environment: str | None = Field(None, max_length=200)
    steps_to_reproduce: str | None = None
    expected_result: str | None = None
    actual_result: str | None = None
    sprint_id: int | None = None
    estimated_effort: int | None = None

    @field_validator("title", mode="before")
    @classmethod
    def strip_title(cls, v: str) -> str:
        return v.strip()


class IssueUpdate(BaseModel):
    """Fields a TESTER can update on their own reported issue."""

    title: str | None = Field(None, min_length=5, max_length=500)
    description: str | None = Field(None, min_length=10)
    severity: Severity | None = None
    priority: Priority | None = None
    environment: str | None = Field(None, max_length=200)
    steps_to_reproduce: str | None = None
    expected_result: str | None = None
    actual_result: str | None = None
    sprint_id: int | None = None
    estimated_effort: int | None = None

    @field_validator("title", mode="before")
    @classmethod
    def strip_title(cls, v: str | None) -> str | None:
        return v.strip() if v else v


class IssueAssign(BaseModel):
    """Payload for ADMIN to assign an issue to a developer."""

    developer_id: int


class IssueStatusUpdate(BaseModel):
    """Payload for DEVELOPER to change their issue status."""

    status: IssueStatus


class IssueResolve(BaseModel):
    """Payload for DEVELOPER to mark an issue as resolved."""

    resolution_summary: str = Field(..., min_length=10)
    resolution_notes: str | None = None  # stored in resolution_summary if provided


class IssueReopen(BaseModel):
    """Payload for TESTER or ADMIN to reopen an issue."""

    reason: str | None = Field(None, max_length=1000)


# --------------------------------------------------------------------------- #
# Response schemas                                                             #
# --------------------------------------------------------------------------- #

class IssueResponse(BaseModel):
    """Compact issue representation for list endpoints."""

    id: int
    issue_key: str
    title: str
    issue_type: IssueType
    severity: Severity
    priority: Priority
    status: IssueStatus
    project_id: int
    reporter_id: int
    assignee_id: int | None
    sprint_id: int | None
    estimated_effort: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class IssueDetailResponse(BaseModel):
    """Full issue detail including related objects."""

    id: int
    issue_key: str
    title: str
    description: str
    issue_type: IssueType
    severity: Severity
    priority: Priority
    status: IssueStatus
    environment: str | None
    steps_to_reproduce: str | None
    expected_result: str | None
    actual_result: str | None
    resolution_summary: str | None
    resolved_at: datetime | None
    project: ProjectBrief
    reporter: UserBrief
    assignee: UserBrief | None
    sprint_id: int | None
    estimated_effort: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class IssueListResponse(BaseModel):
    """Paginated list of issues."""

    items: list[IssueResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
