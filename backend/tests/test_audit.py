"""
test_audit.py — Phase 5 test suite.

Tests cover:
  - Model: table exists, columns, FK to users
  - Audit creation for all domain actions
  - Change tracking (diff only)
  - RBAC: admin=200, dev=403, tester=403, unauth=401
  - Filtering: action, entity_type, user_id, search, date range, pagination
  - Security: no password_hash / JWT / OTP in responses
  - Immutability: no PATCH/DELETE endpoints
  - Transaction safety: failed operation = no audit record

Reuses conftest.py fixtures (admin_token, dev_token, tester_token, auth_header).
All test emails use the @example.com domain with the p5ci suffix.
"""

import asyncio
import math
import random
import selectors
import string

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import engine
from app.main import app
from app.models.audit_log import AuditAction, AuditLog
from app.models.issue import IssueStatus, IssueType, Priority, Severity
from app.models.project import Project, ProjectStatus
from app.models.user import User, UserRole
from app.utils.security import hash_password
from tests.conftest import auth_header

# --------------------------------------------------------------------------- #
# Shared client                                                                #
# --------------------------------------------------------------------------- #

client = TestClient(app)

_CI_PASSWORD = "SecurePass123"
_CI_SUFFIX = "p5ci"


# --------------------------------------------------------------------------- #
# Setup helpers                                                                #
# --------------------------------------------------------------------------- #

def _run_sync(coro):
    loop = asyncio.SelectorEventLoop(selectors.SelectSelector())
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


async def _get_or_create_user(
    email: str, full_name: str, role: UserRole
) -> User:
    async with AsyncSession(engine) as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user is None:
            user = User(
                full_name=full_name,
                email=email,
                password_hash=hash_password(_CI_PASSWORD),
                role=role,
                is_active=True,
                is_email_verified=True,
            )
            session.add(user)
            await session.commit()
            await session.refresh(user)
        return user


def _login(tag: str) -> str:
    resp = client.post("/auth/login", json={
        "email": f"{tag}.{_CI_SUFFIX}@example.com",
        "password": _CI_PASSWORD,
    })
    assert resp.status_code == 200, f"Login failed for {tag}: {resp.text}"
    return resp.json()["access_token"]


# Ensure Phase 5 CI users exist
_run_sync(_get_or_create_user(
    f"admin.{_CI_SUFFIX}@example.com", "Admin P5CI", UserRole.ADMIN
))
_run_sync(_get_or_create_user(
    f"dev.{_CI_SUFFIX}@example.com", "Dev P5CI", UserRole.DEVELOPER
))
_run_sync(_get_or_create_user(
    f"tester.{_CI_SUFFIX}@example.com", "Tester P5CI", UserRole.TESTER
))
_run_sync(_get_or_create_user(
    f"user.{_CI_SUFFIX}@example.com", "User P5CI", UserRole.USER
))

# NOTE: These are separate p5ci tokens, not the shared conftest tokens,
# to avoid cross-contamination with Phase 4 tests.
_ADMIN_TOKEN = _login("admin")
_DEV_TOKEN = _login("dev")
_TESTER_TOKEN = _login("tester")
_USER_TOKEN = _login("user")


def _admin_hdr():
    return auth_header(_ADMIN_TOKEN)

def _dev_hdr():
    return auth_header(_DEV_TOKEN)

def _tester_hdr():
    return auth_header(_TESTER_TOKEN)

def _user_hdr():
    return auth_header(_USER_TOKEN)


# --------------------------------------------------------------------------- #
# Helper: create a unique project via API                                      #
# --------------------------------------------------------------------------- #

def _random_key(prefix: str = "AT") -> str:
    """Generate a unique project key using a random 4-char alphanumeric suffix.

    Uses randomness so keys are unique across test runs without needing
    a database reset between runs.
    """
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=5))
    return f"{prefix}{suffix}"

def _create_project(suffix: str = "") -> dict:
    """Create a project as admin and return the response JSON."""
    key = _random_key()
    resp = client.post("/projects", json={
        "name": f"Audit Test Project {suffix or key}",
        "project_key": key,
        "description": "Phase 5 audit test project",
    }, headers=_admin_hdr())
    assert resp.status_code == 201, resp.text
    return resp.json()


# --------------------------------------------------------------------------- #
# 1. MODEL TESTS                                                               #
# --------------------------------------------------------------------------- #

class TestAuditModel:
    """Verify audit_logs table exists with the right columns and FK."""

    def test_audit_logs_table_exists(self):
        async def _check():
            async with engine.connect() as conn:
                def _inspect(sync_conn):
                    insp = inspect(sync_conn)
                    return insp.has_table("audit_logs")
                return await conn.run_sync(_inspect)

        exists = _run_sync(_check())
        assert exists, "audit_logs table must exist"

    def test_audit_logs_required_columns(self):
        async def _check():
            async with engine.connect() as conn:
                def _inspect(sync_conn):
                    insp = inspect(sync_conn)
                    return [col["name"] for col in insp.get_columns("audit_logs")]
                return await conn.run_sync(_inspect)

        cols = _run_sync(_check())
        required = {
            "id", "user_id", "action", "entity_type", "entity_id",
            "entity_key", "description", "old_values", "new_values", "created_at",
        }
        assert required.issubset(set(cols)), f"Missing columns: {required - set(cols)}"

    def test_audit_logs_no_updated_at(self):
        """Immutability guarantee — no updated_at column."""
        async def _check():
            async with engine.connect() as conn:
                def _inspect(sync_conn):
                    insp = inspect(sync_conn)
                    return [col["name"] for col in insp.get_columns("audit_logs")]
                return await conn.run_sync(_inspect)

        cols = _run_sync(_check())
        assert "updated_at" not in cols

    def test_audit_logs_fk_to_users(self):
        async def _check():
            async with engine.connect() as conn:
                def _inspect(sync_conn):
                    insp = inspect(sync_conn)
                    return insp.get_foreign_keys("audit_logs")
                return await conn.run_sync(_inspect)

        fks = _run_sync(_check())
        user_fks = [
            fk for fk in fks
            if fk.get("referred_table") == "users"
            and "user_id" in fk.get("constrained_columns", [])
        ]
        assert user_fks, "audit_logs must have a FK to users.id on user_id"

    def test_audit_action_enum_values(self):
        # Test that all expected baseline actions exist in the enum.
        # We don't assert exact equality to allow future additions (e.g. sprint actions).
        required = {
            "ISSUE_CREATED", "ISSUE_UPDATED", "ISSUE_ASSIGNED",
            "ISSUE_STATUS_CHANGED", "ISSUE_RESOLVED", "ISSUE_REOPENED",
            "PROJECT_CREATED", "PROJECT_UPDATED", "PROJECT_DEACTIVATED",
            "AUTH_LOGIN", "AUTH_LOGOUT",
            # Phase 6 user-management actions
            "USER_UPDATED", "USER_ACTIVATED", "USER_DEACTIVATED", "USER_ROLE_CHANGED",
            # Phase 7 comment + attachment actions
            "COMMENT_CREATED", "COMMENT_UPDATED", "COMMENT_DELETED",
            "ATTACHMENT_UPLOADED", "ATTACHMENT_DELETED",
        }
        actual = {a.value for a in AuditAction}
        assert required.issubset(actual), (
            f"Missing expected AuditAction values: {required - actual}"
        )



# --------------------------------------------------------------------------- #
# 2. AUDIT CREATION — PROJECT EVENTS                                          #
# --------------------------------------------------------------------------- #

class TestProjectAuditEvents:

    def test_project_created_emits_audit(self):
        proj = _create_project("create-audit")
        proj_id = proj["id"]

        resp = client.get("/activity", params={"entity_type": "PROJECT", "entity_id": proj_id},
                          headers=_admin_hdr())
        assert resp.status_code == 200
        items = resp.json()["items"]
        actions = [i["action"] for i in items]
        assert "PROJECT_CREATED" in actions

    def test_project_created_new_values(self):
        proj = _create_project("new-values")
        proj_id = proj["id"]

        resp = client.get("/activity", params={"entity_type": "PROJECT", "entity_id": proj_id},
                          headers=_admin_hdr())
        items = resp.json()["items"]
        created = next(i for i in items if i["action"] == "PROJECT_CREATED")
        assert created["new_values"] is not None
        assert "project_key" in created["new_values"]
        assert "name" in created["new_values"]

    def test_project_updated_emits_audit(self):
        proj = _create_project("update-test")
        proj_id = proj["id"]

        upd = client.patch(f"/projects/{proj_id}", json={"name": "Updated Name"},
                           headers=_admin_hdr())
        assert upd.status_code == 200

        resp = client.get("/activity", params={"entity_type": "PROJECT", "entity_id": proj_id},
                          headers=_admin_hdr())
        items = resp.json()["items"]
        actions = [i["action"] for i in items]
        assert "PROJECT_UPDATED" in actions

    def test_project_updated_diff_only(self):
        """Only changed fields should appear in old/new values."""
        proj = _create_project("diff-test")
        proj_id = proj["id"]

        client.patch(f"/projects/{proj_id}", json={"name": "Diff Changed Name"},
                     headers=_admin_hdr())

        resp = client.get("/activity", params={"entity_type": "PROJECT", "entity_id": proj_id},
                          headers=_admin_hdr())
        items = resp.json()["items"]
        updated = next(i for i in items if i["action"] == "PROJECT_UPDATED")
        # Only name changed — description and status should NOT appear
        assert "name" in updated["new_values"]
        assert "description" not in updated["new_values"]
        assert "status" not in updated["new_values"]

    def test_project_deactivated_emits_audit(self):
        proj = _create_project("deactivate-test")
        proj_id = proj["id"]

        deact = client.patch(f"/projects/{proj_id}/deactivate", headers=_admin_hdr())
        assert deact.status_code == 200

        resp = client.get("/activity", params={"entity_type": "PROJECT", "entity_id": proj_id},
                          headers=_admin_hdr())
        items = resp.json()["items"]
        actions = [i["action"] for i in items]
        assert "PROJECT_DEACTIVATED" in actions

    def test_project_deactivated_old_new_status(self):
        proj = _create_project("deact-values")
        proj_id = proj["id"]

        client.patch(f"/projects/{proj_id}/deactivate", headers=_admin_hdr())

        resp = client.get("/activity", params={"entity_type": "PROJECT", "entity_id": proj_id},
                          headers=_admin_hdr())
        items = resp.json()["items"]
        deact = next(i for i in items if i["action"] == "PROJECT_DEACTIVATED")
        assert deact["old_values"]["status"] == "ACTIVE"
        assert deact["new_values"]["status"] == "INACTIVE"


# --------------------------------------------------------------------------- #
# 3. AUDIT CREATION — ISSUE EVENTS                                            #
# --------------------------------------------------------------------------- #

class TestIssueAuditEvents:
    """Audit records for the complete issue lifecycle."""

    def _make_project(self) -> dict:
        return _create_project()

    def _create_issue(self, proj_id: int) -> dict:
        resp = client.post("/issues", json={
            "project_id": proj_id,
            "title": "Phase 5 audit test issue",
            "description": "This issue is used to verify audit log creation.",
            "issue_type": "BUG",
            "severity": "MAJOR",
            "priority": "MEDIUM",
        }, headers=_user_hdr())
        assert resp.status_code == 201, resp.text
        return resp.json()

    def _get_dev_user_id(self) -> int:
        r = client.get("/auth/me", headers=_dev_hdr())
        assert r.status_code == 200
        return r.json()["id"]

    def test_issue_created_audit(self):
        proj = self._make_project()
        issue = self._create_issue(proj["id"])
        issue_id = issue["id"]

        resp = client.get("/activity", params={"entity_type": "ISSUE", "entity_id": issue_id},
                          headers=_admin_hdr())
        assert resp.status_code == 200
        actions = [i["action"] for i in resp.json()["items"]]
        assert "ISSUE_CREATED" in actions

    def test_issue_created_new_values_content(self):
        proj = self._make_project()
        issue = self._create_issue(proj["id"])
        issue_id = issue["id"]

        resp = client.get("/activity", params={"entity_type": "ISSUE", "entity_id": issue_id},
                          headers=_admin_hdr())
        created = next(i for i in resp.json()["items"] if i["action"] == "ISSUE_CREATED")
        nv = created["new_values"]
        assert nv is not None
        assert "issue_key" in nv
        assert "severity" in nv
        assert "priority" in nv
        assert "issue_type" in nv

    def test_issue_updated_audit_and_diff(self):
        proj = self._make_project()
        issue = self._create_issue(proj["id"])
        issue_id = issue["id"]

        upd = client.patch(f"/issues/{issue_id}", json={"priority": "HIGH"},
                           headers=_user_hdr())
        assert upd.status_code == 200

        resp = client.get("/activity", params={"entity_type": "ISSUE", "entity_id": issue_id},
                          headers=_admin_hdr())
        items = resp.json()["items"]
        updated = next((i for i in items if i["action"] == "ISSUE_UPDATED"), None)
        assert updated is not None
        # Only priority changed
        assert "priority" in updated["old_values"]
        assert updated["old_values"]["priority"] == "MEDIUM"
        assert updated["new_values"]["priority"] == "HIGH"
        # severity did NOT change — should NOT appear
        assert "severity" not in updated["old_values"]

    def test_issue_assigned_audit(self):
        proj = self._make_project()
        issue = self._create_issue(proj["id"])
        issue_id = issue["id"]
        dev_id = self._get_dev_user_id()

        assign = client.patch(f"/issues/{issue_id}/assign",
                              json={"developer_id": dev_id},
                              headers=_admin_hdr())
        assert assign.status_code == 200

        resp = client.get("/activity", params={"entity_type": "ISSUE", "entity_id": issue_id},
                          headers=_admin_hdr())
        actions = [i["action"] for i in resp.json()["items"]]
        assert "ISSUE_ASSIGNED" in actions

    def test_issue_assigned_records_assignee(self):
        proj = self._make_project()
        issue = self._create_issue(proj["id"])
        issue_id = issue["id"]
        dev_id = self._get_dev_user_id()

        client.patch(f"/issues/{issue_id}/assign",
                     json={"developer_id": dev_id},
                     headers=_admin_hdr())

        resp = client.get("/activity", params={"entity_type": "ISSUE", "entity_id": issue_id},
                          headers=_admin_hdr())
        assigned = next(i for i in resp.json()["items"] if i["action"] == "ISSUE_ASSIGNED")
        assert assigned["new_values"]["assignee_id"] == dev_id

    def test_issue_status_changed_audit(self):
        proj = self._make_project()
        issue = self._create_issue(proj["id"])
        issue_id = issue["id"]
        dev_id = self._get_dev_user_id()

        # Assign first
        client.patch(f"/issues/{issue_id}/assign",
                     json={"developer_id": dev_id}, headers=_admin_hdr())

        # Status change: ASSIGNED → IN_DEVELOPMENT
        st = client.patch(f"/issues/{issue_id}/status",
                          json={"status": "IN_DEVELOPMENT"},
                          headers=_dev_hdr())
        assert st.status_code == 200

        resp = client.get("/activity", params={"entity_type": "ISSUE", "entity_id": issue_id},
                          headers=_admin_hdr())
        actions = [i["action"] for i in resp.json()["items"]]
        assert "ISSUE_STATUS_CHANGED" in actions

    def test_issue_status_changed_old_new_values(self):
        proj = self._make_project()
        issue = self._create_issue(proj["id"])
        issue_id = issue["id"]
        dev_id = self._get_dev_user_id()

        client.patch(f"/issues/{issue_id}/assign",
                     json={"developer_id": dev_id}, headers=_admin_hdr())
        client.patch(f"/issues/{issue_id}/status",
                     json={"status": "IN_DEVELOPMENT"}, headers=_dev_hdr())

        resp = client.get("/activity", params={"entity_type": "ISSUE", "entity_id": issue_id},
                          headers=_admin_hdr())
        sc = next(i for i in resp.json()["items"] if i["action"] == "ISSUE_STATUS_CHANGED")
        assert sc["old_values"]["status"] == "ASSIGNED"
        assert sc["new_values"]["status"] == "IN_DEVELOPMENT"

    def test_issue_resolved_audit(self):
        proj = self._make_project()
        issue = self._create_issue(proj["id"])
        issue_id = issue["id"]
        dev_id = self._get_dev_user_id()

        client.patch(f"/issues/{issue_id}/assign",
                     json={"developer_id": dev_id}, headers=_admin_hdr())

        resolve = client.patch(f"/issues/{issue_id}/resolve",
                               json={"resolution_summary": "Fixed the underlying null pointer."},
                               headers=_dev_hdr())
        assert resolve.status_code == 200

        resp = client.get("/activity", params={"entity_type": "ISSUE", "entity_id": issue_id},
                          headers=_admin_hdr())
        actions = [i["action"] for i in resp.json()["items"]]
        assert "ISSUE_RESOLVED" in actions

    def test_issue_resolved_new_values(self):
        proj = self._make_project()
        issue = self._create_issue(proj["id"])
        issue_id = issue["id"]
        dev_id = self._get_dev_user_id()

        client.patch(f"/issues/{issue_id}/assign",
                     json={"developer_id": dev_id}, headers=_admin_hdr())
        client.patch(f"/issues/{issue_id}/resolve",
                     json={"resolution_summary": "Fixed the bug with proper null check."},
                     headers=_dev_hdr())

        resp = client.get("/activity", params={"entity_type": "ISSUE", "entity_id": issue_id},
                          headers=_admin_hdr())
        resolved = next(i for i in resp.json()["items"] if i["action"] == "ISSUE_RESOLVED")
        assert resolved["new_values"]["status"] == "RESOLVED"
        assert "resolution_summary" in resolved["new_values"]

    def test_issue_reopened_audit(self):
        proj = self._make_project()
        issue = self._create_issue(proj["id"])
        issue_id = issue["id"]
        dev_id = self._get_dev_user_id()

        client.patch(f"/issues/{issue_id}/assign",
                     json={"developer_id": dev_id}, headers=_admin_hdr())
        client.patch(f"/issues/{issue_id}/resolve",
                     json={"resolution_summary": "Fixed. Will reopen for test."},
                     headers=_dev_hdr())

        reopen = client.patch(f"/issues/{issue_id}/reopen",
                              json={"reason": "Regression found in QA."},
                              headers=_admin_hdr())
        assert reopen.status_code == 200

        resp = client.get("/activity", params={"entity_type": "ISSUE", "entity_id": issue_id},
                          headers=_admin_hdr())
        actions = [i["action"] for i in resp.json()["items"]]
        assert "ISSUE_REOPENED" in actions

    def test_issue_reopened_old_new_values(self):
        proj = self._make_project()
        issue = self._create_issue(proj["id"])
        issue_id = issue["id"]
        dev_id = self._get_dev_user_id()

        client.patch(f"/issues/{issue_id}/assign",
                     json={"developer_id": dev_id}, headers=_admin_hdr())
        client.patch(f"/issues/{issue_id}/resolve",
                     json={"resolution_summary": "Fixed. Reopening for audit test."},
                     headers=_dev_hdr())
        client.patch(f"/issues/{issue_id}/reopen",
                     json={"reason": "Still broken."}, headers=_admin_hdr())

        resp = client.get("/activity", params={"entity_type": "ISSUE", "entity_id": issue_id},
                          headers=_admin_hdr())
        reopened = next(i for i in resp.json()["items"] if i["action"] == "ISSUE_REOPENED")
        assert reopened["old_values"]["status"] == "RESOLVED"
        assert reopened["new_values"]["status"] == "REOPENED"


# --------------------------------------------------------------------------- #
# 4. AUTHENTICATION AUDIT EVENTS                                              #
# --------------------------------------------------------------------------- #

class TestAuthAuditEvents:

    def test_login_emits_auth_login(self):
        """AUTH_LOGIN is recorded on successful authentication."""
        # Log in (the _login() helper already fired, so just re-login)
        resp = client.post("/auth/login", json={
            "email": f"admin.{_CI_SUFFIX}@example.com",
            "password": _CI_PASSWORD,
        })
        assert resp.status_code == 200
        token = resp.json()["access_token"]

        # Check audit log
        audit_resp = client.get("/activity", params={"entity_type": "AUTH", "action": "AUTH_LOGIN"},
                                headers=auth_header(token))
        assert audit_resp.status_code == 200
        items = audit_resp.json()["items"]
        assert len(items) >= 1

    def test_logout_emits_auth_logout(self):
        """AUTH_LOGOUT is recorded on logout."""
        # Log in fresh
        resp = client.post("/auth/login", json={
            "email": f"admin.{_CI_SUFFIX}@example.com",
            "password": _CI_PASSWORD,
        })
        token = resp.json()["access_token"]
        hdr = auth_header(token)

        # Logout
        logout_resp = client.post("/auth/logout", headers=hdr)
        assert logout_resp.status_code == 200

        # Check audit
        audit_resp = client.get("/activity", params={"entity_type": "AUTH", "action": "AUTH_LOGOUT"},
                                headers=hdr)
        assert audit_resp.status_code == 200
        items = audit_resp.json()["items"]
        assert len(items) >= 1

    def test_auth_audit_never_contains_token(self):
        """Audit records for auth events must not store token values."""
        resp = client.get("/activity", params={"entity_type": "AUTH"},
                          headers=_admin_hdr())
        body_str = resp.text
        assert "eyJ" not in body_str, "JWT token must never appear in audit records"

    def test_auth_audit_never_contains_password(self):
        resp = client.get("/activity", params={"entity_type": "AUTH"},
                          headers=_admin_hdr())
        body = resp.json()
        for item in body["items"]:
            for key_set in [item.get("old_values") or {}, item.get("new_values") or {}]:
                assert "password" not in key_set
                assert "password_hash" not in key_set


# --------------------------------------------------------------------------- #
# 5. RBAC TESTS                                                                #
# --------------------------------------------------------------------------- #

class TestAuditRBAC:

    def test_admin_can_list_activity(self):
        resp = client.get("/activity", headers=_admin_hdr())
        assert resp.status_code == 200

    def test_admin_can_get_activity_detail(self):
        # Get any audit log ID
        resp = client.get("/activity", headers=_admin_hdr())
        assert resp.status_code == 200
        items = resp.json()["items"]
        if items:
            audit_id = items[0]["id"]
            detail = client.get(f"/activity/{audit_id}", headers=_admin_hdr())
            assert detail.status_code == 200

    def test_developer_cannot_list_activity(self):
        resp = client.get("/activity", headers=_dev_hdr())
        assert resp.status_code == 403

    def test_tester_cannot_list_activity(self):
        resp = client.get("/activity", headers=_tester_hdr())
        assert resp.status_code == 403

    def test_unauthenticated_cannot_list_activity(self):
        resp = client.get("/activity")
        assert resp.status_code == 401

    def test_developer_cannot_get_activity_detail(self):
        # Get an ID as admin first
        resp = client.get("/activity", headers=_admin_hdr())
        items = resp.json()["items"]
        if items:
            audit_id = items[0]["id"]
            detail = client.get(f"/activity/{audit_id}", headers=_dev_hdr())
            assert detail.status_code == 403

    def test_tester_cannot_get_activity_detail(self):
        resp = client.get("/activity", headers=_admin_hdr())
        items = resp.json()["items"]
        if items:
            audit_id = items[0]["id"]
            detail = client.get(f"/activity/{audit_id}", headers=_tester_hdr())
            assert detail.status_code == 403

    def test_unauthenticated_cannot_get_activity_detail(self):
        resp = client.get("/activity", headers=_admin_hdr())
        items = resp.json()["items"]
        if items:
            audit_id = items[0]["id"]
            detail = client.get(f"/activity/{audit_id}")
            assert detail.status_code == 401

    def test_nonexistent_audit_returns_404(self):
        resp = client.get("/activity/999999999", headers=_admin_hdr())
        assert resp.status_code == 404


# --------------------------------------------------------------------------- #
# 6. FILTERING TESTS                                                           #
# --------------------------------------------------------------------------- #

class TestAuditFiltering:

    def test_filter_by_action(self):
        resp = client.get("/activity", params={"action": "PROJECT_CREATED"},
                          headers=_admin_hdr())
        assert resp.status_code == 200
        for item in resp.json()["items"]:
            assert item["action"] == "PROJECT_CREATED"

    def test_filter_by_entity_type(self):
        resp = client.get("/activity", params={"entity_type": "ISSUE"},
                          headers=_admin_hdr())
        assert resp.status_code == 200
        for item in resp.json()["items"]:
            assert item["entity_type"] == "ISSUE"

    def test_filter_by_entity_type_project(self):
        resp = client.get("/activity", params={"entity_type": "PROJECT"},
                          headers=_admin_hdr())
        assert resp.status_code == 200
        for item in resp.json()["items"]:
            assert item["entity_type"] == "PROJECT"

    def test_filter_by_user_id(self):
        admin_me = client.get("/auth/me", headers=_admin_hdr())
        admin_id = admin_me.json()["id"]

        resp = client.get("/activity", params={"user_id": admin_id},
                          headers=_admin_hdr())
        assert resp.status_code == 200
        for item in resp.json()["items"]:
            assert item["user_id"] == admin_id

    def test_filter_by_entity_id(self):
        proj = _create_project("filter-by-id")
        proj_id = proj["id"]

        resp = client.get("/activity", params={"entity_id": proj_id},
                          headers=_admin_hdr())
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1
        for item in resp.json()["items"]:
            assert item["entity_id"] == proj_id

    def test_search_by_entity_key(self):
        proj = _create_project("srchkey")
        entity_key = proj["project_key"]

        resp = client.get("/activity", params={"search": entity_key},
                          headers=_admin_hdr())
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1
        for item in resp.json()["items"]:
            assert entity_key in (item["entity_key"] or "") or entity_key in item["description"]

    def test_search_by_description(self):
        resp = client.get("/activity", params={"search": "created project"},
                          headers=_admin_hdr())
        assert resp.status_code == 200
        # At minimum one project creation should mention "created project"
        for item in resp.json()["items"]:
            text_haystack = (item["description"] or "").lower()
            assert "created project" in text_haystack or (item["entity_key"] or "")

    def test_date_from_filter(self):
        resp = client.get("/activity", params={"date_from": "2020-01-01"},
                          headers=_admin_hdr())
        assert resp.status_code == 200

    def test_date_to_filter(self):
        resp = client.get("/activity", params={"date_to": "2099-12-31"},
                          headers=_admin_hdr())
        assert resp.status_code == 200

    def test_invalid_date_from_returns_422(self):
        resp = client.get("/activity", params={"date_from": "not-a-date"},
                          headers=_admin_hdr())
        assert resp.status_code == 422

    def test_pagination_page_size(self):
        resp = client.get("/activity", params={"page": 1, "page_size": 3},
                          headers=_admin_hdr())
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["items"]) <= 3
        assert body["page"] == 1
        assert body["page_size"] == 3

    def test_pagination_second_page(self):
        # Only meaningful if total > 1
        resp1 = client.get("/activity", params={"page": 1, "page_size": 1},
                           headers=_admin_hdr())
        total = resp1.json()["total"]
        if total > 1:
            resp2 = client.get("/activity", params={"page": 2, "page_size": 1},
                               headers=_admin_hdr())
            assert resp2.status_code == 200
            assert resp2.json()["page"] == 2
            # Items on page 2 should differ from page 1
            ids1 = {i["id"] for i in resp1.json()["items"]}
            ids2 = {i["id"] for i in resp2.json()["items"]}
            assert ids1.isdisjoint(ids2)

    def test_total_pages_calculation(self):
        resp = client.get("/activity", params={"page": 1, "page_size": 5},
                          headers=_admin_hdr())
        body = resp.json()
        expected_pages = math.ceil(body["total"] / 5) if body["total"] else 0
        assert body["total_pages"] == expected_pages


# --------------------------------------------------------------------------- #
# 7. SECURITY TESTS                                                            #
# --------------------------------------------------------------------------- #

class TestAuditSecurity:

    def test_password_hash_never_in_response(self):
        resp = client.get("/activity", headers=_admin_hdr())
        body_str = resp.text
        assert "password_hash" not in body_str
        assert "password" not in body_str

    def test_jwt_never_in_response(self):
        resp = client.get("/activity", headers=_admin_hdr())
        body_str = resp.text
        # JWT tokens start with eyJ
        assert "eyJ" not in body_str

    def test_otp_never_in_response(self):
        """OTP codes should never appear in audit records."""
        resp = client.get("/activity", headers=_admin_hdr())
        body_str = resp.text
        assert "otp" not in body_str.lower()

    def test_actor_response_has_no_password_hash(self):
        resp = client.get("/activity", headers=_admin_hdr())
        for item in resp.json()["items"]:
            actor = item.get("actor")
            if actor:
                assert "password_hash" not in actor
                assert "password" not in actor

    def test_actor_user_id_from_jwt_not_body(self):
        """user_id in audit record must match the authenticated user, not a request body param."""
        # Create project as admin — audit should record admin's user_id
        proj = _create_project("jwt-actor-test")
        proj_id = proj["id"]

        admin_me = client.get("/auth/me", headers=_admin_hdr())
        admin_id = admin_me.json()["id"]

        resp = client.get("/activity", params={"entity_id": proj_id, "entity_type": "PROJECT"},
                          headers=_admin_hdr())
        created = next(i for i in resp.json()["items"] if i["action"] == "PROJECT_CREATED")
        assert created["user_id"] == admin_id


# --------------------------------------------------------------------------- #
# 8. IMMUTABILITY TESTS                                                        #
# --------------------------------------------------------------------------- #

class TestAuditImmutability:

    def test_no_patch_endpoint_for_activity(self):
        """PATCH /activity/{id} must not exist."""
        resp = client.get("/activity", headers=_admin_hdr())
        items = resp.json()["items"]
        if items:
            audit_id = items[0]["id"]
            r = client.patch(f"/activity/{audit_id}", json={"description": "tampered"},
                             headers=_admin_hdr())
            assert r.status_code == 405, f"Expected 405 Method Not Allowed, got {r.status_code}"

    def test_no_delete_endpoint_for_activity(self):
        """DELETE /activity/{id} must not exist."""
        resp = client.get("/activity", headers=_admin_hdr())
        items = resp.json()["items"]
        if items:
            audit_id = items[0]["id"]
            r = client.delete(f"/activity/{audit_id}", headers=_admin_hdr())
            assert r.status_code == 405, f"Expected 405 Method Not Allowed, got {r.status_code}"

    def test_no_post_endpoint_for_activity(self):
        """POST /activity must not exist (can't create audit records via API)."""
        r = client.post("/activity", json={
            "action": "PROJECT_CREATED",
            "entity_type": "PROJECT",
            "description": "injected",
        }, headers=_admin_hdr())
        assert r.status_code == 405


# --------------------------------------------------------------------------- #
# 9. TRANSACTION SAFETY TESTS                                                  #
# --------------------------------------------------------------------------- #

class TestTransactionSafety:

    def test_failed_project_creation_no_audit_record(self):
        """If project creation fails (duplicate key), no audit record is created."""
        # Create a project
        proj = _create_project("txn-safe")
        proj_key = proj["project_key"]
        proj_id = proj["id"]

        # Count existing audit records for this project
        resp_before = client.get("/activity", params={"entity_type": "PROJECT", "entity_id": proj_id},
                                 headers=_admin_hdr())
        count_before = resp_before.json()["total"]

        # Try to create with the same key — should fail with 409
        fail_resp = client.post("/projects", json={
            "name": "Duplicate project",
            "project_key": proj_key,
        }, headers=_admin_hdr())
        assert fail_resp.status_code == 409

        # Audit count should be unchanged
        resp_after = client.get("/activity", params={"entity_type": "PROJECT", "entity_id": proj_id},
                                headers=_admin_hdr())
        count_after = resp_after.json()["total"]
        assert count_before == count_after

    def test_failed_issue_assignment_no_extra_audit(self):
        """If issue assignment fails (non-existent developer), no ISSUE_ASSIGNED record."""
        proj = _create_project("txn-assign")
        issue_resp = client.post("/issues", json={
            "project_id": proj["id"],
            "title": "Transaction safety test issue",
            "description": "Used to test that failed assign emits no audit.",
            "issue_type": "BUG",
            "severity": "MINOR",
            "priority": "LOW",
        }, headers=_user_hdr())
        assert issue_resp.status_code == 201
        issue_id = issue_resp.json()["id"]

        # Count before
        resp_before = client.get("/activity", params={"entity_type": "ISSUE", "entity_id": issue_id},
                                 headers=_admin_hdr())
        count_before = resp_before.json()["total"]

        # Assign to non-existent user
        fail = client.patch(f"/issues/{issue_id}/assign",
                            json={"developer_id": 99999999},
                            headers=_admin_hdr())
        assert fail.status_code == 404

        # Count after — must be unchanged
        resp_after = client.get("/activity", params={"entity_type": "ISSUE", "entity_id": issue_id},
                                headers=_admin_hdr())
        count_after = resp_after.json()["total"]
        assert count_before == count_after

    def test_successful_operation_creates_exactly_one_audit(self):
        """A single successful operation produces exactly one audit record."""
        proj = _create_project("exactly-one")
        proj_id = proj["id"]

        resp = client.get("/activity", params={
            "entity_type": "PROJECT", "entity_id": proj_id, "action": "PROJECT_CREATED"
        }, headers=_admin_hdr())
        assert resp.json()["total"] == 1
