"""
Admin dashboard service — Phase 6.

Computes system-wide statistics using efficient SQL aggregation queries.

Design principles:
  - All counts use SQL func.count() + case() — zero Python-level iteration.
  - Single query per entity type (user/project/issue) to minimise round-trips.
  - No sensitive data (password_hash, tokens, OTPs) is ever read or returned.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.issue import Issue, IssueStatus, Priority, Severity
from app.models.issue_attachment import IssueAttachment
from app.models.issue_comment import IssueComment
from app.models.notification import Notification
from app.models.project import Project, ProjectStatus
from app.models.user import User, UserRole
from app.schemas.admin import (
    ContentStats,
    DashboardResponse,
    IssuePriorityStats,
    IssueSeverityStats,
    IssueStatusStats,
    NotificationStats,
    ProjectStats,
    RecentActivity,
    UserStats,
    InactiveAssigneeItem,
    InactiveAssigneeList,
)


async def get_dashboard_stats(db: AsyncSession) -> DashboardResponse:
    """Return a complete statistics snapshot for the Admin dashboard.

    Uses efficient aggregation queries across users, projects, issues,
    notifications, comments, and attachments. No ORM objects are instantiated.
    """
    users = await _user_stats(db)
    projects = await _project_stats(db)
    issue_status = await _issue_status_stats(db)
    issue_severity = await _issue_severity_stats(db)
    issue_priority = await _issue_priority_stats(db)
    recent = await _recent_activity(db)
    notifications = await _notification_stats(db)
    content = await _content_stats(db)

    return DashboardResponse(
        users=users,
        projects=projects,
        issues=issue_status,
        severity=issue_severity,
        priority=issue_priority,
        recent=recent,
        notifications=notifications,
        content=content,
    )


async def get_inactive_assignees(db: AsyncSession) -> InactiveAssigneeList:
    """Return all inactive users who currently have open issues assigned to them."""
    result = await db.execute(
        select(
            User.id.label("user_id"),
            User.full_name,
            User.email,
            User.role,
            func.count(Issue.id).label("assigned_issues_count"),
        )
        .join(Issue, Issue.assignee_id == User.id)
        .where(
            User.is_active == False,
            Issue.status.notin_([IssueStatus.RESOLVED, IssueStatus.CLOSED])
        )
        .group_by(User.id)
        .order_by(func.count(Issue.id).desc())
    )
    
    items = []
    for row in result.all():
        items.append(
            InactiveAssigneeItem(
                user_id=row.user_id,
                full_name=row.full_name,
                email=row.email,
                role=row.role.value,
                assigned_issues_count=row.assigned_issues_count,
            )
        )
        
    return InactiveAssigneeList(items=items)


# --------------------------------------------------------------------------- #
# Private aggregation queries                                                  #
# --------------------------------------------------------------------------- #

async def _user_stats(db: AsyncSession) -> UserStats:
    """Compute all user counts in a single SQL query."""
    result = await db.execute(
        select(
            func.count().label("total"),
            func.count(case((User.is_active == True, 1))).label("active"),        # noqa: E712
            func.count(case((User.is_active == False, 1))).label("inactive"),     # noqa: E712
            func.count(case((User.role == UserRole.ADMIN, 1))).label("admins"),
            func.count(case((User.role == UserRole.DEVELOPER, 1))).label("developers"),
            func.count(case((User.role == UserRole.TESTER, 1))).label("testers"),
            func.count(case((User.role == UserRole.USER, 1))).label("users"),
            func.count(case((User.is_email_verified == True, 1))).label("verified"),   # noqa: E712
            func.count(case((User.is_email_verified == False, 1))).label("unverified"),  # noqa: E712
        ).select_from(User)
    )
    row = result.one()
    return UserStats(
        total=row.total,
        active=row.active,
        inactive=row.inactive,
        admins=row.admins,
        developers=row.developers,
        testers=row.testers,
        users=row.users,
        verified=row.verified,
        unverified=row.unverified,
    )


async def _project_stats(db: AsyncSession) -> ProjectStats:
    """Compute project counts in a single SQL query."""
    result = await db.execute(
        select(
            func.count().label("total"),
            func.count(case((Project.status == ProjectStatus.ACTIVE, 1))).label("active"),
            func.count(case((Project.status == ProjectStatus.INACTIVE, 1))).label("inactive"),
        ).select_from(Project)
    )
    row = result.one()
    return ProjectStats(
        total=row.total,
        active=row.active,
        inactive=row.inactive,
    )


async def _issue_status_stats(db: AsyncSession) -> IssueStatusStats:
    """Compute issue counts by status in a single SQL query."""
    result = await db.execute(
        select(
            func.count().label("total"),
            func.count(case((Issue.status == IssueStatus.REPORTED, 1))).label("reported"),
            func.count(case((Issue.status == IssueStatus.TRIAGED, 1))).label("triaged"),
            func.count(case((Issue.status == IssueStatus.ASSIGNED, 1))).label("assigned"),
            func.count(case((Issue.status == IssueStatus.IN_DEVELOPMENT, 1))).label("in_development"),
            func.count(case((Issue.status == IssueStatus.IN_REVIEW, 1))).label("in_review"),
            func.count(case((Issue.status == IssueStatus.IN_TESTING, 1))).label("in_testing"),
            func.count(case((Issue.status == IssueStatus.RESOLVED, 1))).label("resolved"),
            func.count(case((Issue.status == IssueStatus.CLOSED, 1))).label("closed"),
            func.count(case((Issue.status == IssueStatus.REOPENED, 1))).label("reopened"),
        ).select_from(Issue)
    )
    row = result.one()
    resolved_and_closed = row.resolved + row.closed
    return IssueStatusStats(
        total=row.total,
        reported=row.reported,
        triaged=row.triaged,
        assigned=row.assigned,
        in_development=row.in_development,
        in_review=row.in_review,
        in_testing=row.in_testing,
        resolved=row.resolved,
        closed=row.closed,
        reopened=row.reopened,
        unresolved=max(0, row.total - resolved_and_closed),
    )


async def _issue_severity_stats(db: AsyncSession) -> IssueSeverityStats:
    """Compute issue counts by severity in a single SQL query."""
    result = await db.execute(
        select(
            func.count(case((Issue.severity == Severity.MINOR, 1))).label("minor"),
            func.count(case((Issue.severity == Severity.MAJOR, 1))).label("major"),
            func.count(case((Issue.severity == Severity.CRITICAL, 1))).label("critical"),
            func.count(case((Issue.severity == Severity.BLOCKER, 1))).label("blocker"),
        ).select_from(Issue)
    )
    row = result.one()
    return IssueSeverityStats(
        minor=row.minor,
        major=row.major,
        critical=row.critical,
        blocker=row.blocker,
    )


async def _issue_priority_stats(db: AsyncSession) -> IssuePriorityStats:
    """Compute issue counts by priority in a single SQL query."""
    result = await db.execute(
        select(
            func.count(case((Issue.priority == Priority.LOW, 1))).label("low"),
            func.count(case((Issue.priority == Priority.MEDIUM, 1))).label("medium"),
            func.count(case((Issue.priority == Priority.HIGH, 1))).label("high"),
            func.count(case((Issue.priority == Priority.URGENT, 1))).label("urgent"),
        ).select_from(Issue)
    )
    row = result.one()
    return IssuePriorityStats(
        low=row.low,
        medium=row.medium,
        high=row.high,
        urgent=row.urgent,
    )


async def _recent_activity(db: AsyncSession) -> RecentActivity:
    """Count issues created and resolved in the last 7 days."""
    cutoff = datetime.now(UTC) - timedelta(days=7)

    created_result = await db.execute(
        select(func.count())
        .select_from(Issue)
        .where(Issue.created_at >= cutoff)
    )
    resolved_result = await db.execute(
        select(func.count())
        .select_from(Issue)
        .where(
            Issue.status == IssueStatus.RESOLVED,
            Issue.resolved_at >= cutoff,
        )
    )
    return RecentActivity(
        recently_created=created_result.scalar_one(),
        recently_resolved=resolved_result.scalar_one(),
    )


async def _notification_stats(db: AsyncSession) -> NotificationStats:
    """Compute live notification counts."""
    result = await db.execute(
        select(
            func.count().label("total"),
            func.count(case((Notification.is_read == False, 1))).label("unread"),  # noqa: E712
        ).select_from(Notification)
    )
    row = result.one()
    return NotificationStats(
        total=row.total,
        unread=row.unread,
    )


async def _content_stats(db: AsyncSession) -> ContentStats:
    """Compute live counts for comments, attachments, and notifications."""
    comments_result = await db.execute(
        select(func.count()).select_from(IssueComment)
    )
    attachments_result = await db.execute(
        select(func.count()).select_from(IssueAttachment)
    )
    notif_result = await db.execute(
        select(
            func.count().label("total"),
            func.count(case((Notification.is_read == False, 1))).label("unread"),  # noqa: E712
        ).select_from(Notification)
    )
    notif_row = notif_result.one()
    return ContentStats(
        total_comments=comments_result.scalar_one(),
        total_attachments=attachments_result.scalar_one(),
        total_notifications=notif_row.total,
        unread_notifications=notif_row.unread,
    )

