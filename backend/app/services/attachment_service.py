"""
Attachment service — Phase 7.

Handles file upload validation, secure storage, and metadata management
for issue attachments.

Storage architecture:
  - Binary files are stored on the filesystem (never in PostgreSQL).
  - PostgreSQL stores metadata only (original name, stored name, path, MIME, size).
  - Storage root: configured via ATTACHMENT_STORAGE_PATH (relative to backend/).
  - The directory is auto-created at startup.

File security:
  - Files are NEVER stored using the user-provided filename.
  - A UUID4-based filename is generated server-side.
  - The stored path is verified to stay inside the configured root (path traversal
    protection).
  - Extension and declared MIME type are both validated against an allowlist.
  - Magic byte inspection is performed for PNG, JPEG, PDF (stdlib only).
  - Executable extensions are rejected regardless of MIME type.
  - File size is checked against ATTACHMENT_MAX_SIZE_MB.

Transaction safety:
  - The physical file is written before the DB record is created.
  - If the DB operation fails, the physical file is cleaned up.
  - If a physical deletion fails, an error is raised (never silent failure).

RBAC:
  ADMIN     → any issue
  DEVELOPER → assigned issues only
  TESTER    → own reported issues only
"""

import math
import os
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.audit_log import AuditAction
from app.models.issue import Issue
from app.models.issue_attachment import IssueAttachment
from app.models.user import User, UserRole
from app.schemas.attachment import AttachmentListResponse, AttachmentResponse
from app.services.audit_service import create_audit_log
from app.services import notification_service
from app.models.notification import NotificationType


# --------------------------------------------------------------------------- #
# Blocked extensions — reject regardless of MIME type                         #
# --------------------------------------------------------------------------- #

_BLOCKED_EXTENSIONS: frozenset[str] = frozenset({
    ".exe", ".bat", ".cmd", ".ps1", ".ps2", ".dll", ".scr", ".com",
    ".msi", ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".msc",
    ".jar", ".sh", ".bin", ".run", ".pif", ".application",
    ".gadget", ".cpl", ".inf", ".reg", ".hta", ".url",
})

# Mapping: allowed MIME → expected magic bytes prefix (raw bytes)
_MAGIC_BYTES: dict[str, list[bytes]] = {
    "image/png":      [b"\x89PNG\r\n\x1a\n"],
    "image/jpeg":     [b"\xff\xd8\xff"],
    "application/pdf": [b"%PDF"],
}


# --------------------------------------------------------------------------- #
# Storage root resolution                                                      #
# --------------------------------------------------------------------------- #

def _get_storage_root() -> Path:
    """Return the resolved, absolute storage root path.

    If the path is relative, it is resolved relative to the backend/ directory
    (parent of the `app/` package), NOT the current working directory.
    """
    configured = Path(settings.ATTACHMENT_STORAGE_PATH)
    if configured.is_absolute():
        root = configured
    else:
        # Resolve relative to backend/ (two levels up from this file: services/ → app/ → backend/)
        backend_dir = Path(__file__).resolve().parent.parent.parent
        root = backend_dir / configured
    root.mkdir(parents=True, exist_ok=True)
    return root


def _safe_extension(filename: str) -> str:
    """Return a lower-cased, dot-prefixed safe file extension.

    Strips path components from the filename before extracting extension.
    Returns empty string if no extension.
    """
    # Use only the basename to neutralise path traversal in the filename itself
    safe_name = Path(filename).name
    ext = Path(safe_name).suffix.lower()
    # Reject extensions with path separators or null bytes
    if "/" in ext or "\\" in ext or "\x00" in ext:
        return ""
    return ext


def _generate_stored_filename(extension: str) -> str:
    """Generate a cryptographically unique stored filename.

    Format: <uuid4><ext>  e.g. 8c7f1f3e-2d9a-4b1c-a5f0-123456789abc.png
    """
    return f"{uuid.uuid4()}{extension}"


def _verify_path_inside_root(file_path: Path, root: Path) -> None:
    """Raise HTTP 400 if file_path escapes the storage root (traversal guard at write time)."""
    try:
        file_path.resolve().relative_to(root.resolve())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file path detected.",
        )


# --------------------------------------------------------------------------- #
# File validation                                                              #
# --------------------------------------------------------------------------- #

async def _validate_upload(file: UploadFile, content: bytes) -> tuple[str, str]:
    """Validate an uploaded file and return (validated_mime, safe_extension).

    Checks:
      1. Declared MIME type against the configured allowlist.
      2. File extension against the blocked-extension list.
      3. File extension against MIME-derived expected extensions.
      4. File size against ATTACHMENT_MAX_SIZE_MB.
      5. Magic bytes for supported types (PNG, JPEG, PDF).

    Returns:
      (validated_mime, safe_extension) on success.

    Raises:
      HTTP 413 if file too large.
      HTTP 415 if MIME type or extension not allowed.
      HTTP 400 if magic bytes don't match.
    """
    max_bytes = settings.attachment_max_size_bytes
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"File exceeds maximum allowed size of "
                f"{settings.ATTACHMENT_MAX_SIZE_MB} MB."
            ),
        )

    # Declared MIME check
    declared_mime = (file.content_type or "").lower().split(";")[0].strip()
    allowed = settings.attachment_allowed_mime_set
    if declared_mime not in allowed:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"File type '{declared_mime}' is not allowed. "
                f"Allowed types: {', '.join(sorted(allowed))}."
            ),
        )

    # Extension check
    ext = _safe_extension(file.filename or "")
    if ext in _BLOCKED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File extension '{ext}' is not permitted.",
        )

    # MIME → extension consistency check (extra guard)
    mime_to_exts: dict[str, set[str]] = {
        "image/png":      {".png"},
        "image/jpeg":     {".jpg", ".jpeg"},
        "image/webp":     {".webp"},
        "application/pdf": {".pdf"},
        "text/plain":     {".txt", ".log", ".text"},
        "text/csv":       {".csv"},
    }
    expected_exts = mime_to_exts.get(declared_mime, set())
    if expected_exts and ext not in expected_exts:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"File extension '{ext}' does not match "
                f"declared MIME type '{declared_mime}'."
            ),
        )

    # Magic byte inspection for supported types
    if declared_mime in _MAGIC_BYTES:
        magic_candidates = _MAGIC_BYTES[declared_mime]
        if not any(content.startswith(m) for m in magic_candidates):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"File content does not match the declared type "
                    f"'{declared_mime}'. Upload may be corrupted or spoofed."
                ),
            )

    return declared_mime, ext


# --------------------------------------------------------------------------- #
# Issue + access helpers                                                       #
# --------------------------------------------------------------------------- #

async def _get_issue_or_404(issue_id: int, db: AsyncSession) -> Issue:
    result = await db.execute(select(Issue).where(Issue.id == issue_id))
    issue = result.scalar_one_or_none()
    if issue is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Issue {issue_id} not found.",
        )
    return issue


def _check_issue_access(issue: Issue, current_user: User) -> None:
    """Enforce issue visibility rules for attachments.

    ADMIN     → any issue
    TESTER    → issues assigned to them OR that they reported
    USER      → only issues they reported
    DEVELOPER → only assigned issues (legacy)
    """
    if current_user.role == UserRole.ADMIN:
        return
    if current_user.role == UserRole.USER:
        if issue.reporter_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only upload attachments to issues you reported.",
            )
    elif current_user.role in (UserRole.TESTER, UserRole.DEVELOPER):
        if issue.assignee_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only upload attachments to issues assigned to you.",
            )


async def _get_attachment_or_404(attachment_id: int, db: AsyncSession) -> IssueAttachment:
    result = await db.execute(
        select(IssueAttachment)
        .options(selectinload(IssueAttachment.uploader))
        .where(IssueAttachment.id == attachment_id)
    )
    attachment = result.scalar_one_or_none()
    if attachment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attachment {attachment_id} not found.",
        )
    return attachment


def _check_delete_permission(attachment: IssueAttachment, current_user: User) -> None:
    """ADMIN can delete any attachment; others can only delete their own."""
    if current_user.role == UserRole.ADMIN:
        return
    if attachment.uploaded_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own attachments.",
        )


# --------------------------------------------------------------------------- #
# Public service functions                                                     #
# --------------------------------------------------------------------------- #

async def save_attachment(
    issue_id: int,
    file: UploadFile,
    current_user: User,
    db: AsyncSession,
    storage_root: Path | None = None,
) -> AttachmentResponse:
    """Validate, store, and record a file attachment.

    Transaction safety:
      1. Physical file is written first.
      2. DB record is created (flush, not commit).
      3. If DB flush fails, the physical file is cleaned up.

    Never exposes storage_path, stored_filename, or absolute paths in response.
    """
    issue = await _get_issue_or_404(issue_id, db)
    _check_issue_access(issue, current_user)

    # Read file into memory for validation (respects max size check below)
    content = await file.read()

    validated_mime, ext = await _validate_upload(file, content)

    root = storage_root if storage_root is not None else _get_storage_root()
    stored_filename = _generate_stored_filename(ext)
    file_path = root / stored_filename

    # Traversal guard on the generated write path (verifies against upload root)
    _verify_path_inside_root(file_path, root)

    # Sanitise original filename (display only)
    original_filename = Path(file.filename or "upload").name or "upload"
    # Remove null bytes
    original_filename = original_filename.replace("\x00", "")

    # Write physical file
    file_path.write_bytes(content)

    # Create DB record; clean up file on DB failure
    try:

        attachment = IssueAttachment(
            issue_id=issue.id,
            uploaded_by=current_user.id,
            original_filename=original_filename,
            stored_filename=stored_filename,
            storage_path=str(file_path.resolve()),  # absolute path, never exposed in API
            mime_type=validated_mime,
            file_size=len(content),
        )
        db.add(attachment)
        await db.flush()
        await db.refresh(attachment)

        # Load uploader relationship for response
        result = await db.execute(
            select(IssueAttachment)
            .options(selectinload(IssueAttachment.uploader))
            .where(IssueAttachment.id == attachment.id)
        )
        attachment = result.scalar_one()

        await create_audit_log(
            db=db,
            actor=current_user,
            action=AuditAction.ATTACHMENT_UPLOADED,
            entity_type="ISSUE",
            entity_id=issue.id,
            entity_key=issue.issue_key,
            description=(
                f"{current_user.role.value.capitalize()} {current_user.full_name!r} "
                f"uploaded attachment '{original_filename}' to issue {issue.issue_key}"
            ),
            new_values={
                "attachment_id": attachment.id,
                "original_filename": original_filename,
                "mime_type": validated_mime,
                "file_size": len(content),
            },
        )
    except Exception:
        # DB failed — clean up physical file to avoid orphan
        try:
            file_path.unlink(missing_ok=True)
        except OSError:
            pass  # best-effort cleanup
        raise

    # Notify reporter + assignee (deduped, uploader excluded)
    recipient_ids = [issue.reporter_id, issue.assignee_id]
    notifications = await notification_service.notify_users(
        db=db,
        user_ids=[uid for uid in recipient_ids if uid],
        notification_type=NotificationType.ATTACHMENT_ADDED,
        title="Attachment added to your issue",
        message=f"A new attachment was uploaded to {issue.issue_key}.",
        actor_id=current_user.id,
        entity_type="ISSUE",
        entity_id=issue.id,
        entity_key=issue.issue_key,
    )

    return AttachmentResponse.model_validate(attachment), notifications


async def list_attachments(
    issue_id: int,
    current_user: User,
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
) -> AttachmentListResponse:
    """Return a paginated list of attachment metadata for an issue."""
    issue = await _get_issue_or_404(issue_id, db)
    _check_issue_access(issue, current_user)

    count_result = await db.execute(
        select(func.count()).select_from(
            select(IssueAttachment)
            .where(IssueAttachment.issue_id == issue_id)
            .subquery()
        )
    )
    total = count_result.scalar_one()

    offset = (page - 1) * page_size
    result = await db.execute(
        select(IssueAttachment)
        .options(selectinload(IssueAttachment.uploader))
        .where(IssueAttachment.issue_id == issue_id)
        .order_by(IssueAttachment.created_at.desc(), IssueAttachment.id.desc())
        .offset(offset)
        .limit(page_size)
    )
    attachments = result.scalars().all()

    return AttachmentListResponse(
        items=[AttachmentResponse.model_validate(a) for a in attachments],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
    )


async def get_attachment(
    attachment_id: int,
    current_user: User,
    db: AsyncSession,
) -> tuple[IssueAttachment, Path]:
    """Return (IssueAttachment, resolved file Path) for download.

    Verifies access and that the physical file exists.
    The physical path is returned only to the route handler for FileResponse —
    it is NEVER serialised into a JSON response.
    """
    attachment = await _get_attachment_or_404(attachment_id, db)

    issue = await _get_issue_or_404(attachment.issue_id, db)
    _check_issue_access(issue, current_user)

    root = _get_storage_root()
    file_path = Path(attachment.storage_path).resolve()

    # Verify path is a safe absolute path (stored server-side at upload time)
    if not file_path.is_absolute():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file path detected.",
        )

    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment file not found on server.",
        )

    return attachment, file_path


async def delete_attachment(
    attachment_id: int,
    current_user: User,
    db: AsyncSession,
    storage_root: Path | None = None,
) -> None:
    """Delete an attachment's metadata and physical file.

    Raises if physical deletion fails (no silent failure).
    """
    attachment = await _get_attachment_or_404(attachment_id, db)

    issue = await _get_issue_or_404(attachment.issue_id, db)
    _check_issue_access(issue, current_user)

    _check_delete_permission(attachment, current_user)

    root = storage_root if storage_root is not None else _get_storage_root()
    file_path = Path(attachment.storage_path).resolve()

    # Verify path is a safe absolute path (stored server-side at upload time)
    if not file_path.is_absolute():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Attachment storage path is invalid.",
        )

    # Capture audit info before deletion
    audit_desc = (
        f"{current_user.role.value.capitalize()} {current_user.full_name!r} "
        f"deleted attachment '{attachment.original_filename}' "
        f"from issue {issue.issue_key}"
    )
    old_vals = {
        "attachment_id": attachment.id,
        "original_filename": attachment.original_filename,
        "mime_type": attachment.mime_type,
        "file_size": attachment.file_size,
    }

    # Delete DB record
    await db.delete(attachment)
    await db.flush()

    # Write audit log (same transaction as delete)
    await create_audit_log(
        db=db,
        actor=current_user,
        action=AuditAction.ATTACHMENT_DELETED,
        entity_type="ISSUE",
        entity_id=issue.id,
        entity_key=issue.issue_key,
        description=audit_desc,
        old_values=old_vals,
    )

    # Delete physical file after DB record is flushed
    # If this fails, raise so the caller can handle it
    if file_path.exists():
        try:
            file_path.unlink()
        except OSError as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to delete physical file: {e}",
            )
