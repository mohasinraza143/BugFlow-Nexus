"""
Models package.

Imports all ORM models so that Base.metadata is fully
populated when Alembic inspects it for autogeneration.
"""

from app.models.audit_log import AuditAction, AuditLog
from app.models.email_otp import EmailOTP
from app.models.issue import (
    Issue,
    IssueStatus,
    IssueType,
    Priority,
    Severity,
)
from app.models.issue_attachment import IssueAttachment
from app.models.issue_comment import IssueComment
from app.models.notification import Notification, NotificationType
from app.models.notification_preference import NotificationPreference
from app.models.project import Project, ProjectStatus
from app.models.sprint import Sprint, SprintStatus
from app.models.user import User, UserRole

__all__ = [
    # Models
    "User",
    "Project",
    "Issue",
    "EmailOTP",
    "AuditLog",
    "IssueComment",
    "IssueAttachment",
    "Notification",
    "NotificationPreference",
    "Sprint",
    # Enums
    "UserRole",
    "ProjectStatus",
    "IssueType",
    "Severity",
    "Priority",
    "IssueStatus",
    "AuditAction",
    "NotificationType",
    "SprintStatus",
]
