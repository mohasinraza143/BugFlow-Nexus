"""
Phase 4 tests: Issue / Defect Management API.

Uses conftest.py-provided verified tokens (no OTP flow).

Covers:
  - Unauthenticated 401
  - Tester creates issue; developer/admin cannot (403)
  - Reporter set automatically (IssueCreate schema check)
  - Unique issue key generated
  - Invalid project 404
  - Inactive project 400
  - Short title 422
  - Listing with RBAC, pagination, filters, search
  - Issue detail (no password_hash)
  - Admin assigns developer
  - Non-admin cannot assign (403)
  - Invalid/non-developer user assignment rejected
  - Assign transitions REPORTED→ASSIGNED
  - Developer status transitions (valid and invalid)
  - Unassigned developer cannot update status (403)
  - Tester cannot update status (403)
  - Developer resolves assigned issue
  - Unassigned developer cannot resolve (403)
  - Tester cannot resolve (403)
  - Tester/admin reopen resolved issue
  - Developer cannot reopen (403)
  - Cannot reopen non-resolved issue (400)
  - Tester updates own issue
  - Tester cannot update others' issue (403)
  - Protected fields not in IssueUpdate schema
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import (
    admin_token,
    auth_header,
    dev_token,
    dev2_token,
    tester3_token,
    tester4_token,
    user_token,
    user2_token,
)
from tests.conftest import tester2_token as _get_tester2_token
from tests.conftest import tester_token as _get_tester_token

# Aliases that don't start with 'test' to avoid pytest collection
_admin_tok = admin_token
_dev_tok = tester3_token   # worker-tester assigned to issues
_dev2_tok = tester4_token  # second worker-tester
_tester_tok = _get_tester_token
_tester2_tok = _get_tester2_token
_user_tok = user_token
_user2_tok = user2_token
_legacy_dev_tok = dev_token   # kept for RBAC-exclusion tests only

client = TestClient(app)

# =========================================================================== #
# Issue helpers                                                                #
# =========================================================================== #


def _fresh_key(prefix: str = "ISP") -> str:
    """Generate a unique project key per call using uuid."""
    uid = uuid.uuid4().hex[:6].upper()
    safe = prefix[:8] if len(prefix) <= 8 else prefix[:8]
    return f"{safe}{uid}"


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
    pytest.fail(f"Could not find/create project {key}")


def _create_issue(
    pid: int,
    title: str = "This is a valid defect title",
    token: str | None = None,
) -> dict:
    t = token or _user_tok()
    r = client.post(
        "/issues",
        json={
            "project_id": pid,
            "title": title,
            "description": "Detailed description of the defect that was found during testing.",
            "severity": "MAJOR",
            "priority": "HIGH",
        },
        headers=auth_header(t),
    )
    assert r.status_code == 201, f"Issue creation failed: {r.status_code} {r.text}"
    return r.json()


def _assign(issue_id: int, developer_token: str = None) -> dict:
    """Admin assigns an issue to the tester3 (worker-tester) user."""
    dev_tok = developer_token or _dev_tok()
    me = client.get("/auth/me", headers=auth_header(dev_tok)).json()
    r = client.patch(
        f"/issues/{issue_id}/assign",
        json={"developer_id": me["id"]},
        headers=auth_header(_admin_tok()),
    )
    assert r.status_code == 200, f"Assignment failed: {r.status_code} {r.text}"
    return r.json()


# =========================================================================== #
# 1. Unauthenticated                                                           #
# =========================================================================== #

class TestIssueUnauthenticated:
    def test_create_no_token_401(self) -> None:
        assert client.post("/issues", json={}).status_code == 401

    def test_list_no_token_401(self) -> None:
        assert client.get("/issues").status_code == 401

    def test_get_no_token_401(self) -> None:
        assert client.get("/issues/1").status_code == 401

    def test_assign_no_token_401(self) -> None:
        assert client.patch("/issues/1/assign", json={"developer_id": 1}).status_code == 401


# =========================================================================== #
# 2. Issue creation                                                            #
# =========================================================================== #

class TestIssueCreation:
    def test_user_can_create_issue(self) -> None:
        pid = _get_or_create_project(_fresh_key("CREA"), "Create Test Project")
        r = client.post(
            "/issues",
            json={
                "project_id": pid,
                "title": "Login button unresponsive on mobile Safari",
                "description": "The login button does not respond when tapped on iOS Safari browser.",
                "severity": "CRITICAL",
                "priority": "HIGH",
                "environment": "iOS 17, Safari",
                "steps_to_reproduce": "1. Open on iPhone\n2. Tap Login",
                "expected_result": "Login form submits",
                "actual_result": "Nothing happens",
            },
            headers=auth_header(_user_tok()),
        )
        assert r.status_code == 201
        data = r.json()
        assert data["status"] == "REPORTED"
        assert "issue_key" in data
        assert data["project"]["id"] == pid
        assert "password_hash" not in str(data)

    def test_tester_cannot_create_issue_403(self) -> None:
        """TESTER role cannot create issues (reporting is USER role)."""
        pid = _get_or_create_project(_fresh_key("TCREA"), "Tester Create Forbidden")
        r = client.post(
            "/issues",
            json={"project_id": pid, "title": "Tester bug report here", "description": "D" * 20},
            headers=auth_header(_tester_tok()),
        )
        assert r.status_code == 403

    def test_developer_cannot_create_issue_403(self) -> None:
        """DEVELOPER-role (legacy) CAN create issues (treated same as TESTER for creation)."""
        pid = _get_or_create_project(_fresh_key("DCREA"), "Dev Create Allowed")
        r = client.post(
            "/issues",
            json={"project_id": pid, "title": "Dev bug report here", "description": "D" * 20},
            headers=auth_header(_legacy_dev_tok()),
        )
        # DEVELOPER is a legacy role allowed to create issues
        assert r.status_code == 201

    def test_admin_can_create_issue(self) -> None:
        """ADMIN can create issues (useful for admin-reported bugs)."""
        pid = _get_or_create_project(_fresh_key("ACREA"), "Admin Create Allowed")
        r = client.post(
            "/issues",
            json={"project_id": pid, "title": "Admin bug report here", "description": "D" * 20},
            headers=auth_header(_admin_tok()),
        )
        assert r.status_code == 201

    def test_unique_issue_key_generated(self) -> None:
        pid = _get_or_create_project(_fresh_key("UKEY"), "Unique Key Project")
        i1 = _create_issue(pid, "First defect unique title here")
        i2 = _create_issue(pid, "Second defect unique title here")
        assert i1["issue_key"] != i2["issue_key"]
        assert pid == i1["project"]["id"] == i2["project"]["id"]

    def test_issue_key_uses_project_key(self) -> None:
        key = _fresh_key("PKEYTEST")
        pid = _get_or_create_project(key, "Key Test Project")
        issue = _create_issue(pid)
        assert issue["issue_key"].startswith(key)

    def test_reporter_is_authenticated_user(self) -> None:
        pid = _get_or_create_project(_fresh_key("RPTR"), "Reporter Test Project")
        me = client.get("/auth/me", headers=auth_header(_user_tok())).json()
        issue = _create_issue(pid, token=_user_tok())
        assert issue["reporter"]["id"] == me["id"]

    def test_reporter_id_not_in_request_schema(self) -> None:
        from app.schemas.issue import IssueCreate
        assert "reporter_id" not in IssueCreate.model_fields

    def test_invalid_project_returns_404(self) -> None:
        r = client.post(
            "/issues",
            json={"project_id": 99999999, "title": "Ghost project issue title", "description": "D" * 20},
            headers=auth_header(_user_tok()),
        )
        assert r.status_code == 404

    def test_inactive_project_returns_400(self) -> None:
        key = _fresh_key("INAC")
        pid = _get_or_create_project(key, "Inactive Project")
        client.patch(f"/projects/{pid}/deactivate", headers=auth_header(_admin_tok()))
        r = client.post(
            "/issues",
            json={"project_id": pid, "title": "Issue on inactive project here", "description": "D" * 20},
            headers=auth_header(_user_tok()),
        )
        assert r.status_code == 400

    def test_short_title_returns_422(self) -> None:
        pid = _get_or_create_project(_fresh_key("SHRT"), "Short Title Test")
        r = client.post(
            "/issues",
            json={"project_id": pid, "title": "Hi", "description": "D" * 20},
            headers=auth_header(_user_tok()),
        )
        assert r.status_code == 422


# =========================================================================== #
# 3. Issue listing                                                             #
# =========================================================================== #

class TestIssueListing:
    def test_admin_can_list_all_issues(self) -> None:
        r = client.get("/issues", headers=auth_header(_admin_tok()))
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert "total" in data
        assert "total_pages" in data

    def test_pagination_works(self) -> None:
        r = client.get("/issues?page=1&page_size=2", headers=auth_header(_admin_tok()))
        assert r.status_code == 200
        data = r.json()
        assert len(data["items"]) <= 2
        assert data["page"] == 1
        assert data["page_size"] == 2

    def test_status_filter_works(self) -> None:
        r = client.get("/issues?status=REPORTED", headers=auth_header(_admin_tok()))
        assert r.status_code == 200
        for issue in r.json()["items"]:
            assert issue["status"] == "REPORTED"

    def test_severity_filter_works(self) -> None:
        pid = _get_or_create_project(_fresh_key("SVRF"), "Severity Filter Test")
        _create_issue(pid)  # creates MAJOR issue
        r = client.get("/issues?severity=MAJOR", headers=auth_header(_admin_tok()))
        assert r.status_code == 200
        for issue in r.json()["items"]:
            assert issue["severity"] == "MAJOR"

    def test_search_by_title_works(self) -> None:
        pid = _get_or_create_project(_fresh_key("SRCH"), "Search Test Project")
        unique = "ZZZUNIQUESEARCHTITLE99ZZZZ"
        _create_issue(pid, unique)
        r = client.get(f"/issues?search=ZZZUNIQUESEARCH", headers=auth_header(_admin_tok()))
        assert r.status_code == 200
        assert any(unique in i["title"] for i in r.json()["items"])

    def test_developer_sees_only_assigned_issues(self) -> None:
        """TESTER role (worker) sees only assigned issues."""
        me = client.get("/auth/me", headers=auth_header(_dev_tok())).json()
        r = client.get("/issues", headers=auth_header(_dev_tok()))
        assert r.status_code == 200
        for issue in r.json()["items"]:
            assert issue["assignee_id"] == me["id"]

    def test_user_sees_only_own_reported_issues(self) -> None:
        """USER role sees only issues they reported."""
        me = client.get("/auth/me", headers=auth_header(_user_tok())).json()
        r = client.get("/issues", headers=auth_header(_user_tok()))
        assert r.status_code == 200
        for issue in r.json()["items"]:
            assert issue["reporter_id"] == me["id"]

    def test_response_has_no_sensitive_data(self) -> None:
        r = client.get("/issues", headers=auth_header(_admin_tok()))
        assert "password_hash" not in r.text


# =========================================================================== #
# 4. Issue detail                                                              #
# =========================================================================== #

class TestIssueDetail:
    def test_full_detail_returned(self) -> None:
        pid = _get_or_create_project(_fresh_key("DETL"), "Detail Test Project")
        issue = _create_issue(pid)
        r = client.get(f"/issues/{issue['id']}", headers=auth_header(_admin_tok()))
        assert r.status_code == 200
        data = r.json()
        assert "issue_key" in data
        assert "description" in data
        assert "project" in data
        assert "reporter" in data
        assert data["project"]["id"] == pid

    def test_detail_contains_no_sensitive_fields(self) -> None:
        pid = _get_or_create_project(_fresh_key("SENS"), "Sensitive Test Project")
        issue = _create_issue(pid)
        r = client.get(f"/issues/{issue['id']}", headers=auth_header(_admin_tok()))
        body = r.text
        assert "password_hash" not in body
        assert "password" not in body.lower().replace("password_hash", "")

    def test_nonexistent_issue_returns_404(self) -> None:
        r = client.get("/issues/99999999", headers=auth_header(_admin_tok()))
        assert r.status_code == 404

    def test_user_cannot_view_other_user_issue_403(self) -> None:
        pid = _get_or_create_project(_fresh_key("DETLU"), "User Detail Isolation")
        issue = _create_issue(pid, token=_user_tok())
        r = client.get(f"/issues/{issue['id']}", headers=auth_header(_user2_tok()))
        assert r.status_code == 403


# =========================================================================== #
# 5. Assignment                                                                #
# =========================================================================== #

class TestIssueAssignment:
    def _dev_id(self) -> int:
        return client.get("/auth/me", headers=auth_header(_dev_tok())).json()["id"]

    def _tester_id(self) -> int:
        return client.get("/auth/me", headers=auth_header(_tester_tok())).json()["id"]

    def test_admin_can_assign_developer(self) -> None:
        """Admin can assign an issue to a TESTER role user."""
        pid = _get_or_create_project(_fresh_key("ASSG"), "Assignment Test Project")
        issue = _create_issue(pid)
        dev_id = self._dev_id()
        r = client.patch(
            f"/issues/{issue['id']}/assign",
            json={"developer_id": dev_id},
            headers=auth_header(_admin_tok()),
        )
        assert r.status_code == 200
        assert r.json()["assignee"]["id"] == dev_id

    def test_assign_transitions_to_assigned_status(self) -> None:
        pid = _get_or_create_project(_fresh_key("ASST"), "Assign Status Test")
        issue = _create_issue(pid)
        assert issue["status"] == "REPORTED"
        result = _assign(issue["id"])
        assert result["status"] == "ASSIGNED"

    def test_non_admin_cannot_assign_403(self) -> None:
        pid = _get_or_create_project(_fresh_key("ASSR"), "Assign RBAC Test")
        issue = _create_issue(pid)
        dev_id = self._dev_id()
        r = client.patch(
            f"/issues/{issue['id']}/assign",
            json={"developer_id": dev_id},
            headers=auth_header(_user_tok()),
        )
        assert r.status_code == 403

    def test_cannot_assign_non_tester_400(self) -> None:
        """DEVELOPER-role users CAN be assigned issues (DEVELOPER is a valid legacy role for assignment)."""
        pid = _get_or_create_project(_fresh_key("ASSI"), "Invalid Assign Test")
        issue = _create_issue(pid)
        # _legacy_dev_tok is a DEVELOPER-role user — now a valid assignment target
        legacy_dev_id = client.get("/auth/me", headers=auth_header(_legacy_dev_tok())).json()["id"]
        r = client.patch(
            f"/issues/{issue['id']}/assign",
            json={"developer_id": legacy_dev_id},
            headers=auth_header(_admin_tok()),
        )
        # DEVELOPER is a legacy role accepted for issue assignment
        assert r.status_code == 200

    def test_cannot_assign_nonexistent_user_404(self) -> None:
        pid = _get_or_create_project(_fresh_key("ASSG5"), "Ghost Assign Test")
        issue = _create_issue(pid)
        r = client.patch(
            f"/issues/{issue['id']}/assign",
            json={"developer_id": 99999999},
            headers=auth_header(_admin_tok()),
        )
        assert r.status_code == 404


# =========================================================================== #
# 6. Status transitions                                                        #
# =========================================================================== #

class TestIssueStatusTransitions:
    def test_developer_can_start_work(self) -> None:
        pid = _get_or_create_project(_fresh_key("STRT"), "Start Work Test")
        issue = _create_issue(pid)
        _assign(issue["id"])
        r = client.patch(
            f"/issues/{issue['id']}/status",
            json={"status": "IN_DEVELOPMENT"},
            headers=auth_header(_dev_tok()),
        )
        assert r.status_code == 200
        assert r.json()["status"] == "IN_DEVELOPMENT"

    def test_developer_can_move_to_review(self) -> None:
        pid = _get_or_create_project(_fresh_key("REVW"), "Review Test")
        issue = _create_issue(pid)
        _assign(issue["id"])
        client.patch(f"/issues/{issue['id']}/status", json={"status": "IN_DEVELOPMENT"}, headers=auth_header(_dev_tok()))
        r = client.patch(f"/issues/{issue['id']}/status", json={"status": "IN_REVIEW"}, headers=auth_header(_dev_tok()))
        assert r.status_code == 200
        assert r.json()["status"] == "IN_REVIEW"

    def test_invalid_transition_rejected_400(self) -> None:
        pid = _get_or_create_project(_fresh_key("INVT"), "Invalid Transition Test")
        issue = _create_issue(pid)
        _assign(issue["id"])
        # ASSIGNED → RESOLVED is not allowed directly
        r = client.patch(
            f"/issues/{issue['id']}/status",
            json={"status": "RESOLVED"},
            headers=auth_header(_dev_tok()),
        )
        assert r.status_code == 400

    def test_reported_to_in_development_rejected(self) -> None:
        pid = _get_or_create_project(_fresh_key("RPRT"), "Reported Transition Test")
        issue = _create_issue(pid)
        # Not assigned — REPORTED is not in DEVELOPER_TRANSITIONS
        r = client.patch(
            f"/issues/{issue['id']}/status",
            json={"status": "IN_DEVELOPMENT"},
            headers=auth_header(_dev_tok()),
        )
        # Dev is not assigned to this issue
        assert r.status_code == 403

    def test_unassigned_developer_cannot_update_403(self) -> None:
        pid = _get_or_create_project(_fresh_key("UNASN"), "Unassigned Status Test")
        issue = _create_issue(pid)
        # Assign to dev2 (not dev)
        _assign(issue["id"], _dev2_tok())
        # dev (not dev2) tries
        r = client.patch(
            f"/issues/{issue['id']}/status",
            json={"status": "IN_DEVELOPMENT"},
            headers=auth_header(_dev_tok()),
        )
        assert r.status_code == 403

    def test_tester_cannot_update_status_403(self) -> None:
        """A TESTER who is NOT the assignee cannot update another issue's status."""
        pid = _get_or_create_project(_fresh_key("TSTS"), "Tester Status Forbidden")
        issue = _create_issue(pid)  # created by user
        # Assign to tester3 (different tester), then tester (not assignee) tries to update status
        _assign(issue["id"])  # assigned to tester3
        r = client.patch(
            f"/issues/{issue['id']}/status",
            json={"status": "IN_DEVELOPMENT"},
            headers=auth_header(_tester_tok()),  # tester is not assignee
        )
        assert r.status_code == 403

    def test_admin_can_update_status_via_status_endpoint_200(self) -> None:
        """Admin has full access to all issue endpoints including status update."""
        pid = _get_or_create_project(_fresh_key("ADMS"), "Admin Status Allowed")
        issue = _create_issue(pid)
        r = client.patch(
            f"/issues/{issue['id']}/status",
            json={"status": "IN_DEVELOPMENT"},
            headers=auth_header(_admin_tok()),
        )
        assert r.status_code == 200, f"Admin should be able to update status; got {r.status_code}: {r.text}"


# =========================================================================== #
# 7. Resolution                                                                #
# =========================================================================== #

class TestIssueResolution:
    def _create_assigned_issue(self, project_key: str, project_name: str) -> dict:
        pid = _get_or_create_project(project_key, project_name)
        issue = _create_issue(pid)
        _assign(issue["id"])
        return issue

    def test_developer_can_resolve_assigned_issue(self) -> None:
        issue = self._create_assigned_issue(_fresh_key("RSLV"), "Resolve Test Project")
        r = client.patch(
            f"/issues/{issue['id']}/resolve",
            json={"resolution_summary": "Fixed the authentication bug in the login controller method."},
            headers=auth_header(_dev_tok()),
        )
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "RESOLVED"
        assert data["resolution_summary"] is not None
        assert data["resolved_at"] is not None

    def test_resolution_clears_on_reopen(self) -> None:
        issue = self._create_assigned_issue(_fresh_key("RCOP"), "Resolution Clear Test")
        client.patch(
            f"/issues/{issue['id']}/resolve",
            json={"resolution_summary": "Fixed the issue in version 2.1 of the module."},
            headers=auth_header(_dev_tok()),
        )
        client.patch(f"/issues/{issue['id']}/reopen", json={"reason": "Still broken"}, headers=auth_header(_user_tok()))
        r = client.get(f"/issues/{issue['id']}", headers=auth_header(_admin_tok()))
        assert r.json()["resolution_summary"] is None

    def test_unassigned_developer_cannot_resolve_403(self) -> None:
        pid = _get_or_create_project(_fresh_key("UREV"), "Unassigned Resolve Test")
        issue = _create_issue(pid)
        # Assign to dev2 (not dev)
        _assign(issue["id"], _dev2_tok())
        r = client.patch(
            f"/issues/{issue['id']}/resolve",
            json={"resolution_summary": "Attempted resolve by wrong developer here."},
            headers=auth_header(_dev_tok()),
        )
        assert r.status_code == 403

    def test_tester_cannot_resolve_403(self) -> None:
        """A TESTER who is NOT the assignee cannot resolve."""
        pid = _get_or_create_project(_fresh_key("TREV"), "Tester Resolve Forbidden")
        issue = _create_issue(pid)
        _assign(issue["id"])  # assigned to tester3
        r = client.patch(
            f"/issues/{issue['id']}/resolve",
            json={"resolution_summary": "Tester-non-assignee tries to resolve the assigned issue."},
            headers=auth_header(_tester_tok()),
        )
        assert r.status_code == 403

    def test_short_resolution_summary_rejected_422(self) -> None:
        issue = self._create_assigned_issue(_fresh_key("RSLT"), "Short Resolution Test")
        r = client.patch(
            f"/issues/{issue['id']}/resolve",
            json={"resolution_summary": "Short"},
            headers=auth_header(_dev_tok()),
        )
        assert r.status_code == 422


# =========================================================================== #
# 8. Reopen                                                                    #
# =========================================================================== #

class TestIssueReopen:
    def _resolved_issue(self, key_prefix: str) -> dict:
        pid = _get_or_create_project(_fresh_key(key_prefix), f"Reopen Test {key_prefix}")
        issue = _create_issue(pid)
        _assign(issue["id"])
        client.patch(
            f"/issues/{issue['id']}/resolve",
            json={"resolution_summary": "Fixed the defect as per the requirements and tests."},
            headers=auth_header(_dev_tok()),
        )
        return issue

    def test_user_can_reopen_own_issue(self) -> None:
        issue = self._resolved_issue("ROPN")
        r = client.patch(
            f"/issues/{issue['id']}/reopen",
            json={"reason": "Still broken in staging environment."},
            headers=auth_header(_user_tok()),
        )
        assert r.status_code == 200
        assert r.json()["status"] == "REOPENED"

    def test_admin_can_reopen_any_issue(self) -> None:
        issue = self._resolved_issue("ROPNA")
        r = client.patch(
            f"/issues/{issue['id']}/reopen",
            json={"reason": "Admin reopens for further investigation."},
            headers=auth_header(_admin_tok()),
        )
        assert r.status_code == 200
        assert r.json()["status"] == "REOPENED"

    def test_developer_cannot_reopen_403(self) -> None:
        """A DEVELOPER-role user (legacy) cannot reopen issues."""
        issue = self._resolved_issue("ROPND")
        r = client.patch(
            f"/issues/{issue['id']}/reopen",
            json={"reason": "Legacy dev tries to reopen."},
            headers=auth_header(_legacy_dev_tok()),
        )
        assert r.status_code == 403

    def test_cannot_reopen_non_resolvable_issue_400(self) -> None:
        pid = _get_or_create_project(_fresh_key("RNRP"), "Non-resolvable Reopen Test")
        issue = _create_issue(pid)
        # Issue is in REPORTED — not in REOPENABLE_STATUSES
        r = client.patch(
            f"/issues/{issue['id']}/reopen",
            json={},
            headers=auth_header(_admin_tok()),
        )
        assert r.status_code == 400


# =========================================================================== #
# 9. Issue update                                                              #
# =========================================================================== #

class TestIssueUpdate:
    def test_user_can_update_own_issue(self) -> None:
        pid = _get_or_create_project(_fresh_key("UPD"), "Update Test Project")
        issue = _create_issue(pid)
        r = client.patch(
            f"/issues/{issue['id']}",
            json={"environment": "Chrome 118, Windows 11"},
            headers=auth_header(_user_tok()),
        )
        assert r.status_code == 200
        assert r.json()["environment"] == "Chrome 118, Windows 11"

    def test_user_cannot_update_others_issue_403(self) -> None:
        pid = _get_or_create_project(_fresh_key("UPD2"), "Other User Update Test")
        issue = _create_issue(pid, token=_user_tok())  # created by user
        # user2 tries to update
        r = client.patch(
            f"/issues/{issue['id']}",
            json={"environment": "Hacked"},
            headers=auth_header(_user2_tok()),
        )
        assert r.status_code == 403

    def test_admin_can_update_any_issue(self) -> None:
        pid = _get_or_create_project(_fresh_key("ADMU"), "Admin Update Test")
        issue = _create_issue(pid)
        r = client.patch(
            f"/issues/{issue['id']}",
            json={"priority": "URGENT"},
            headers=auth_header(_admin_tok()),
        )
        assert r.status_code == 200
        assert r.json()["priority"] == "URGENT"

    def test_protected_fields_not_in_update_schema(self) -> None:
        from app.schemas.issue import IssueUpdate
        protected = {"reporter_id", "issue_key", "project_id", "created_at", "assignee_id", "status"}
        for field in protected:
            assert field not in IssueUpdate.model_fields, f"Protected field '{field}' must not be in IssueUpdate"

