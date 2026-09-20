"""
Pydantic schemas for Admin dashboard statistics — Phase 6.

All fields are integer counts derived from pure SQL aggregation queries.
No user secrets or sensitive data are present in these schemas.
"""

from pydantic import BaseModel, ConfigDict


class InactiveAssigneeItem(BaseModel):
    user_id: int
    full_name: str
    email: str
    role: str
    assigned_issues_count: int
    
    model_config = ConfigDict(from_attributes=True)


class InactiveAssigneeList(BaseModel):
    items: list[InactiveAssigneeItem]


class UserStats(BaseModel):
    total: int
    active: int
    inactive: int
    admins: int
    developers: int
    testers: int
    users: int          # USER role (issue reporters)
    verified: int
    unverified: int


class ProjectStats(BaseModel):
    total: int
    active: int
    inactive: int


class IssueStatusStats(BaseModel):
    total: int
    reported: int
    triaged: int
    assigned: int
    in_development: int
    in_review: int
    in_testing: int
    resolved: int
    closed: int
    reopened: int
    unresolved: int  # total - resolved - closed


class IssueSeverityStats(BaseModel):
    minor: int
    major: int
    critical: int
    blocker: int


class IssuePriorityStats(BaseModel):
    low: int
    medium: int
    high: int
    urgent: int


class RecentActivity(BaseModel):
    """Issues created or resolved in the last 7 days."""
    recently_created: int
    recently_resolved: int


class NotificationStats(BaseModel):
    """Notification metrics."""
    total: int
    unread: int


class ContentStats(BaseModel):
    """System content and activity metrics."""
    total_comments: int
    total_attachments: int
    total_notifications: int
    unread_notifications: int


class DashboardResponse(BaseModel):
    """Complete admin dashboard statistics snapshot.

    All values are real-time SQL aggregations — no stale cache.
    """
    users: UserStats
    projects: ProjectStats
    issues: IssueStatusStats
    severity: IssueSeverityStats
    priority: IssuePriorityStats
    recent: RecentActivity
    notifications: NotificationStats
    content: ContentStats
