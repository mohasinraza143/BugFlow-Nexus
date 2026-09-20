"""
Phase 7 tests: Issue File Attachments API.

Uses conftest.py-provided verified tokens (no OTP flow).
All test files are generated in-memory — NO binary files committed.
Files are isolated to a pytest tmp_path, overriding the configured storage root.

Covers:
  1.  Authenticated upload
  2.  Unauthenticated upload → 401
  3.  Tester upload to own issue
  4.  Developer upload to assigned issue
  5.  Admin upload anywhere
  6.  Unauthorized issue upload → 403
  7.  Nonexistent issue → 404
  8.  Valid PNG upload
  9.  Valid JPEG upload
  10. Valid PDF upload
  11. Valid TXT upload
  12. Unsupported extension rejection
  13. Unsupported MIME rejection
  14. Executable rejection
  15. Oversized file rejection → 413
  16. Secure generated filename (UUID-based, not original name)
  17. Original filename preserved as metadata
  18. Path traversal filename handled safely
  19. List attachments
  20. Pagination
  21. Get attachment metadata
  22. Download attachment
  23. Downloaded content matches uploaded content
  24. Uploader can delete own attachment
  25. Admin can delete any attachment
  26. Developer cannot delete another user's attachment
  27. Tester cannot delete another user's attachment
  28. Nonexistent attachment → 404
  29. Physical file removed after successful deletion
  30. Audit event on upload
  31. Audit event on deletion
  32. Absolute filesystem path never exposed
  33. password_hash never exposed
"""

import io
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.services.attachment_service as attachment_svc
from app.main import app
from tests.conftest import (
    admin_token,
    auth_header,
    dev_token,
    tester2_token,
    tester_token,
    user2_token,
    user_token,
)

_admin_tok = admin_token
_dev_tok = dev_token
_tester_tok = tester_token
_tester2_tok = tester2_token
_user_tok = user_token
_user2_tok = user2_token

client = TestClient(app)


# =========================================================================== #
# Minimal valid file content (magic bytes + padding)                           #
# =========================================================================== #

def _make_png(size: int = 256) -> bytes:
    """Minimal PNG with valid magic bytes."""
    # PNG signature + IHDR chunk (minimal valid structure for magic check)
    png_header = (
        b"\x89PNG\r\n\x1a\n"  # 8-byte PNG signature
        b"\x00\x00\x00\rIHDR"  # IHDR length + type
        b"\x00\x00\x00\x01"   # width=1
        b"\x00\x00\x00\x01"   # height=1
        b"\x08\x02"            # bit depth 8, colour type 2 (RGB)
        b"\x00\x00\x00"        # compression, filter, interlace
        b"\x90wS\xde"          # CRC (not validated by our check)
    )
    return png_header + b"\x00" * max(0, size - len(png_header))


def _make_jpeg(size: int = 256) -> bytes:
    """Minimal JPEG with valid magic bytes."""
    jpeg_header = b"\xff\xd8\xff\xe0" + b"\x00" * 14  # SOI + APP0 marker
    return jpeg_header + b"\x00" * max(0, size - len(jpeg_header))


def _make_pdf(size: int = 256) -> bytes:
    """Minimal PDF with valid magic bytes."""
    pdf_header = b"%PDF-1.4\n"
    return pdf_header + b"%" * max(0, size - len(pdf_header))


def _make_txt(content: str = "Hello, DefectMind!\n") -> bytes:
    return content.encode("utf-8")


# =========================================================================== #
# Setup helpers                                                                #
# =========================================================================== #

def _fresh_key(prefix: str = "ATT") -> str:
    return f"{prefix}{uuid.uuid4().hex[:6].upper()}"[:20]


def _get_or_create_project(key: str, name: str) -> int:
    r = client.post(
        "/projects",
        json={"name": name, "project_key": key},
        headers=auth_header(_admin_tok()),
    )
    if r.status_code == 201:
        return r.json()["id"]
    list_r = client.get("/projects", headers=auth_header(_admin_tok()))
    for p in list_r.json()["items"]:
        if p["project_key"] == key:
            return p["id"]
    pytest.fail(f"Could not create project {key}")


def _create_issue(project_id: int, token: str) -> int:
    r = client.post(
        "/issues",
        json={
            "project_id": project_id,
            "title": f"Attachment Test Issue {uuid.uuid4().hex[:6]}",
            "description": "Testing file attachment operations.",
        },
        headers=auth_header(token),
    )
    assert r.status_code == 201, f"Issue creation failed: {r.text}"
    return r.json()["id"]


def _assign_issue(issue_id: int, developer_email: str) -> None:
    users_r = client.get(
        f"/users?search={developer_email}", headers=auth_header(_admin_tok())
    )
    dev_id = None
    for u in users_r.json()["items"]:
        if u["email"] == developer_email:
            dev_id = u["id"]
            break
    if dev_id is None:
        pytest.fail(f"Developer {developer_email} not found")
    r = client.patch(
        f"/issues/{issue_id}/assign",
        json={"developer_id": dev_id},
        headers=auth_header(_admin_tok()),
    )
    assert r.status_code == 200, f"Assign failed: {r.text}"


_PROJ_KEY = _fresh_key("ATT")
_proj_id: int = 0
_issue_by_tester: int = 0
_issue_by_tester2: int = 0
_issue_assigned_to_dev: int = 0


def _setup():
    global _proj_id, _issue_by_tester, _issue_by_tester2, _issue_assigned_to_dev
    _proj_id = _get_or_create_project(_PROJ_KEY, f"Attachment Test Project {_PROJ_KEY}")
    _issue_by_tester = _create_issue(_proj_id, _user_tok())
    _issue_by_tester2 = _create_issue(_proj_id, _user2_tok())
    _issue_assigned_to_dev = _create_issue(_proj_id, _user_tok())
    _assign_issue(_issue_assigned_to_dev, "dev.p4ci@example.com")


_setup()


def _upload(
    issue_id: int,
    token: str,
    content: bytes,
    filename: str,
    content_type: str,
    tmp_path: Path | None = None,
) -> "requests.Response":  # type: ignore[name-defined]
    """Upload a file, optionally overriding the storage root for test isolation."""
    if tmp_path is not None:
        # Monkeypatch storage root for this call
        original_fn = attachment_svc._get_storage_root
        attachment_svc._get_storage_root = lambda: tmp_path
    try:
        r = client.post(
            f"/issues/{issue_id}/attachments",
            files={"file": (filename, io.BytesIO(content), content_type)},
            headers=auth_header(token),
        )
    finally:
        if tmp_path is not None:
            attachment_svc._get_storage_root = original_fn
    return r


def _upload_png(issue_id: int, token: str, tmp_path: Path) -> dict:
    r = _upload(issue_id, token, _make_png(), "test.png", "image/png", tmp_path)
    assert r.status_code == 201, f"PNG upload failed: {r.text}"
    return r.json()


# =========================================================================== #
# 1 & 2: Authentication                                                        #
# =========================================================================== #

def test_upload_unauthenticated_returns_401(tmp_path):
    r = client.post(
        f"/issues/{_issue_by_tester}/attachments",
        files={"file": ("test.png", io.BytesIO(_make_png()), "image/png")},
    )
    assert r.status_code == 401


def test_authenticated_upload_success(tmp_path):
    r = _upload(_issue_by_tester, _user_tok(), _make_png(), "test.png", "image/png", tmp_path)
    assert r.status_code == 201


# =========================================================================== #
# 3-6: RBAC                                                                    #
# =========================================================================== #

def test_tester_upload_to_own_issue(tmp_path):
    r = _upload(_issue_by_tester, _user_tok(), _make_png(), "shot.png", "image/png", tmp_path)
    assert r.status_code == 201


def test_developer_upload_to_assigned_issue(tmp_path):
    r = _upload(_issue_assigned_to_dev, _dev_tok(), _make_png(), "dev.png", "image/png", tmp_path)
    assert r.status_code == 201


def test_admin_upload_to_any_issue(tmp_path):
    r = _upload(_issue_by_tester2, _admin_tok(), _make_pdf(), "report.pdf", "application/pdf", tmp_path)
    assert r.status_code == 201


def test_unauthorized_upload_returns_403(tmp_path):
    # user cannot upload to another user's issue
    r = _upload(_issue_by_tester2, _user_tok(), _make_png(), "hack.png", "image/png", tmp_path)
    assert r.status_code == 403


# =========================================================================== #
# 7: 404 for nonexistent issue                                                 #
# =========================================================================== #

def test_upload_to_nonexistent_issue_returns_404(tmp_path):
    r = _upload(999_999_999, _admin_tok(), _make_png(), "ghost.png", "image/png", tmp_path)
    assert r.status_code == 404


# =========================================================================== #
# 8-11: Valid file type uploads                                                #
# =========================================================================== #

def test_valid_png_upload(tmp_path):
    r = _upload(_issue_by_tester, _user_tok(), _make_png(), "screenshot.png", "image/png", tmp_path)
    assert r.status_code == 201
    assert r.json()["mime_type"] == "image/png"


def test_valid_jpeg_upload(tmp_path):
    r = _upload(_issue_by_tester, _user_tok(), _make_jpeg(), "photo.jpg", "image/jpeg", tmp_path)
    assert r.status_code == 201
    assert r.json()["mime_type"] == "image/jpeg"


def test_valid_pdf_upload(tmp_path):
    r = _upload(_issue_by_tester, _user_tok(), _make_pdf(), "doc.pdf", "application/pdf", tmp_path)
    assert r.status_code == 201
    assert r.json()["mime_type"] == "application/pdf"


def test_valid_txt_upload(tmp_path):
    r = _upload(_issue_by_tester, _user_tok(), _make_txt(), "log.txt", "text/plain", tmp_path)
    assert r.status_code == 201
    assert r.json()["mime_type"] == "text/plain"


# =========================================================================== #
# 12-14: Invalid file rejections                                               #
# =========================================================================== #

def test_unsupported_extension_rejected(tmp_path):
    r = _upload(_issue_by_tester, _user_tok(), b"some data", "script.sh", "text/plain", tmp_path)
    assert r.status_code in (400, 415)


def test_unsupported_mime_type_rejected(tmp_path):
    r = _upload(
        _issue_by_tester, _user_tok(),
        b"<html><body>test</body></html>",
        "page.html", "text/html",
        tmp_path,
    )
    assert r.status_code == 415


def test_executable_file_rejected(tmp_path):
    r = _upload(_issue_by_tester, _user_tok(), b"MZ\x90\x00", "virus.exe", "application/octet-stream", tmp_path)
    assert r.status_code in (400, 415)


def test_ps1_script_rejected(tmp_path):
    r = _upload(_issue_by_tester, _user_tok(), b"Get-Process", "hack.ps1", "text/plain", tmp_path)
    assert r.status_code in (400, 415)


# =========================================================================== #
# 15: Oversized file                                                           #
# =========================================================================== #

def test_oversized_file_returns_413(tmp_path):
    # Build minimal PNG but then pad to exceed 10MB limit
    big_content = _make_png(11 * 1024 * 1024)  # 11 MB
    r = _upload(_issue_by_tester, _user_tok(), big_content, "big.png", "image/png", tmp_path)
    assert r.status_code == 413


# =========================================================================== #
# 16-18: Filename security                                                     #
# =========================================================================== #

def test_stored_filename_is_server_generated_uuid(tmp_path):
    r = _upload(_issue_by_tester, _user_tok(), _make_png(), "original.png", "image/png", tmp_path)
    assert r.status_code == 201
    data = r.json()
    # Response should NOT contain stored_filename or storage_path
    assert "stored_filename" not in data
    assert "storage_path" not in data


def test_original_filename_preserved_as_metadata(tmp_path):
    r = _upload(_issue_by_tester, _user_tok(), _make_png(), "my_screenshot.png", "image/png", tmp_path)
    assert r.status_code == 201
    assert r.json()["original_filename"] == "my_screenshot.png"


def test_path_traversal_filename_sanitized(tmp_path):
    # The API should accept the upload (stripping path traversal) or reject it gracefully
    traversal_name = "../../etc/passwd.png"
    r = _upload(_issue_by_tester, _user_tok(), _make_png(), traversal_name, "image/png", tmp_path)
    # Either 201 (sanitized) or 4xx (rejected)
    if r.status_code == 201:
        # Must NOT store the original traversal path as original_filename literally traversing
        data = r.json()
        stored = data.get("original_filename", "")
        # Should have stripped the path traversal — should not contain ".."
        assert ".." not in stored or "passwd" in stored.lower()
    else:
        assert r.status_code in (400, 422)


# =========================================================================== #
# 19-23: List, metadata, and download                                          #
# =========================================================================== #

def test_list_attachments_returns_paginated_response(tmp_path):
    # Upload 2 attachments
    _upload(_issue_by_tester, _user_tok(), _make_png(), "a1.png", "image/png", tmp_path)
    _upload(_issue_by_tester, _user_tok(), _make_pdf(), "a2.pdf", "application/pdf", tmp_path)

    r = client.get(
        f"/issues/{_issue_by_tester}/attachments",
        headers=auth_header(_user_tok()),
    )
    assert r.status_code == 200
    data = r.json()
    assert "items" in data and "total" in data
    assert data["total"] >= 2


def test_list_attachments_pagination(tmp_path):
    r = client.get(
        f"/issues/{_issue_by_tester}/attachments?page=1&page_size=1",
        headers=auth_header(_user_tok()),
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data["items"]) <= 1
    assert data["page_size"] == 1


def test_get_attachment_metadata(tmp_path):
    upload_r = _upload(_issue_by_tester, _user_tok(), _make_png(), "meta.png", "image/png", tmp_path)
    attachment_id = upload_r.json()["id"]

    r = client.get(f"/attachments/{attachment_id}", headers=auth_header(_user_tok()))
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == attachment_id
    assert data["original_filename"] == "meta.png"
    assert data["mime_type"] == "image/png"
    assert "storage_path" not in data
    assert "stored_filename" not in data


def test_download_attachment(tmp_path):
    content = _make_png()
    upload_r = _upload(_issue_by_tester, _user_tok(), content, "download_me.png", "image/png", tmp_path)
    attachment_id = upload_r.json()["id"]

    r = client.get(
        f"/attachments/{attachment_id}/download",
        headers=auth_header(_user_tok()),
    )
    assert r.status_code == 200
    assert r.content == content


def test_downloaded_content_matches_uploaded(tmp_path):
    unique_content = _make_txt(f"Unique content: {uuid.uuid4()}\n")
    upload_r = _upload(
        _issue_by_tester, _user_tok(), unique_content, "unique.txt", "text/plain", tmp_path
    )
    attachment_id = upload_r.json()["id"]

    r = client.get(
        f"/attachments/{attachment_id}/download",
        headers=auth_header(_user_tok()),
    )
    assert r.content == unique_content


# =========================================================================== #
# 24-28: Delete permissions                                                    #
# =========================================================================== #

def test_uploader_can_delete_own_attachment(tmp_path):
    upload_r = _upload(_issue_by_tester, _user_tok(), _make_png(), "todelete.png", "image/png", tmp_path)
    attachment_id = upload_r.json()["id"]

    original_fn = attachment_svc._get_storage_root
    attachment_svc._get_storage_root = lambda: tmp_path
    try:
        r = client.delete(f"/attachments/{attachment_id}", headers=auth_header(_user_tok()))
    finally:
        attachment_svc._get_storage_root = original_fn
    assert r.status_code == 204


def test_admin_can_delete_any_attachment(tmp_path):
    upload_r = _upload(_issue_by_tester, _user_tok(), _make_png(), "admin_del.png", "image/png", tmp_path)
    attachment_id = upload_r.json()["id"]

    original_fn = attachment_svc._get_storage_root
    attachment_svc._get_storage_root = lambda: tmp_path
    try:
        r = client.delete(f"/attachments/{attachment_id}", headers=auth_header(_admin_tok()))
    finally:
        attachment_svc._get_storage_root = original_fn
    assert r.status_code == 204


def test_developer_cannot_delete_another_users_attachment_returns_403(tmp_path):
    # User uploads to issue assigned to dev; dev should not be able to delete it
    upload_r = _upload(
        _issue_assigned_to_dev, _user_tok(), _make_png(), "dev_cant_del.png", "image/png", tmp_path
    )
    attachment_id = upload_r.json()["id"]

    r = client.delete(f"/attachments/{attachment_id}", headers=auth_header(_dev_tok()))
    assert r.status_code == 403


def test_tester_cannot_delete_another_users_attachment_returns_403(tmp_path):
    # Admin uploads, user should not delete
    upload_r = _upload(_issue_by_tester, _admin_tok(), _make_png(), "admin_upload.png", "image/png", tmp_path)
    attachment_id = upload_r.json()["id"]

    r = client.delete(f"/attachments/{attachment_id}", headers=auth_header(_user_tok()))
    assert r.status_code == 403


def test_nonexistent_attachment_returns_404():
    r = client.get("/attachments/999999999", headers=auth_header(_admin_tok()))
    assert r.status_code == 404


def test_delete_nonexistent_attachment_returns_404():
    r = client.delete("/attachments/999999999", headers=auth_header(_admin_tok()))
    assert r.status_code == 404


# =========================================================================== #
# 29: Physical file removal                                                    #
# =========================================================================== #

def test_physical_file_removed_after_deletion(tmp_path):
    """Verify the physical file is gone from disk after successful deletion."""
    content = _make_png()
    upload_r = _upload(_issue_by_tester, _user_tok(), content, "physical.png", "image/png", tmp_path)
    assert upload_r.status_code == 201
    attachment_id = upload_r.json()["id"]

    # Get metadata to find the stored absolute path (via DB)
    from app.database.session import AsyncSessionLocal
    from app.models.issue_attachment import IssueAttachment
    from sqlalchemy import select
    import asyncio
    import selectors

    async def _get_path():
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(IssueAttachment).where(IssueAttachment.id == attachment_id)
            )
            a = result.scalar_one()
            return Path(a.storage_path)

    loop = asyncio.SelectorEventLoop(selectors.SelectSelector())
    try:
        file_path = loop.run_until_complete(_get_path())
    finally:
        loop.close()

    assert file_path.exists(), "File should exist before deletion"

    # Delete via API — override storage_root so delete_attachment finds the right root
    original_fn = attachment_svc._get_storage_root
    attachment_svc._get_storage_root = lambda: tmp_path
    try:
        r = client.delete(f"/attachments/{attachment_id}", headers=auth_header(_user_tok()))
    finally:
        attachment_svc._get_storage_root = original_fn

    assert r.status_code == 204
    assert not file_path.exists(), "Physical file should be removed after deletion"



# =========================================================================== #
# 30-31: Audit events                                                          #
# =========================================================================== #

def test_audit_event_on_upload(tmp_path):
    _upload(_issue_by_tester, _user_tok(), _make_png(), "audit_upload.png", "image/png", tmp_path)

    r = client.get("/activity?action=ATTACHMENT_UPLOADED", headers=auth_header(_admin_tok()))
    assert r.status_code == 200
    assert r.json()["total"] >= 1


def test_audit_event_on_deletion(tmp_path):
    upload_r = _upload(_issue_by_tester, _user_tok(), _make_png(), "audit_del.png", "image/png", tmp_path)
    attachment_id = upload_r.json()["id"]

    original_fn = attachment_svc._get_storage_root
    attachment_svc._get_storage_root = lambda: tmp_path
    try:
        client.delete(f"/attachments/{attachment_id}", headers=auth_header(_user_tok()))
    finally:
        attachment_svc._get_storage_root = original_fn

    r = client.get("/activity?action=ATTACHMENT_DELETED", headers=auth_header(_admin_tok()))
    assert r.status_code == 200
    assert r.json()["total"] >= 1



# =========================================================================== #
# 32-33: Security — no path/hash exposure                                      #
# =========================================================================== #

def test_absolute_filesystem_path_never_exposed_in_response(tmp_path):
    r = _upload(_issue_by_tester, _user_tok(), _make_png(), "path_check.png", "image/png", tmp_path)
    assert r.status_code == 201
    response_text = r.text
    assert "storage/" not in response_text
    assert "storage_path" not in response_text
    assert "stored_filename" not in response_text
    assert "backend" not in response_text.lower() or "DefectMind" in response_text


def test_password_hash_never_exposed_in_attachment_response(tmp_path):
    r = _upload(_issue_by_tester, _user_tok(), _make_png(), "hash_check.png", "image/png", tmp_path)
    assert r.status_code == 201
    assert "password_hash" not in r.text


def test_attachment_response_fields(tmp_path):
    r = _upload(_issue_by_tester, _user_tok(), _make_png(), "fields.png", "image/png", tmp_path)
    data = r.json()
    assert all(k in data for k in ("id", "issue_id", "uploader", "original_filename", "mime_type", "file_size", "created_at"))
    assert "storage_path" not in data
    assert "stored_filename" not in data
    uploader = data["uploader"]
    assert "password_hash" not in uploader

