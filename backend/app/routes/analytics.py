"""
Analytics and reporting routes — Phase 9.

Endpoints:
  GET /analytics/overview                     → ADMIN only
  GET /analytics/issues/status-distribution   → Authenticated (RBAC scoped)
  GET /analytics/issues/severity-distribution → Authenticated (RBAC scoped)
  GET /analytics/issues/trends                → Authenticated (RBAC scoped)
  GET /analytics/projects                     → Authenticated (RBAC scoped)
  GET /analytics/reports/issues/export        → Authenticated (RBAC scoped, CSV)
  GET /analytics/developers                   → ADMIN only
  GET /analytics/projects/{project_id}        → Authenticated (RBAC scoped)

Static routes are declared before dynamic routes to prevent route collisions.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.dependencies.auth import get_current_user, require_role
from app.models.issue import IssueStatus, Severity
from app.models.user import User, UserRole
from app.schemas.analytics import (
    DeveloperAnalyticsResponse,
    DeveloperWorkloadResponse,
    IssueStatusDistributionResponse,
    IssueTrendResponse,
    ProjectAnalyticsListResponse,
    ProjectAnalyticsResponse,
    SeverityDistributionResponse,
    PriorityDistributionResponse,
    SystemAnalyticsResponse,
    AnalyticsReportDataResponse,
    QualityMetricsResponse,
)
from app.services import analytics_service

router = APIRouter(prefix="/analytics", tags=["Analytics"])

_ADMIN = Depends(require_role(UserRole.ADMIN))


# --------------------------------------------------------------------------- #
# 1. System Overview (Admin Only)                                              #
# --------------------------------------------------------------------------- #

@router.get(
    "/overview",
    response_model=SystemAnalyticsResponse,
    summary="System analytics overview",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "ADMIN access required"},
    },
)
async def system_overview(
    start_date: datetime | None = Query(None, description="Filter by start date (ISO-8601)"),
    end_date: datetime | None = Query(None, description="Filter by end date (ISO-8601)"),
    current_user: User = _ADMIN,
    db: AsyncSession = Depends(get_db),
) -> SystemAnalyticsResponse:
    """Return high-level system metrics across users, projects, and issues.

    **ADMIN only.**
    """
    return await analytics_service.get_system_overview(db, start_date=start_date, end_date=end_date)


# --------------------------------------------------------------------------- #
# 2. Status Distribution                                                      #
# --------------------------------------------------------------------------- #

@router.get(
    "/issues/status-distribution",
    response_model=IssueStatusDistributionResponse,
    summary="Issue status distribution",
)
async def issue_status_distribution(
    project_id: int | None = Query(None, description="Filter by project ID"),
    start_date: datetime | None = Query(None, description="Filter by start date (ISO-8601)"),
    end_date: datetime | None = Query(None, description="Filter by end date (ISO-8601)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IssueStatusDistributionResponse:
    """Return status distribution counts applying RBAC visibility rules."""
    return await analytics_service.get_status_distribution(
        db=db,
        current_user=current_user,
        project_id=project_id,
        start_date=start_date,
        end_date=end_date,
    )


# --------------------------------------------------------------------------- #
# 3. Severity Distribution                                                    #
# --------------------------------------------------------------------------- #

@router.get(
    "/issues/severity-distribution",
    response_model=SeverityDistributionResponse,
    summary="Issue severity distribution",
)
async def issue_severity_distribution(
    project_id: int | None = Query(None, description="Filter by project ID"),
    start_date: datetime | None = Query(None, description="Filter by start date (ISO-8601)"),
    end_date: datetime | None = Query(None, description="Filter by end date (ISO-8601)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SeverityDistributionResponse:
    """Return severity distribution counts applying RBAC visibility rules."""
    return await analytics_service.get_severity_distribution(
        db=db,
        current_user=current_user,
        project_id=project_id,
        start_date=start_date,
        end_date=end_date,
    )


# --------------------------------------------------------------------------- #
# 3b. Priority Distribution                                                   #
# --------------------------------------------------------------------------- #

@router.get(
    "/issues/priority-distribution",
    response_model=PriorityDistributionResponse,
    summary="Issue priority distribution",
)
async def issue_priority_distribution(
    project_id: int | None = Query(None, description="Filter by project ID"),
    start_date: datetime | None = Query(None, description="Filter by start date (ISO-8601)"),
    end_date: datetime | None = Query(None, description="Filter by end date (ISO-8601)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PriorityDistributionResponse:
    """Return priority distribution counts applying RBAC visibility rules."""
    return await analytics_service.get_priority_distribution(
        db=db,
        current_user=current_user,
        project_id=project_id,
        start_date=start_date,
        end_date=end_date,
    )


# --------------------------------------------------------------------------- #
# 4. Issue Trends                                                              #
# --------------------------------------------------------------------------- #

@router.get(
    "/issues/trends",
    response_model=IssueTrendResponse,
    summary="Issue trends over time",
)
async def issue_trends(
    interval: str = Query("day", description="Aggregation interval: day, week, or month"),
    project_id: int | None = Query(None, description="Filter by project ID"),
    start_date: datetime | None = Query(None, description="Filter by start date (ISO-8601)"),
    end_date: datetime | None = Query(None, description="Filter by end date (ISO-8601)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IssueTrendResponse:
    """Return time-series creation and resolution trend metrics."""
    return await analytics_service.get_issue_trends(
        db=db,
        current_user=current_user,
        interval=interval,
        project_id=project_id,
        start_date=start_date,
        end_date=end_date,
    )


# --------------------------------------------------------------------------- #
# 5. All Projects Analytics (STATIC ROUTE)                                     #
# --------------------------------------------------------------------------- #

@router.get(
    "/projects",
    response_model=ProjectAnalyticsListResponse,
    summary="All projects analytics",
)
async def all_projects_analytics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectAnalyticsListResponse:
    """Return issue metrics and resolution rate for all projects."""
    return await analytics_service.get_all_projects_analytics(
        db=db,
        current_user=current_user,
    )


# --------------------------------------------------------------------------- #
# 6. CSV Export (STATIC ROUTE)                                                 #
# --------------------------------------------------------------------------- #

@router.get(
    "/reports/issues/export",
    summary="Export issues report as CSV",
    response_class=Response,
    responses={
        200: {
            "content": {"text/csv": {}},
            "description": "Returns issues as a downloadable CSV file.",
        }
    },
)
async def export_issues_report(
    project_id: int | None = Query(None, description="Filter by project ID"),
    status: IssueStatus | None = Query(None, description="Filter by status"),
    severity: Severity | None = Query(None, description="Filter by severity"),
    start_date: datetime | None = Query(None, description="Filter by start date (ISO-8601)"),
    end_date: datetime | None = Query(None, description="Filter by end date (ISO-8601)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Export filtered issues visible to the requester in RFC 4180 CSV format."""
    return await analytics_service.export_issues_csv(
        db=db,
        current_user=current_user,
        project_id=project_id,
        status_filter=status,
        severity_filter=severity,
        start_date=start_date,
        end_date=end_date,
    )


# --------------------------------------------------------------------------- #
# 7. Developer Performance (STATIC ROUTE - Admin Only)                         #
# --------------------------------------------------------------------------- #

@router.get(
    "/developers",
    response_model=DeveloperAnalyticsResponse,
    summary="Developer performance metrics",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "ADMIN access required"},
    },
)
async def developer_performance(
    start_date: datetime | None = Query(None, description="Filter by start date (ISO-8601)"),
    end_date: datetime | None = Query(None, description="Filter by end date (ISO-8601)"),
    current_user: User = _ADMIN,
    db: AsyncSession = Depends(get_db),
) -> DeveloperAnalyticsResponse:
    """Return workload, resolution rates, and resolution speed for developers.

    **ADMIN only.**
    """
    return await analytics_service.get_developer_performance(db, start_date=start_date, end_date=end_date)


@router.get(
    "/developer-workload",
    response_model=DeveloperWorkloadResponse,
    summary="Developer workload and MTTR matrix",
)
async def developer_workload(
    current_user: User = _ADMIN,
    db: AsyncSession = Depends(get_db),
) -> DeveloperWorkloadResponse:
    """Return active tasks, completed fixes, team, and average MTTR per developer."""
    return await analytics_service.get_developer_workload(db)


# --------------------------------------------------------------------------- #
# 8. Single Project Analytics (DYNAMIC ROUTE)                                  #
# --------------------------------------------------------------------------- #

@router.get(
    "/projects/{project_id}",
    response_model=ProjectAnalyticsResponse,
    summary="Single project analytics",
    responses={
        404: {"description": "Project not found"},
    },
)
async def single_project_analytics(
    project_id: int,
    start_date: datetime | None = Query(None, description="Filter by start date (ISO-8601)"),
    end_date: datetime | None = Query(None, description="Filter by end date (ISO-8601)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectAnalyticsResponse:
    """Return issue metrics and resolution rate for a specific project."""
    return await analytics_service.get_project_analytics(
        project_id=project_id,
        db=db,
        current_user=current_user,
        start_date=start_date,
        end_date=end_date,
    )


# --------------------------------------------------------------------------- #
# 9. Downloadable Report (ADMIN Only)                                          #
# --------------------------------------------------------------------------- #

@router.get(
    "/report/download",
    response_model=AnalyticsReportDataResponse,
    summary="Download aggregated analytics report data",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "ADMIN access required"},
    },
)
async def download_report_data(
    period: str = Query(..., description="Report period: 1d, 7d, 30d"),
    current_user: User = _ADMIN,
    db: AsyncSession = Depends(get_db),
) -> AnalyticsReportDataResponse:
    """Return consolidated data for generating a PDF report.

    **ADMIN only.**
    """
    from datetime import timedelta, timezone
    
    end_date = datetime.now(timezone.utc)
    if period == "1d":
        start_date = end_date - timedelta(days=1)
        trend_interval = "day"
    elif period == "7d":
        start_date = end_date - timedelta(days=7)
        trend_interval = "day"
    elif period == "30d":
        start_date = end_date - timedelta(days=30)
        trend_interval = "week"
    else:
        start_date = end_date - timedelta(days=1)
        trend_interval = "day"

    import asyncio

    (
        overview,
        status_dist,
        severity_dist,
        priority_dist,
        trends,
        projects,
        developers,
    ) = await asyncio.gather(
        analytics_service.get_system_overview(db, start_date=start_date, end_date=end_date),
        analytics_service.get_status_distribution(db, current_user, None, start_date, end_date),
        analytics_service.get_severity_distribution(db, current_user, None, start_date, end_date),
        analytics_service.get_priority_distribution(db, current_user, None, start_date, end_date),
        analytics_service.get_issue_trends(db, current_user, trend_interval, None, start_date, end_date),
        analytics_service.get_all_projects_analytics(db, current_user, start_date=start_date, end_date=end_date),
        analytics_service.get_developer_performance(db, start_date=start_date, end_date=end_date),
    )

    return AnalyticsReportDataResponse(
        system_overview=overview,
        status_distribution=status_dist,
        severity_distribution=severity_dist,
        priority_distribution=priority_dist,
        trends=trends,
        project_analytics=projects.items,
        developer_performance=developers.items,
        generated_at=end_date.isoformat(),
    )


# --------------------------------------------------------------------------- #
# 10. Quality Metrics (Milestone 2)                                            #
# --------------------------------------------------------------------------- #

@router.get(
    "/quality-metrics",
    response_model=QualityMetricsResponse,
    summary="Quality Metrics: Fix Rate, MTTR, Defect Leakage, Backlog Health",
    description=(
        "Computes four quality KPIs from live data:\n"
        "- **Fix Rate**: % of all issues that are resolved or closed\n"
        "- **MTTR**: Mean Time To Resolve in hours\n"
        "- **Defect Leakage Rate**: % of critical/blocker issues that were reopened\n"
        "- **Backlog Health Score**: composite 0–100 score (100 = healthy)\n\n"
        "Respects RBAC — ADMINs see system-wide metrics, others see their own scope."
    ),
)
async def quality_metrics(
    project_id: int | None = Query(None, description="Filter by project ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QualityMetricsResponse:
    """Return Fix Rate, MTTR, Defect Leakage, and Backlog Health Score."""
    return await analytics_service.get_quality_metrics(
        db=db,
        current_user=current_user,
        project_id=project_id,
    )


# --------------------------------------------------------------------------- #
# 11. Defect Trends — last 14 days (Mentor requirement)                        #
# --------------------------------------------------------------------------- #

@router.get(
    "/defect-trends",
    summary="Defect trends — last 14 days (new vs resolved per day)",
    description=(
        "Returns day-by-day counts of new bugs reported and bugs resolved "
        "over the last 14 days. Used by the Plotly Defect Trend Line Chart."
    ),
)
async def defect_trends(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return 14-day defect trend data for Plotly charts."""
    from datetime import timedelta, timezone
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=14)
    trends = await analytics_service.get_issue_trends(
        db, current_user, "day", None, start_date, end_date
    )
    return {
        "dates": [item.date for item in trends.items],
        "created": [item.created_count for item in trends.items],
        "resolved": [item.resolved_count for item in trends.items],
    }


# --------------------------------------------------------------------------- #
# 12. Plotly Chart Data — all charts in one call (Mentor requirement)           #
# --------------------------------------------------------------------------- #

@router.get(
    "/plotly-charts",
    summary="All Plotly chart data in one response",
    description=(
        "Aggregated chart data for the Milestone 3 Plotly dashboard:\n"
        "- defect_trends: 14-day new vs resolved\n"
        "- severity_distribution: counts per severity level\n"
        "- workflow_pipeline: issue counts per status\n"
    ),
)
async def plotly_charts_data(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return all Plotly chart data in a single request."""
    from datetime import timedelta, timezone
    import asyncio as _asyncio
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=14)
    trends, severity_dist, status_dist = await _asyncio.gather(
        analytics_service.get_issue_trends(db, current_user, "day", None, start_date, end_date),
        analytics_service.get_severity_distribution(db, current_user, None, None, None),
        analytics_service.get_status_distribution(db, current_user, None, None, None),
    )
    return {
        "defect_trends": {
            "dates": [item.date for item in trends.items],
            "created": [item.created_count for item in trends.items],
            "resolved": [item.resolved_count for item in trends.items],
        },
        "severity_distribution": {
            k: v for k, v in severity_dist.__dict__.items()
            if not k.startswith("_")
        },
        "workflow_pipeline": {
            k: v for k, v in status_dist.__dict__.items()
            if not k.startswith("_")
        },
    }

