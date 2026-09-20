from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field
from app.models.sprint import SprintStatus


class SprintBase(BaseModel):
    name: str = Field(..., max_length=200, example="Sprint 1")
    goal: str | None = Field(None, example="Finish login flow")
    start_date: datetime
    end_date: datetime
    estimated_team_members: int | None = Field(None, ge=1)
    working_days: int | None = Field(None, ge=1)
    hours_per_day: int | None = Field(None, ge=1)
    goal_status: str = Field("NOT_STARTED", max_length=50)


class SprintCreate(SprintBase):
    project_id: int
    issue_ids: list[int] | None = Field(None, description="Issues to assign to sprint on creation")


class SprintUpdate(BaseModel):
    name: str | None = Field(None, max_length=200)
    goal: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    status: SprintStatus | None = None
    estimated_team_members: int | None = None
    working_days: int | None = None
    hours_per_day: int | None = None
    goal_status: str | None = Field(None, max_length=50)

class SprintExtend(BaseModel):
    new_end_date: datetime


# ── Approval workflow request schemas ─────────────────────────────────────────

class SprintAssignTester(BaseModel):
    tester_id: int = Field(..., description="ID of the TESTER user to assign")


class SprintRequestChanges(BaseModel):
    comment: str | None = Field(None, max_length=2000, description="Optional reason/feedback for the tester")


# ── Read schema ───────────────────────────────────────────────────────────────

class SprintRead(SprintBase):
    id: int
    project_id: int
    status: SprintStatus
    actual_start_date: datetime | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    # Approval workflow fields
    assigned_tester_id: int | None = None
    assigned_tester_name: str | None = None   # resolved from relationship
    submitted_by_id: int | None = None
    submitted_at: datetime | None = None
    approved_by_id: int | None = None
    approved_at: datetime | None = None
    review_comment: str | None = None

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def model_validate(cls, obj, **kwargs):
        # Resolve related user names if ORM object without triggering lazy IO
        instance = super().model_validate(obj, **kwargs)
        try:
            if hasattr(obj, "__dict__"):
                tester = obj.__dict__.get("assigned_tester")
                if tester and hasattr(tester, "full_name"):
                    instance.assigned_tester_name = tester.full_name
        except Exception:
            pass
        return instance


class SprintAnalytics(BaseModel):
    total_issues: int
    completed_issues: int
    remaining_issues: int
    completion_rate: float
    open_issues: int
    in_progress_issues: int
    resolved_issues: int
    closed_issues: int
    total_capacity_hours: int | None
    workload: list[dict]
    burndown_points: list[dict]
    sprint_health: str | None = None
    is_overdue: bool = False
    days_overdue: int = 0
    total_estimated_effort: int = 0
    completed_effort: int = 0
    remaining_effort: int = 0

class SprintOverview(BaseModel):
    total_sprints: int
    active_sprint: SprintRead | None
    completed_sprints: int
    avg_completion_rate: float
    avg_velocity: float
    overdue_sprints: int

