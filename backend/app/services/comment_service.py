"""
Comment service — Phase 7.

Business logic for issue comment CRUD operations.

RBAC (mirrors existing issue visibility):
  ADMIN     → can comment on / view comments for any issue
  DEVELOPER → can comment on / view comments for assigned issues only
  TESTER    → can comment on / view comments for their own reported issues

Update / Delete ownership:
  Only the original author can edit/delete their comment.
  ADMIN can edit/delete any comment.

All functions accept AsyncSession and participate in the caller's transaction.
Audit records are written via db.flush() within the same transaction.

Performance:
  selectinload(IssueComment.author) prevents N+1 queries on list operations.
"""

import math

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.audit_log import AuditAction
from app.models.issue import Issue
from app.models.issue_comment import IssueComment
from app.models.user import User, UserRole
from app.schemas.comment import (
    CommentCreate,
    CommentListResponse,
    CommentResponse,
    CommentUpdate,
)
from app.services.audit_service import compute_diff, create_audit_log
from app.services import notification_service
from app.models.notification import NotificationType



# --------------------------------------------------------------------------- #
# Internal helpers                                                             #
# --------------------------------------------------------------------------- #

async def _get_issue_or_404(issue_id: int, db: AsyncSession) -> Issue:
    """Fetch an issue by ID or raise HTTP 404."""
    result = await db.execute(select(Issue).where(Issue.id == issue_id))
    issue = result.scalar_one_or_none()
    if issue is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Issue {issue_id} not found.",
        )
    return issue


def _check_issue_access(issue: Issue, current_user: User) -> None:
    """Enforce the existing issue visibility rules for comments.

    ADMIN      → any issue
    TESTER     → issues assigned to them OR that they reported
    USER       → only issues they reported
    DEVELOPER  → only assigned issues (legacy)

    Raises HTTP 403 if access is denied.
    """
    if current_user.role == UserRole.ADMIN:
        return
    if current_user.role == UserRole.USER:
        if issue.reporter_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only comment on issues you reported.",
            )
    elif current_user.role in (UserRole.TESTER, UserRole.DEVELOPER):
        if issue.assignee_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only comment on issues assigned to you.",
            )


async def _get_comment_or_404(comment_id: int, db: AsyncSession) -> IssueComment:
    """Fetch a comment with author eagerly loaded, or raise HTTP 404."""
    result = await db.execute(
        select(IssueComment)
        .options(selectinload(IssueComment.author))
        .where(IssueComment.id == comment_id)
    )
    comment = result.scalar_one_or_none()
    if comment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Comment {comment_id} not found.",
        )
    return comment


def _check_comment_ownership(comment: IssueComment, current_user: User) -> None:
    """Allow only the original author or ADMIN to modify/delete a comment."""
    if current_user.role == UserRole.ADMIN:
        return
    if comment.author_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only modify your own comments.",
        )


# --------------------------------------------------------------------------- #
# Public service functions                                                     #
# --------------------------------------------------------------------------- #

async def create_comment(
    issue_id: int,
    body: CommentCreate,
    current_user: User,
    db: AsyncSession,
) -> tuple[CommentResponse, list]:
    """Create a new comment on an issue.

    The author is always set from the authenticated JWT user — never from
    request body input.

    Returns (CommentResponse, list_of_notifications) for WebSocket dispatch.
    """
    issue = await _get_issue_or_404(issue_id, db)
    _check_issue_access(issue, current_user)

    comment = IssueComment(
        issue_id=issue.id,
        author_id=current_user.id,
        body=body.body,
    )
    db.add(comment)
    await db.flush()
    await db.refresh(comment)

    # Load author for response (flush doesn't populate relationships)
    result = await db.execute(
        select(IssueComment)
        .options(selectinload(IssueComment.author))
        .where(IssueComment.id == comment.id)
    )
    comment = result.scalar_one()

    await create_audit_log(
        db=db,
        actor=current_user,
        action=AuditAction.COMMENT_CREATED,
        entity_type="ISSUE",
        entity_id=issue.id,
        entity_key=issue.issue_key,
        description=(
            f"{current_user.role.value.capitalize()} {current_user.full_name!r} "
            f"commented on issue {issue.issue_key}"
        ),
        new_values={"comment_id": comment.id, "body_preview": comment.body[:200]},
    )

    # Notify reporter + assignee (deduped, author excluded)
    recipient_ids = [issue.reporter_id, issue.assignee_id]
    notifications = await notification_service.notify_users(
        db=db,
        user_ids=[uid for uid in recipient_ids if uid],
        notification_type=NotificationType.ISSUE_COMMENTED,
        title="New comment on your issue",
        message=f"A new comment was added to {issue.issue_key}.",
        actor_id=current_user.id,
        entity_type="ISSUE",
        entity_id=issue.id,
        entity_key=issue.issue_key,
    )

    return CommentResponse.model_validate(comment), notifications


async def list_comments(
    issue_id: int,
    current_user: User,
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
) -> CommentListResponse:
    """Return a paginated list of comments for an issue.

    Newest first (created_at DESC), with id as secondary deterministic sort.
    """
    issue = await _get_issue_or_404(issue_id, db)
    _check_issue_access(issue, current_user)

    base_query = (
        select(IssueComment)
        .options(selectinload(IssueComment.author))
        .where(IssueComment.issue_id == issue_id)
    )

    count_result = await db.execute(
        select(func.count()).select_from(
            select(IssueComment).where(IssueComment.issue_id == issue_id).subquery()
        )
    )
    total = count_result.scalar_one()

    offset = (page - 1) * page_size
    result = await db.execute(
        base_query
        .order_by(IssueComment.created_at.desc(), IssueComment.id.desc())
        .offset(offset)
        .limit(page_size)
    )
    comments = result.scalars().all()

    return CommentListResponse(
        items=[CommentResponse.model_validate(c) for c in comments],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
    )


async def get_comment(
    comment_id: int,
    current_user: User,
    db: AsyncSession,
) -> CommentResponse:
    """Return a single comment. Enforces issue access rules."""
    comment = await _get_comment_or_404(comment_id, db)

    # Load the parent issue to check access
    issue = await _get_issue_or_404(comment.issue_id, db)
    _check_issue_access(issue, current_user)

    return CommentResponse.model_validate(comment)


async def update_comment(
    comment_id: int,
    body: CommentUpdate,
    current_user: User,
    db: AsyncSession,
) -> CommentResponse:
    """Update the body of a comment.

    Only the original author or ADMIN may update a comment.
    """
    comment = await _get_comment_or_404(comment_id, db)

    # Check issue access first (401/403 for invisible issues returns 404 pattern)
    issue = await _get_issue_or_404(comment.issue_id, db)
    _check_issue_access(issue, current_user)

    # Check ownership
    _check_comment_ownership(comment, current_user)

    old_body = comment.body
    comment.body = body.body
    await db.flush()

    old_vals, new_vals = compute_diff({"body": old_body}, {"body": body.body})

    await create_audit_log(
        db=db,
        actor=current_user,
        action=AuditAction.COMMENT_UPDATED,
        entity_type="ISSUE",
        entity_id=issue.id,
        entity_key=issue.issue_key,
        description=(
            f"{current_user.role.value.capitalize()} {current_user.full_name!r} "
            f"updated comment {comment.id} on issue {issue.issue_key}"
        ),
        old_values=old_vals,
        new_values=new_vals,
    )

    # Re-fetch with author loaded
    result = await db.execute(
        select(IssueComment)
        .options(selectinload(IssueComment.author))
        .where(IssueComment.id == comment.id)
    )
    updated = result.scalar_one()
    return CommentResponse.model_validate(updated)


async def delete_comment(
    comment_id: int,
    current_user: User,
    db: AsyncSession,
) -> None:
    """Delete a comment.

    Only the original author or ADMIN may delete a comment.
    """
    comment = await _get_comment_or_404(comment_id, db)

    # Check issue access
    issue = await _get_issue_or_404(comment.issue_id, db)
    _check_issue_access(issue, current_user)

    # Check ownership
    _check_comment_ownership(comment, current_user)

    # Capture audit data before deletion
    audit_desc = (
        f"{current_user.role.value.capitalize()} {current_user.full_name!r} "
        f"deleted comment {comment.id} on issue {issue.issue_key}"
    )
    old_vals = {
        "comment_id": comment.id,
        "author_id": comment.author_id,
        "body_preview": comment.body[:200],
    }

    await db.delete(comment)
    await db.flush()

    await create_audit_log(
        db=db,
        actor=current_user,
        action=AuditAction.COMMENT_DELETED,
        entity_type="ISSUE",
        entity_id=issue.id,
        entity_key=issue.issue_key,
        description=audit_desc,
        old_values=old_vals,
    )
