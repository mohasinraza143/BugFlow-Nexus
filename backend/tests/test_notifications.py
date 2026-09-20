"""
test_notifications.py — Phase 8 tests for notification APIs.

Covers:
  - GET /notifications (pagination, unread_only, notification_type filtering)
  - GET /notifications/unread-count
  - GET /notifications/{id} (owner access + 403 privacy check)
  - PATCH /notifications/{id}/read
  - PATCH /notifications/read-all
  - DELETE /notifications/{id} (owner access + 403 privacy check)
  - GET /notifications/preferences (get-or-create)
  - PATCH /notifications/preferences (partial update)
  - 401 Unauthorized for unauthenticated requests
  - Business event triggers (issue assign, status change, resolve, reopen, comment, attachment, role change, activation/deactivation)
"""

import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.notification import NotificationType
from tests.conftest import (
    admin_token,
    auth_header,
    dev_token,
    dev2_token,
    tester_token,
    tester2_token,
    user_token,
)

client = TestClient(app)


# --------------------------------------------------------------------------- #
# Helper fixtures / setups                                                     #
# --------------------------------------------------------------------------- #

def _unique_str() -> str:
    return uuid.uuid4().hex[:8]


def _create_project(token: str) -> int:
    key = f"P{_unique_str().upper()[:4]}"
    r = client.post(
        "/projects",
        json={"project_key": key, "name": f"Project {key}", "description": "Test project"},
        headers=auth_header(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _create_issue(project_id: int, token: str) -> int:
    r = client.post(
        "/issues",
        json={
            "project_id": project_id,
            "title": f"Issue {_unique_str()}",
            "description": "Test defect description",
            "issue_type": "BUG",
            "severity": "CRITICAL",
            "priority": "HIGH",
        },
        headers=auth_header(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _get_user_id_by_email(email: str, token: str) -> int:
    r = client.get(f"/users?search={email}", headers=auth_header(token))
    assert r.status_code == 200, r.text
    for u in r.json()["items"]:
        if u["email"] == email:
            return u["id"]
    pytest.fail(f"User with email {email} not found")


# --------------------------------------------------------------------------- #
# Unauthenticated access (401)                                                 #
# --------------------------------------------------------------------------- #

class TestUnauthenticatedAccess:
    def test_list_notifications_no_auth(self):
        r = client.get("/notifications")
        assert r.status_code == 401

    def test_unread_count_no_auth(self):
        r = client.get("/notifications/unread-count")
        assert r.status_code == 401

    def test_preferences_no_auth(self):
        r = client.get("/notifications/preferences")
        assert r.status_code == 401

    def test_update_preferences_no_auth(self):
        r = client.patch("/notifications/preferences", json={"email_enabled": False})
        assert r.status_code == 401

    def test_read_all_no_auth(self):
        r = client.patch("/notifications/read-all")
        assert r.status_code == 401

    def test_get_notification_no_auth(self):
        r = client.get("/notifications/9999")
        assert r.status_code == 401

    def test_mark_read_no_auth(self):
        r = client.patch("/notifications/9999/read")
        assert r.status_code == 401

    def test_delete_notification_no_auth(self):
        r = client.delete("/notifications/9999")
        assert r.status_code == 401


# --------------------------------------------------------------------------- #
# Preferences CRUD                                                            #
# --------------------------------------------------------------------------- #

class TestNotificationPreferences:
    def test_get_preferences_creates_defaults(self):
        tok = tester_token()
        r = client.get("/notifications/preferences", headers=auth_header(tok))
        assert r.status_code == 200
        data = r.json()
        assert data["email_enabled"] is True
        assert data["issue_assigned"] is True
        assert data["issue_status_changed"] is True
        assert data["issue_resolved"] is True
        assert data["issue_reopened"] is True
        assert data["issue_commented"] is True
        assert data["attachment_added"] is True

    def test_patch_preferences_partial(self):
        tok = dev_token()
        # Update email_enabled and issue_commented only
        r = client.patch(
            "/notifications/preferences",
            json={"email_enabled": False, "issue_commented": False},
            headers=auth_header(tok),
        )
        assert r.status_code == 200
        data = r.json()
        assert data["email_enabled"] is False
        assert data["issue_commented"] is False
        assert data["issue_assigned"] is True

        # Re-fetch to confirm persistence
        r_get = client.get("/notifications/preferences", headers=auth_header(tok))
        assert r_get.status_code == 200
        assert r_get.json()["email_enabled"] is False
        assert r_get.json()["issue_commented"] is False

        # Reset back to True
        client.patch(
            "/notifications/preferences",
            json={"email_enabled": True, "issue_commented": True},
            headers=auth_header(tok),
        )


# --------------------------------------------------------------------------- #
# Notification Flow & Operations (List, Read, Delete, Unread Count)            #
# --------------------------------------------------------------------------- #

class TestNotificationOperations:
    def test_assignment_triggers_notification_and_operations(self):
        adm = admin_token()
        dev = dev_token()
        usr = user_token()
        tst = tester_token()

        # Create project and issue
        proj_id = _create_project(adm)
        issue_id = _create_issue(proj_id, usr)

        dev_id = _get_user_id_by_email("dev.p4ci@example.com", adm)

        # Get dev's initial unread count
        r_count_init = client.get("/notifications/unread-count", headers=auth_header(dev))
        assert r_count_init.status_code == 200
        init_unread = r_count_init.json()["unread_count"]

        # Admin assigns issue to dev
        r_assign = client.patch(
            f"/issues/{issue_id}/assign",
            json={"developer_id": dev_id},
            headers=auth_header(adm),
        )
        assert r_assign.status_code == 200

        # Check dev's unread count increased by at least 1
        r_count_after = client.get("/notifications/unread-count", headers=auth_header(dev))
        assert r_count_after.status_code == 200
        assert r_count_after.json()["unread_count"] >= init_unread + 1

        # Check dev's notification list
        r_list = client.get(
            "/notifications?unread_only=true&notification_type=ISSUE_ASSIGNED",
            headers=auth_header(dev),
        )
        assert r_list.status_code == 200
        data = r_list.json()
        assert data["total"] >= 1
        notif = next((n for n in data["items"] if n["entity_id"] == issue_id), None)
        assert notif is not None
        assert notif["notification_type"] == "ISSUE_ASSIGNED"
        assert notif["is_read"] is False
        assert notif["read_at"] is None
        notif_id = notif["id"]

        # Dev reads the single notification
        r_single = client.get(f"/notifications/{notif_id}", headers=auth_header(dev))
        assert r_single.status_code == 200
        assert r_single.json()["id"] == notif_id

        # Privacy check: tester cannot view dev's notification (403)
        r_forbidden = client.get(f"/notifications/{notif_id}", headers=auth_header(tst))
        assert r_forbidden.status_code == 403

        # Mark notification as read
        r_mark = client.patch(f"/notifications/{notif_id}/read", headers=auth_header(dev))
        assert r_mark.status_code == 200
        assert r_mark.json()["is_read"] is True
        assert r_mark.json()["read_at"] is not None

        # Privacy check: tester cannot delete dev's notification (403)
        r_del_forbidden = client.delete(f"/notifications/{notif_id}", headers=auth_header(tst))
        assert r_del_forbidden.status_code == 403

        # Dev deletes notification
        r_del = client.delete(f"/notifications/{notif_id}", headers=auth_header(dev))
        assert r_del.status_code == 204

        # Confirm 404 after deletion
        r_not_found = client.get(f"/notifications/{notif_id}", headers=auth_header(dev))
        assert r_not_found.status_code == 404

    def test_mark_all_read(self):
        adm = admin_token()
        dev = dev_token()
        usr = user_token()

        proj_id = _create_project(adm)
        issue_id1 = _create_issue(proj_id, usr)
        issue_id2 = _create_issue(proj_id, usr)
        dev_id = _get_user_id_by_email("dev.p4ci@example.com", adm)

        client.patch(f"/issues/{issue_id1}/assign", json={"developer_id": dev_id}, headers=auth_header(adm))
        client.patch(f"/issues/{issue_id2}/assign", json={"developer_id": dev_id}, headers=auth_header(adm))

        # Bulk mark all read
        r_bulk = client.patch("/notifications/read-all", headers=auth_header(dev))
        assert r_bulk.status_code == 200
        assert r_bulk.json()["unread_count"] == 0

        # Verify unread count is 0
        r_count = client.get("/notifications/unread-count", headers=auth_header(dev))
        assert r_count.status_code == 200
        assert r_count.json()["unread_count"] == 0


# --------------------------------------------------------------------------- #
# Event Trigger Tests                                                         #
# --------------------------------------------------------------------------- #

class TestNotificationEventTriggers:
    def test_status_update_and_resolve_and_reopen_notifications(self):
        adm = admin_token()
        dev = dev_token()
        usr = user_token()

        proj_id = _create_project(adm)
        issue_id = _create_issue(proj_id, usr)
        dev_id = _get_user_id_by_email("dev.p4ci@example.com", adm)

        # 1. Admin assigns issue to dev
        client.patch(f"/issues/{issue_id}/assign", json={"developer_id": dev_id}, headers=auth_header(adm))

        # 2. Dev changes status to IN_DEVELOPMENT -> Reporter (user) gets notified
        r_status = client.patch(
            f"/issues/{issue_id}/status",
            json={"status": "IN_DEVELOPMENT"},
            headers=auth_header(dev),
        )
        assert r_status.status_code == 200

        r_usr_notifs = client.get(
            "/notifications?notification_type=ISSUE_STATUS_CHANGED",
            headers=auth_header(usr),
        )
        assert r_usr_notifs.status_code == 200
        found_status_notif = any(n["entity_id"] == issue_id for n in r_usr_notifs.json()["items"])
        assert found_status_notif is True

        # 3. Dev resolves issue -> Reporter (user) gets notified
        r_resolve = client.patch(
            f"/issues/{issue_id}/resolve",
            json={"resolution_summary": "Bug has been fixed completely"},
            headers=auth_header(dev),
        )
        assert r_resolve.status_code == 200

        r_usr_res = client.get(
            "/notifications?notification_type=ISSUE_RESOLVED",
            headers=auth_header(usr),
        )
        assert r_usr_res.status_code == 200
        found_res_notif = any(n["entity_id"] == issue_id for n in r_usr_res.json()["items"])
        assert found_res_notif is True

        # 4. User reopens issue -> Assignee (dev) gets notified
        r_reopen = client.patch(
            f"/issues/{issue_id}/reopen",
            json={"reason": "Reproduced on staging again"},
            headers=auth_header(usr),
        )
        assert r_reopen.status_code == 200

        r_dev_reopen = client.get(
            "/notifications?notification_type=ISSUE_REOPENED",
            headers=auth_header(dev),
        )
        assert r_dev_reopen.status_code == 200
        found_reopen_notif = any(n["entity_id"] == issue_id for n in r_dev_reopen.json()["items"])
        assert found_reopen_notif is True

    def test_comment_and_attachment_notifications(self):
        adm = admin_token()
        dev = dev_token()
        usr = user_token()

        proj_id = _create_project(adm)
        issue_id = _create_issue(proj_id, usr)
        dev_id = _get_user_id_by_email("dev.p4ci@example.com", adm)
        client.patch(f"/issues/{issue_id}/assign", json={"developer_id": dev_id}, headers=auth_header(adm))

        # Dev comments -> User gets notified, Dev (actor) is NOT notified
        r_comment = client.post(
            f"/issues/{issue_id}/comments",
            json={"body": "Investigating this defect right now."},
            headers=auth_header(dev),
        )
        assert r_comment.status_code == 201

        # Check user got notification
        r_usr = client.get(
            "/notifications?notification_type=ISSUE_COMMENTED",
            headers=auth_header(usr),
        )
        assert r_usr.status_code == 200
        assert any(n["entity_id"] == issue_id for n in r_usr.json()["items"])

        # Dev uploads attachment -> User gets notified
        png_content = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01"
            b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        r_attach = client.post(
            f"/issues/{issue_id}/attachments",
            files={"file": ("screenshot.png", png_content, "image/png")},
            headers=auth_header(dev),
        )
        assert r_attach.status_code == 201

        r_usr_att = client.get(
            "/notifications?notification_type=ATTACHMENT_ADDED",
            headers=auth_header(usr),
        )
        assert r_usr_att.status_code == 200
        assert any(n["entity_id"] == issue_id for n in r_usr_att.json()["items"])

    def test_user_management_notifications(self):
        adm = admin_token()
        dev2 = dev2_token()
        dev2_id = _get_user_id_by_email("dev2.p4ci@example.com", adm)

        # Role change notification
        r_role = client.patch(
            f"/users/{dev2_id}/role",
            json={"role": "TESTER"},
            headers=auth_header(adm),
        )
        assert r_role.status_code == 200

        r_dev2_role = client.get(
            "/notifications?notification_type=USER_ROLE_CHANGED",
            headers=auth_header(dev2),
        )
        assert r_dev2_role.status_code == 200
        assert len(r_dev2_role.json()["items"]) >= 1

        # Revert role back to DEVELOPER
        client.patch(
            f"/users/{dev2_id}/role",
            json={"role": "DEVELOPER"},
            headers=auth_header(adm),
        )

        # Deactivate user notification
        r_deact = client.patch(f"/users/{dev2_id}/deactivate", headers=auth_header(adm))
        assert r_deact.status_code == 200

        # Reactivate user notification
        r_act = client.patch(f"/users/{dev2_id}/activate", headers=auth_header(adm))
        assert r_act.status_code == 200

        r_dev2_act = client.get(
            "/notifications?notification_type=USER_ACTIVATED",
            headers=auth_header(dev2),
        )
        assert r_dev2_act.status_code == 200
        assert len(r_dev2_act.json()["items"]) >= 1
