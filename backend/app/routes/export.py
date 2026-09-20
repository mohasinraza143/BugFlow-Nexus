"""
Export router — mentor-required export aliases.

Mentor-required paths:
    GET /export/pdf   → downloadable PDF quality report
  GET /export/csv   → alias for existing CSV export
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.analytics import AnalyticsReportDataResponse
from app.services import analytics_service

import asyncio

router = APIRouter(prefix="/export", tags=["Export"])


@router.get(
    "/csv",
    summary="[Alias] Export issues as CSV",
    response_class=Response,
    responses={200: {"content": {"text/csv": {}}, "description": "Issues CSV file"}},
    description="Mentor-compatible alias for GET /analytics/reports/issues/export.",
)
async def export_csv(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    return await analytics_service.export_issues_csv(
        db=db,
        current_user=current_user,
    )


@router.get(
    "/pdf",
    response_class=Response,
    summary="[Alias] Analytics report data for PDF generation",
    description="Generates a formatted PDF quality report.",
)
async def export_pdf(
    period: str = Query("30d", description="Report period: 1d, 7d, 30d"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    end_date = datetime.now(timezone.utc)
    if period == "1d":
        start_date = end_date - timedelta(days=1)
        trend_interval = "day"
    elif period == "7d":
        start_date = end_date - timedelta(days=7)
        trend_interval = "day"
    else:
        start_date = end_date - timedelta(days=30)
        trend_interval = "week"

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

    return await analytics_service.export_quality_pdf(
        db=db,
        current_user=current_user,
        overview=overview,
        metrics=await analytics_service.get_quality_metrics(db, current_user),
    )
