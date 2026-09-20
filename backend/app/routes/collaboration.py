"""
Collaboration router — mentor-required route aliases.

Mounts aliases at /collaboration/... that delegate to the existing
comment_service and attachment_service (zero duplication of business logic).

Mentor-required paths:
  POST /collaboration/issues/{id}/comments
  GET  /collaboration/issues/{id}/comments
  POST /collaboration/issues/{id}/attachments
"""

from fastapi import APIRouter, BackgroundTasks, Depends, File, UploadFile, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.comment import CommentCreate, CommentListResponse, CommentResponse
from app.schemas.attachment import AttachmentResponse
from app.services import comment_service, attachment_service

router = APIRouter(prefix="/collaboration", tags=["Collaboration"])


# --------------------------------------------------------------------------- #
# Comments — alias at /collaboration/issues/{id}/comments                      #
# --------------------------------------------------------------------------- #

@router.post(
    "/issues/{issue_id}/comments",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="[Alias] Post a comment on an issue",
    description="Mentor-compatible alias for POST /issues/{issue_id}/comments.",
)
async def collab_create_comment(
    issue_id: int,
    body: CommentCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CommentResponse:
    # comment_service.create_comment returns (CommentResponse, notifications)
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


@router.get(
    "/issues/{issue_id}/comments",
    response_model=CommentListResponse,
    summary="[Alias] Get all comments for an issue",
    description="Mentor-compatible alias for GET /issues/{issue_id}/comments.",
)
async def collab_list_comments(
    issue_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CommentListResponse:
    return await comment_service.list_comments(issue_id, current_user, db, page=page, page_size=page_size)


# --------------------------------------------------------------------------- #
# Attachments — alias at /collaboration/issues/{id}/attachments                #
# --------------------------------------------------------------------------- #

@router.post(
    "/issues/{issue_id}/attachments",
    response_model=AttachmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="[Alias] Upload attachment to an issue",
    description="Mentor-compatible alias for POST /issues/{issue_id}/attachments.",
)
async def collab_upload_attachment(
    issue_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AttachmentResponse:
    # save_attachment handles its own db commit internally
    return await attachment_service.save_attachment(issue_id, file, current_user, db)
