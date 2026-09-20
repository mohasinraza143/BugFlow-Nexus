"""
Issue attachment routes — Phase 7.

RBAC summary:
  POST   /issues/{issue_id}/attachments          → ALL authenticated (issue access enforced)
  GET    /issues/{issue_id}/attachments          → ALL authenticated (issue access enforced)
  GET    /attachments/{attachment_id}            → metadata only (JSON)
  GET    /attachments/{attachment_id}/download   → binary FileResponse
  DELETE /attachments/{attachment_id}            → uploader or ADMIN

All file security (MIME, extension, size, magic bytes, path traversal)
is handled in attachment_service.py.

NEVER:
  - Returns storage_path or stored_filename in JSON responses
  - Exposes absolute filesystem paths
  - Accepts uploaded_by from request body
"""

from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.attachment import AttachmentListResponse, AttachmentResponse
from app.services import attachment_service

router = APIRouter(tags=["Attachments"])


# --------------------------------------------------------------------------- #
# POST /issues/{issue_id}/attachments                                          #
# --------------------------------------------------------------------------- #

@router.post(
    "/issues/{issue_id}/attachments",
    response_model=AttachmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a file attachment to an issue",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Not authorized to upload to this issue"},
        404: {"description": "Issue not found"},
        413: {"description": "File exceeds maximum size limit"},
        415: {"description": "Unsupported file type"},
        422: {"description": "Validation error"},
    },
)
async def upload_attachment(
    issue_id: int,
    file: UploadFile = File(..., description="File to attach (multipart/form-data)"),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AttachmentResponse:
    """Upload a file attachment to an issue.

    Allowed types: PNG, JPEG, WebP, PDF, plain text, CSV.

    **Security:**
    - Files are stored with a server-generated UUID filename.
    - Original filename is preserved as metadata only.
    - The storage path is never returned in the response.
    - MIME type and magic bytes are validated server-side.

    **Access:**
    - ADMIN: any issue
    - DEVELOPER: assigned issues only
    - TESTER: own reported issues only
    """
    from app.services.websocket_manager import ws_manager
    attachment, notifications = await attachment_service.save_attachment(
        issue_id=issue_id,
        file=file,
        current_user=current_user,
        db=db,
    )
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
    return attachment


# --------------------------------------------------------------------------- #
# GET /issues/{issue_id}/attachments                                           #
# --------------------------------------------------------------------------- #

@router.get(
    "/issues/{issue_id}/attachments",
    response_model=AttachmentListResponse,
    summary="List attachments for an issue",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Not authorized to view this issue"},
        404: {"description": "Issue not found"},
    },
)
async def list_attachments(
    issue_id: int,
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AttachmentListResponse:
    """Return a paginated list of attachment metadata for an issue.

    Does NOT include storage paths or internal server paths.
    """
    return await attachment_service.list_attachments(
        issue_id=issue_id,
        current_user=current_user,
        db=db,
        page=page,
        page_size=page_size,
    )


# --------------------------------------------------------------------------- #
# GET /attachments/{attachment_id}                                             #
# --------------------------------------------------------------------------- #

@router.get(
    "/attachments/{attachment_id}",
    response_model=AttachmentResponse,
    summary="Get attachment metadata",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Not authorized"},
        404: {"description": "Attachment not found"},
    },
)
async def get_attachment_metadata(
    attachment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AttachmentResponse:
    """Return attachment metadata (no file content, no storage path)."""
    attachment, _path = await attachment_service.get_attachment(
        attachment_id=attachment_id,
        current_user=current_user,
        db=db,
    )
    return AttachmentResponse.model_validate(attachment)


# --------------------------------------------------------------------------- #
# GET /attachments/{attachment_id}/download                                    #
# --------------------------------------------------------------------------- #

@router.get(
    "/attachments/{attachment_id}/download",
    summary="Download an attachment file",
    response_class=FileResponse,
    responses={
        200: {"description": "Binary file content"},
        401: {"description": "Not authenticated"},
        403: {"description": "Not authorized"},
        404: {"description": "Attachment or file not found"},
    },
)
async def download_attachment(
    attachment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    """Download the binary content of an attachment.

    Returns the file using the original filename as the download name.
    The internal storage path is never exposed to the client.
    """
    attachment, file_path = await attachment_service.get_attachment(
        attachment_id=attachment_id,
        current_user=current_user,
        db=db,
    )
    return FileResponse(
        path=str(file_path),
        media_type=attachment.mime_type,
        filename=attachment.original_filename,
    )


# --------------------------------------------------------------------------- #
# DELETE /attachments/{attachment_id}                                          #
# --------------------------------------------------------------------------- #

@router.delete(
    "/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an attachment",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "You can only delete your own attachments (or be ADMIN)"},
        404: {"description": "Attachment not found"},
    },
)
async def delete_attachment(
    attachment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete an attachment's metadata and physical file.

    - **Uploader** can delete their own attachment
    - **ADMIN** can delete any attachment
    - Other users receive 403
    """
    await attachment_service.delete_attachment(
        attachment_id=attachment_id,
        current_user=current_user,
        db=db,
    )
