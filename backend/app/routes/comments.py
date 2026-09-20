"""
Issue comment routes — Phase 7.

RBAC summary:
  POST   /issues/{issue_id}/comments          → ALL authenticated (issue access enforced by service)
  GET    /issues/{issue_id}/comments          → ALL authenticated (issue access enforced by service)
  GET    /comments/{comment_id}               → ALL authenticated (issue access enforced by service)
  PATCH  /comments/{comment_id}              → author or ADMIN
  DELETE /comments/{comment_id}              → author or ADMIN

All ownership and issue-visibility checks are in comment_service.py.
"""

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.comment import (
    CommentCreate,
    CommentListResponse,
    CommentResponse,
    CommentUpdate,
)
from app.services import comment_service

router = APIRouter(tags=["Comments"])


# --------------------------------------------------------------------------- #
# POST /issues/{issue_id}/comments                                             #
# --------------------------------------------------------------------------- #

@router.post(
    "/issues/{issue_id}/comments",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Post a comment on an issue",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Not authorized to comment on this issue"},
        404: {"description": "Issue not found"},
        422: {"description": "Validation error (e.g. whitespace-only body)"},
    },
)
async def create_comment(
    issue_id: int,
    body: CommentCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CommentResponse:
    """Post a comment on an issue.

    The authenticated user is automatically set as the author.
    NEVER accepts author_id from request body.

    - **ADMIN**: can comment on any issue
    - **DEVELOPER**: can comment on issues assigned to them
    - **TESTER**: can comment on issues they reported
    """
    from app.services.websocket_manager import ws_manager
    comment, notifications = await comment_service.create_comment(issue_id, body, current_user, db)
    for notif in notifications:
        payload = {
            "type": "notification",
            "data": {
                "id": notif.id,
                "notification_type": notif.notification_type.value,
                "title": notif.title,
                "message": notif.message,
                "entity_type": notif.entity_type,
                "entity_id": notif.entity_id,
                "entity_key": notif.entity_key,
                "created_at": notif.created_at.isoformat() if notif.created_at else None,
            },
        }
        background_tasks.add_task(ws_manager.send_personal_notification, notif.user_id, payload)
    return comment


# --------------------------------------------------------------------------- #
# GET /issues/{issue_id}/comments                                              #
# --------------------------------------------------------------------------- #

@router.get(
    "/issues/{issue_id}/comments",
    response_model=CommentListResponse,
    summary="List comments on an issue",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Not authorized to view this issue"},
        404: {"description": "Issue not found"},
    },
)
async def list_comments(
    issue_id: int,
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(20, ge=1, le=100, description="Comments per page"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CommentListResponse:
    """Return a paginated list of comments for an issue, newest first.

    Access follows existing issue visibility rules.
    """
    return await comment_service.list_comments(
        issue_id=issue_id,
        current_user=current_user,
        db=db,
        page=page,
        page_size=page_size,
    )


# --------------------------------------------------------------------------- #
# GET /comments/{comment_id}                                                   #
# --------------------------------------------------------------------------- #

@router.get(
    "/comments/{comment_id}",
    response_model=CommentResponse,
    summary="Get a single comment by ID",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Not authorized to view this comment"},
        404: {"description": "Comment not found"},
    },
)
async def get_comment(
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CommentResponse:
    """Return a single comment. Access follows existing issue visibility rules."""
    return await comment_service.get_comment(comment_id, current_user, db)


# --------------------------------------------------------------------------- #
# PATCH /comments/{comment_id}                                                 #
# --------------------------------------------------------------------------- #

@router.patch(
    "/comments/{comment_id}",
    response_model=CommentResponse,
    summary="Update a comment",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "You can only update your own comments (or be ADMIN)"},
        404: {"description": "Comment not found"},
        422: {"description": "Validation error"},
    },
)
async def update_comment(
    comment_id: int,
    body: CommentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CommentResponse:
    """Update the body of a comment.

    - **Author** can update their own comment
    - **ADMIN** can update any comment
    - Other users receive 403
    """
    return await comment_service.update_comment(comment_id, body, current_user, db)


# --------------------------------------------------------------------------- #
# DELETE /comments/{comment_id}                                                #
# --------------------------------------------------------------------------- #

@router.delete(
    "/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a comment",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "You can only delete your own comments (or be ADMIN)"},
        404: {"description": "Comment not found"},
    },
)
async def delete_comment(
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a comment.

    - **Author** can delete their own comment
    - **ADMIN** can delete any comment
    - Other users receive 403
    """
    await comment_service.delete_comment(comment_id, current_user, db)
