"""
Phase 7 tests: Issue Comments API.

Uses conftest.py-provided verified tokens (no OTP flow).

Covers:
  1. Authenticated comment creation
  2. Unauthenticated creation → 401
  3. Tester can comment on own issue
  4. Developer can comment on assigned issue
  5. Admin can comment on any issue
  6. Developer cannot comment on unassigned issue → 403
  7. Tester cannot comment on another tester's issue → 403
  8. Comment body validation (empty)
  9. Whitespace-only body rejection
  10. Maximum body length (10,000 chars)
  11. List comments (GET /issues/{id}/comments)
  12. Pagination
  13. Get single comment (GET /comments/{id})
  14. Author can update own comment
  15. Author cannot update another user's comment → 403
  16. Admin can update any comment
  17. Author can delete own comment
  18. Author cannot delete another user's comment → 403
  19. Admin can delete any comment
  20. Nonexistent issue → 404
  21. Nonexistent comment → 404
  22. Audit event for create
  23. Audit event for update
  24. Audit event for delete
  25. password_hash never exposed in responses
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import (
    admin_token,
    auth_header,
    dev2_token,
    dev_token,
    tester2_token,
    tester_token,
    user2_token,
    user_token,
)

_admin_tok = admin_token
_dev_tok = dev_token
_dev2_tok = dev2_token
_tester_tok = tester_token
_tester2_tok = tester2_token
_user_tok = user_token
_user2_tok = user2_token

client = TestClient(app)


# =========================================================================== #
# Helpers                                                                      #
# =========================================================================== #

def _fresh_key(prefix: str = "CMT") -> str:
    uid = uuid.uuid4().hex[:6].upper()
    return f"{prefix}{uid}"[:20]


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
    pytest.fail(f"Could not create or find project {key}")


def _create_issue(project_id: int, token: str, title_suffix: str = "") -> int:
    r = client.post(
        "/issues",
        json={
            "project_id": project_id,
            "title": f"Comment Test Issue {title_suffix or uuid.uuid4().hex[:6]}",
            "description": "Testing comments on this issue.",
        },
        headers=auth_header(token),
    )
    assert r.status_code == 201, f"Issue creation failed: {r.text}"
    return r.json()["id"]


def _assign_issue(issue_id: int, developer_email: str) -> None:
    """Get developer ID and assign the issue."""
    users_r = client.get(
        f"/users?search={developer_email}", headers=auth_header(_admin_tok())
    )
    dev_id = None
    for u in users_r.json()["items"]:
        if u["email"] == developer_email:
            dev_id = u["id"]
            break
    if dev_id is None:
        pytest.fail(f"Could not find developer {developer_email}")
    r = client.patch(
        f"/issues/{issue_id}/assign",
        json={"developer_id": dev_id},
        headers=auth_header(_admin_tok()),
    )
    assert r.status_code == 200, f"Assign failed: {r.text}"


# Shared project and issues for comment tests
_PROJ_KEY = _fresh_key("CMT")
_proj_id: int = 0
_issue_by_tester: int = 0      # reported by user
_issue_by_tester2: int = 0     # reported by user2
_issue_assigned_to_dev: int = 0  # reported by user, assigned to dev


def _setup():
    global _proj_id, _issue_by_tester, _issue_by_tester2, _issue_assigned_to_dev
    _proj_id = _get_or_create_project(_PROJ_KEY, f"Comment Test Project {_PROJ_KEY}")
    _issue_by_tester = _create_issue(_proj_id, _user_tok(), "OwnedByUser")
    _issue_by_tester2 = _create_issue(_proj_id, _user2_tok(), "OwnedByUser2")
    _issue_assigned_to_dev = _create_issue(_proj_id, _user_tok(), "AssignedToDev")
    _assign_issue(_issue_assigned_to_dev, "dev.p4ci@example.com")


_setup()


def _post_comment(issue_id: int, body: str, token: str) -> dict:
    r = client.post(
        f"/issues/{issue_id}/comments",
        json={"body": body},
        headers=auth_header(token),
    )
    return r


# =========================================================================== #
# 1 & 2: Authentication                                                        #
# =========================================================================== #

def test_create_comment_unauthenticated_returns_401():
    r = client.post(f"/issues/{_issue_by_tester}/comments", json={"body": "hello"})
    assert r.status_code == 401


def test_create_comment_authenticated_success():
    r = _post_comment(_issue_by_tester, "This is a valid comment.", _user_tok())
    assert r.status_code == 201
    data = r.json()
    assert data["body"] == "This is a valid comment."
    assert data["issue_id"] == _issue_by_tester
    assert "author" in data
    assert "password_hash" not in str(data)


# =========================================================================== #
# 3-7: RBAC                                                                    #
# =========================================================================== #

def test_tester_can_comment_on_own_issue():
    r = _post_comment(_issue_by_tester, "User own issue comment.", _user_tok())
    assert r.status_code == 201


def test_developer_can_comment_on_assigned_issue():
    r = _post_comment(_issue_assigned_to_dev, "Dev comment on assigned issue.", _dev_tok())
    assert r.status_code == 201


def test_admin_can_comment_on_any_issue():
    r = _post_comment(_issue_by_tester2, "Admin comment on any issue.", _admin_tok())
    assert r.status_code == 201


def test_developer_cannot_comment_on_unassigned_issue_returns_403():
    r = _post_comment(_issue_by_tester, "Dev should not comment here.", _dev_tok())
    assert r.status_code == 403


def test_tester_cannot_comment_on_another_testers_issue_returns_403():
    r = _post_comment(_issue_by_tester2, "User should not comment here.", _user_tok())
    assert r.status_code == 403


# =========================================================================== #
# 8-10: Body validation                                                        #
# =========================================================================== #

def test_empty_body_rejected_422():
    r = _post_comment(_issue_by_tester, "", _user_tok())
    assert r.status_code == 422


def test_whitespace_only_body_rejected():
    r = _post_comment(_issue_by_tester, "   \n\t  ", _user_tok())
    assert r.status_code == 422


def test_maximum_body_length_accepted():
    body = "A" * 10_000
    r = _post_comment(_issue_by_tester, body, _user_tok())
    assert r.status_code == 201
    assert len(r.json()["body"]) == 10_000


def test_over_maximum_body_length_rejected():
    body = "A" * 10_001
    r = _post_comment(_issue_by_tester, body, _user_tok())
    assert r.status_code == 422


# =========================================================================== #
# 11-13: Listing and retrieval                                                 #
# =========================================================================== #

def test_list_comments_returns_paginated_response():
    # Create a few comments
    for i in range(3):
        _post_comment(_issue_by_tester, f"List test comment {i}", _user_tok())

    r = client.get(
        f"/issues/{_issue_by_tester}/comments",
        headers=auth_header(_user_tok()),
    )
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "page_size" in data
    assert "total_pages" in data
    assert data["total"] >= 3


def test_list_comments_pagination():
    r = client.get(
        f"/issues/{_issue_by_tester}/comments?page=1&page_size=2",
        headers=auth_header(_user_tok()),
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data["items"]) <= 2
    assert data["page"] == 1
    assert data["page_size"] == 2


def test_get_single_comment_success():
    # Create a comment and retrieve it
    create_r = _post_comment(_issue_by_tester, "Single comment retrieval test.", _user_tok())
    assert create_r.status_code == 201
    comment_id = create_r.json()["id"]

    r = client.get(f"/comments/{comment_id}", headers=auth_header(_user_tok()))
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == comment_id
    assert data["body"] == "Single comment retrieval test."


def test_list_comments_unauthorized_returns_403():
    r = client.get(
        f"/issues/{_issue_by_tester2}/comments",
        headers=auth_header(_user_tok()),
    )
    assert r.status_code == 403


# =========================================================================== #
# 14-16: Update                                                                #
# =========================================================================== #

def test_author_can_update_own_comment():
    create_r = _post_comment(_issue_by_tester, "Original body.", _user_tok())
    comment_id = create_r.json()["id"]

    r = client.patch(
        f"/comments/{comment_id}",
        json={"body": "Updated body."},
        headers=auth_header(_user_tok()),
    )
    assert r.status_code == 200
    assert r.json()["body"] == "Updated body."


def test_author_cannot_update_another_users_comment_returns_403():
    # Admin posts a comment on any issue
    admin_comment_r = _post_comment(_issue_by_tester, "Admin comment.", _admin_tok())
    assert admin_comment_r.status_code == 201
    comment_id = admin_comment_r.json()["id"]

    # User tries to update admin's comment
    r = client.patch(
        f"/comments/{comment_id}",
        json={"body": "User should not update this."},
        headers=auth_header(_user_tok()),
    )
    assert r.status_code == 403


def test_admin_can_update_any_comment():
    create_r = _post_comment(_issue_by_tester, "User comment for admin update.", _user_tok())
    comment_id = create_r.json()["id"]

    r = client.patch(
        f"/comments/{comment_id}",
        json={"body": "Admin updated this comment."},
        headers=auth_header(_admin_tok()),
    )
    assert r.status_code == 200
    assert r.json()["body"] == "Admin updated this comment."


# =========================================================================== #
# 17-19: Delete                                                                #
# =========================================================================== #

def test_author_can_delete_own_comment():
    create_r = _post_comment(_issue_by_tester, "Comment to delete.", _user_tok())
    comment_id = create_r.json()["id"]

    r = client.delete(f"/comments/{comment_id}", headers=auth_header(_user_tok()))
    assert r.status_code == 204

    # Verify it's gone
    get_r = client.get(f"/comments/{comment_id}", headers=auth_header(_user_tok()))
    assert get_r.status_code == 404


def test_author_cannot_delete_another_users_comment_returns_403():
    admin_comment_r = _post_comment(_issue_by_tester, "Admin comment to protect.", _admin_tok())
    comment_id = admin_comment_r.json()["id"]

    r = client.delete(f"/comments/{comment_id}", headers=auth_header(_user_tok()))
    assert r.status_code == 403


def test_admin_can_delete_any_comment():
    create_r = _post_comment(_issue_by_tester, "User comment for admin deletion.", _user_tok())
    comment_id = create_r.json()["id"]

    r = client.delete(f"/comments/{comment_id}", headers=auth_header(_admin_tok()))
    assert r.status_code == 204


# =========================================================================== #
# 20-21: 404 cases                                                             #
# =========================================================================== #

def test_comment_on_nonexistent_issue_returns_404():
    r = _post_comment(999_999_999, "Comment on ghost issue.", _admin_tok())
    assert r.status_code == 404


def test_get_nonexistent_comment_returns_404():
    r = client.get("/comments/999999999", headers=auth_header(_admin_tok()))
    assert r.status_code == 404


def test_update_nonexistent_comment_returns_404():
    r = client.patch(
        "/comments/999999999",
        json={"body": "Update ghost."},
        headers=auth_header(_admin_tok()),
    )
    assert r.status_code == 404


def test_delete_nonexistent_comment_returns_404():
    r = client.delete("/comments/999999999", headers=auth_header(_admin_tok()))
    assert r.status_code == 404


# =========================================================================== #
# 22-24: Audit events                                                          #
# =========================================================================== #

def test_audit_event_created_on_comment_creation():
    create_r = _post_comment(_issue_by_tester, "Audit test comment.", _user_tok())
    assert create_r.status_code == 201

    audit_r = client.get("/activity?action=COMMENT_CREATED", headers=auth_header(_admin_tok()))
    assert audit_r.status_code == 200
    assert audit_r.json()["total"] >= 1


def test_audit_event_created_on_comment_update():
    create_r = _post_comment(_issue_by_tester, "Before update.", _user_tok())
    comment_id = create_r.json()["id"]
    client.patch(
        f"/comments/{comment_id}",
        json={"body": "After update."},
        headers=auth_header(_user_tok()),
    )

    audit_r = client.get("/activity?action=COMMENT_UPDATED", headers=auth_header(_admin_tok()))
    assert audit_r.status_code == 200
    assert audit_r.json()["total"] >= 1


def test_audit_event_created_on_comment_delete():
    create_r = _post_comment(_issue_by_tester, "To delete for audit.", _user_tok())
    comment_id = create_r.json()["id"]
    client.delete(f"/comments/{comment_id}", headers=auth_header(_user_tok()))

    audit_r = client.get("/activity?action=COMMENT_DELETED", headers=auth_header(_admin_tok()))
    assert audit_r.status_code == 200
    assert audit_r.json()["total"] >= 1


# =========================================================================== #
# 25: Security — no sensitive data leakage                                     #
# =========================================================================== #

def test_password_hash_never_exposed_in_comment_response():
    r = _post_comment(_issue_by_tester, "Security check comment.", _user_tok())
    assert r.status_code == 201
    assert "password_hash" not in r.text


def test_comment_response_includes_expected_fields():
    r = _post_comment(_issue_by_tester, "Field check comment.", _user_tok())
    data = r.json()
    assert all(k in data for k in ("id", "issue_id", "author", "body", "created_at", "updated_at"))
    assert all(k in data["author"] for k in ("id", "full_name", "role"))
    assert "email" not in data["author"]          # not in CommentAuthorBrief
    assert "password_hash" not in data["author"]
