"""
tests/test_analytics.py — Phase 9 Analytics, Reporting & Dashboard test suite.

Tests:
  1. System Overview (/analytics/overview) — RBAC, schema, real PostgreSQL counts
  2. Status Distribution (/analytics/issues/status-distribution) — counts, filters, RBAC isolation
  3. Severity Distribution (/analytics/issues/severity-distribution) — counts, filters, RBAC isolation
  4. Issue Trends (/analytics/issues/trends) — day/week/month intervals, date ranges, error validation
  5. Project Analytics (/analytics/projects and /analytics/projects/{id}) — RBAC, 404, zero-issue handling, resolution rate
  6. Developer Performance (/analytics/developers) — RBAC, assignment/resolved counts, avg resolution time, zero-issue safety
  7. CSV Export (/analytics/reports/issues/export) — MIME type, Content-Disposition, CSV headers, escaping, RBAC scoping
  8. Admin Dashboard Integration (/admin/dashboard) — new notifications and content metrics
"""

import csv
import io
import secrets
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.issue import IssueStatus, Priority, Severity
from app.models.user import UserRole
from tests.conftest import (
    _CLIENT,
    _ensure_verified_user,
    _run_sync,
    admin_token,
    auth_header,
    dev_token,
    dev2_token,
    tester2_token,
    tester3_token,
    tester_token,
    user2_token,
    user_token,
)


def _random_key(prefix: str = "AN") -> str:
    return f"{prefix}{secrets.token_hex(3).upper()}"


def _create_test_project(key: str | None = None, name: str | None = None) -> dict:
    k = key or _random_key("PRJ")
    n = name or f"Project {k}"
    r = _CLIENT.post(
        "/projects",
        json={"project_key": k, "name": n, "description": "Analytics test project"},
        headers=auth_header(admin_token()),
    )
    assert r.status_code == 201, f"Failed to create project: {r.text}"
    return r.json()


def _create_test_issue(
    project_id: int,
    title: str = "Test Issue for Analytics",
    severity: Severity = Severity.MAJOR,
    priority: Priority = Priority.MEDIUM,
    token: str | None = None,
) -> dict:
    tok = token or user_token()
    r = _CLIENT.post(
        "/issues",
        json={
            "project_id": project_id,
            "title": title,
            "description": "A detailed description of the test issue for analytics.",
            "severity": severity.value,
            "priority": priority.value,
        },
        headers=auth_header(tok),
    )
    assert r.status_code == 201, f"Failed to create issue: {r.text}"
    return r.json()


def _assign_issue(issue_id: int, developer_id: int) -> dict:
    r = _CLIENT.patch(
        f"/issues/{issue_id}/assign",
        json={"developer_id": developer_id},
        headers=auth_header(admin_token()),
    )
    assert r.status_code == 200, f"Failed to assign issue: {r.text}"
    return r.json()


def _get_user_id(token: str) -> int:
    r = _CLIENT.get("/auth/me", headers=auth_header(token))
    assert r.status_code == 200
    return r.json()["id"]


# =========================================================================== #
# 1. System Overview Tests                                                     #
# =========================================================================== #

class TestSystemOverview:
    def test_unauthenticated_returns_401(self):
        r = _CLIENT.get("/analytics/overview")
        assert r.status_code == 401

    def test_developer_returns_403(self):
        r = _CLIENT.get("/analytics/overview", headers=auth_header(dev_token()))
        assert r.status_code == 403

    def test_tester_returns_403(self):
        r = _CLIENT.get("/analytics/overview", headers=auth_header(tester_token()))
        assert r.status_code == 403

    def test_admin_returns_200_with_expected_fields(self):
        r = _CLIENT.get("/analytics/overview", headers=auth_header(admin_token()))
        assert r.status_code == 200
        data = r.json()

        expected_fields = [
            "total_users",
            "active_users",
            "inactive_users",
            "total_projects",
            "active_projects",
            "total_issues",
            "open_issues",
            "in_progress_issues",
            "resolved_issues",
            "closed_issues",
            "critical_issues",
            "high_issues",
            "medium_issues",
            "low_issues",
        ]
        for field in expected_fields:
            assert field in data, f"Missing {field} in system overview"
            assert isinstance(data[field], int), f"Field {field} must be int"
            assert data[field] >= 0, f"Field {field} must be non-negative"

    def test_system_overview_live_counts(self):
        # Create a new project and issue, then verify count increment
        before = _CLIENT.get("/analytics/overview", headers=auth_header(admin_token())).json()

        proj = _create_test_project()
        _create_test_issue(proj["id"], severity=Severity.CRITICAL)

        after = _CLIENT.get("/analytics/overview", headers=auth_header(admin_token())).json()

        assert after["total_projects"] >= before["total_projects"] + 1
        assert after["total_issues"] >= before["total_issues"] + 1
        assert after["critical_issues"] >= before["critical_issues"] + 1


# =========================================================================== #
# 2. Status Distribution Tests                                                 #
# =========================================================================== #

class TestStatusDistribution:
    def test_unauthenticated_returns_401(self):
        r = _CLIENT.get("/analytics/issues/status-distribution")
        assert r.status_code == 401

    def test_authenticated_returns_all_status_keys(self):
        r = _CLIENT.get("/analytics/issues/status-distribution", headers=auth_header(admin_token()))
        assert r.status_code == 200
        data = r.json()

        for status_val in [s.value for s in IssueStatus]:
            assert status_val in data, f"Missing status enum key {status_val}"
            assert isinstance(data[status_val], int)
            assert data[status_val] >= 0

    def test_project_filter(self):
        proj = _create_test_project()
        _create_test_issue(proj["id"])

        r = _CLIENT.get(
            f"/analytics/issues/status-distribution?project_id={proj['id']}",
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 200
        data = r.json()
        assert data["REPORTED"] >= 1

    def test_rbac_isolation_tester(self):
        proj = _create_test_project()
        # User creates issue
        iss = _create_test_issue(proj["id"], token=user_token())
        # Issue assigned to Tester 1
        tester_id = _get_user_id(tester_token())
        _assign_issue(iss["id"], tester_id)

        # Tester 1 sees it (they are the assignee)
        r1 = _CLIENT.get(
            f"/analytics/issues/status-distribution?project_id={proj['id']}",
            headers=auth_header(tester_token()),
        )
        assert r1.status_code == 200
        assert r1.json()["ASSIGNED"] >= 1

        # Tester 2 does NOT see Tester 1's issue (not reporter or assignee)
        r2 = _CLIENT.get(
            f"/analytics/issues/status-distribution?project_id={proj['id']}",
            headers=auth_header(tester2_token()),
        )
        assert r2.status_code == 200
        # tester2 has no reported or assigned issues in this project
        assert r2.json()["REPORTED"] == 0
        assert r2.json()["ASSIGNED"] == 0

    def test_date_validation_error(self):
        r = _CLIENT.get(
            "/analytics/issues/status-distribution",
            params={
                "start_date": "2026-08-30T00:00:00Z",
                "end_date": "2026-08-20T00:00:00Z",
            },
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 400
        assert "start_date cannot be greater than end_date" in r.json()["detail"]


# =========================================================================== #
# 3. Severity Distribution Tests                                               #
# =========================================================================== #

class TestSeverityDistribution:
    def test_unauthenticated_returns_401(self):
        r = _CLIENT.get("/analytics/issues/severity-distribution")
        assert r.status_code == 401

    def test_returns_all_severity_keys(self):
        r = _CLIENT.get("/analytics/issues/severity-distribution", headers=auth_header(admin_token()))
        assert r.status_code == 200
        data = r.json()

        for sev_val in [s.value for s in Severity]:
            assert sev_val in data, f"Missing severity key {sev_val}"
            assert isinstance(data[sev_val], int)
            assert data[sev_val] >= 0

    def test_project_filter_and_counts(self):
        proj = _create_test_project()
        _create_test_issue(proj["id"], severity=Severity.BLOCKER)
        _create_test_issue(proj["id"], severity=Severity.MINOR)

        r = _CLIENT.get(
            f"/analytics/issues/severity-distribution?project_id={proj['id']}",
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 200
        data = r.json()
        assert data["BLOCKER"] >= 1
        assert data["MINOR"] >= 1


# =========================================================================== #
# 4. Issue Trends Tests                                                        #
# =========================================================================== #

class TestIssueTrends:
    def test_unauthenticated_returns_401(self):
        r = _CLIENT.get("/analytics/issues/trends")
        assert r.status_code == 401

    def test_valid_intervals(self):
        for interval in ["day", "week", "month"]:
            r = _CLIENT.get(
                f"/analytics/issues/trends?interval={interval}",
                headers=auth_header(admin_token()),
            )
            assert r.status_code == 200
            data = r.json()
            assert data["interval"] == interval
            assert isinstance(data["items"], list)
            assert isinstance(data["total_created"], int)
            assert isinstance(data["total_resolved"], int)

    def test_invalid_interval_returns_400(self):
        r = _CLIENT.get(
            "/analytics/issues/trends?interval=yearly",
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 400

    def test_invalid_date_range_returns_400(self):
        r = _CLIENT.get(
            "/analytics/issues/trends",
            params={
                "start_date": "2026-08-30T00:00:00Z",
                "end_date": "2026-08-20T00:00:00Z",
            },
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 400
        assert "start_date cannot be greater than end_date" in r.json()["detail"]

    def test_trend_items_structure(self):
        proj = _create_test_project()
        _create_test_issue(proj["id"])

        r = _CLIENT.get(
            f"/analytics/issues/trends?interval=day&project_id={proj['id']}",
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 200
        data = r.json()
        assert len(data["items"]) >= 1
        item = data["items"][0]
        assert "date" in item
        assert "created_count" in item
        assert "resolved_count" in item
        assert item["created_count"] >= 1


# =========================================================================== #
# 5. Project Analytics Tests                                                   #
# =========================================================================== #

class TestProjectAnalytics:
    def test_all_projects_analytics_returns_200(self):
        r = _CLIENT.get("/analytics/projects", headers=auth_header(admin_token()))
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert "total" in data
        assert isinstance(data["items"], list)

    def test_single_project_analytics_200(self):
        proj = _create_test_project()
        _create_test_issue(proj["id"], severity=Severity.CRITICAL)

        r = _CLIENT.get(
            f"/analytics/projects/{proj['id']}",
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 200
        data = r.json()
        assert data["project_id"] == proj["id"]
        assert data["project_key"] == proj["project_key"]
        assert data["total_issues"] == 1
        assert data["open_issues"] == 1
        assert data["critical_issues"] == 1
        assert data["resolution_rate"] == 0.0

    def test_zero_issues_project_handles_resolution_rate(self):
        proj = _create_test_project()

        r = _CLIENT.get(
            f"/analytics/projects/{proj['id']}",
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 200
        data = r.json()
        assert data["total_issues"] == 0
        assert data["resolution_rate"] == 0.0

    def test_nonexistent_project_returns_404(self):
        r = _CLIENT.get(
            "/analytics/projects/99999999",
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 404


# =========================================================================== #
# 6. Developer Analytics Tests                                                 #
# =========================================================================== #

class TestDeveloperAnalytics:
    def test_unauthenticated_returns_401(self):
        r = _CLIENT.get("/analytics/developers")
        assert r.status_code == 401

    def test_developer_returns_403(self):
        r = _CLIENT.get("/analytics/developers", headers=auth_header(dev_token()))
        assert r.status_code == 403

    def test_tester_returns_403(self):
        r = _CLIENT.get("/analytics/developers", headers=auth_header(tester_token()))
        assert r.status_code == 403

    def test_admin_returns_200(self):
        r = _CLIENT.get("/analytics/developers", headers=auth_header(admin_token()))
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert "total" in data
        assert isinstance(data["items"], list)

        if len(data["items"]) > 0:
            dev_item = data["items"][0]
            assert "developer_id" in dev_item
            assert "developer_name" in dev_item
            assert "developer_email" in dev_item
            assert "assigned_issues" in dev_item
            assert "resolved_issues" in dev_item
            assert "open_issues" in dev_item
            assert "resolution_rate" in dev_item
            assert "average_resolution_time_hours" in dev_item

    def test_developer_assignment_and_resolution_tracking(self):
        """Test that tester3 (TESTER role, new worker) is tracked in /analytics/developers."""
        proj = _create_test_project()
        iss = _create_test_issue(proj["id"])
        tester3_id = _get_user_id(tester3_token())

        # Assign issue to tester3 (TESTER role — new assignee role)
        _assign_issue(iss["id"], tester3_id)

        r = _CLIENT.get("/analytics/developers", headers=auth_header(admin_token()))
        assert r.status_code == 200
        items = r.json()["items"]
        tester3_match = next((d for d in items if d["developer_id"] == tester3_id), None)
        assert tester3_match is not None
        assert tester3_match["assigned_issues"] >= 1
        assert tester3_match["open_issues"] >= 1

        # Tester3 resolves the issue
        # Transition: ASSIGNED -> IN_DEVELOPMENT -> IN_REVIEW -> RESOLVED
        _CLIENT.patch(
            f"/issues/{iss['id']}/status",
            json={"status": IssueStatus.IN_DEVELOPMENT.value},
            headers=auth_header(tester3_token()),
        )
        _CLIENT.patch(
            f"/issues/{iss['id']}/status",
            json={"status": IssueStatus.IN_REVIEW.value},
            headers=auth_header(tester3_token()),
        )
        _CLIENT.patch(
            f"/issues/{iss['id']}/resolve",
            json={"resolution_summary": "Fixed the bug in code repository."},
            headers=auth_header(tester3_token()),
        )

        r_after = _CLIENT.get("/analytics/developers", headers=auth_header(admin_token()))
        items_after = r_after.json()["items"]
        tester3_after = next((d for d in items_after if d["developer_id"] == tester3_id), None)
        assert tester3_after is not None
        assert tester3_after["resolved_issues"] >= 1
        assert tester3_after["resolution_rate"] > 0.0
        assert tester3_after["average_resolution_time_hours"] is not None


# =========================================================================== #
# 7. CSV Export Tests                                                          #
# =========================================================================== #

class TestCSVExport:
    def test_unauthenticated_returns_401(self):
        r = _CLIENT.get("/analytics/reports/issues/export")
        assert r.status_code == 401

    def test_export_csv_headers_and_content(self):
        proj = _create_test_project()
        title = f'CSV "Special, Escaped" Title {secrets.token_hex(3)}'
        _create_test_issue(proj["id"], title=title)

        r = _CLIENT.get(
            f"/analytics/reports/issues/export?project_id={proj['id']}",
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 200
        assert "text/csv" in r.headers["content-type"]
        assert 'attachment; filename="issues_export.csv"' in r.headers.get("content-disposition", "")

        # Parse CSV
        reader = csv.reader(io.StringIO(r.text))
        rows = list(reader)
        assert len(rows) >= 2  # Header + at least 1 issue

        headers = rows[0]
        expected_headers = [
            "id",
            "issue_key",
            "title",
            "status",
            "severity",
            "priority",
            "project",
            "reporter",
            "assignee",
            "created_at",
            "resolved_at",
        ]
        assert headers == expected_headers

        # Verify title was escaped properly in data row
        found_title = False
        for row in rows[1:]:
            if row[2] == title:
                found_title = True
                assert row[6] == proj["name"]
        assert found_title, f"Could not find title {title!r} in CSV export rows"

    def test_export_rbac_isolation(self):
        proj = _create_test_project()
        iss = _create_test_issue(proj["id"], token=user_token())
        # Assign to tester 1
        tester_id = _get_user_id(tester_token())
        _assign_issue(iss["id"], tester_id)

        # Tester 2 exports from this project -> should receive header only (0 rows)
        r = _CLIENT.get(
            f"/analytics/reports/issues/export?project_id={proj['id']}",
            headers=auth_header(tester2_token()),
        )
        assert r.status_code == 200
        reader = csv.reader(io.StringIO(r.text))
        rows = list(reader)
        assert len(rows) == 1  # only header row


# =========================================================================== #
# 8. Admin Dashboard Integration Tests                                         #
# =========================================================================== #

class TestAdminDashboardIntegration:
    def test_dashboard_includes_notifications_and_content_stats(self):
        r = _CLIENT.get("/admin/dashboard", headers=auth_header(admin_token()))
        assert r.status_code == 200
        data = r.json()

        assert "notifications" in data, "Missing 'notifications' section in admin dashboard"
        notif = data["notifications"]
        assert "total" in notif
        assert "unread" in notif
        assert isinstance(notif["total"], int)
        assert isinstance(notif["unread"], int)

        assert "content" in data, "Missing 'content' section in admin dashboard"
        content = data["content"]
        assert "total_comments" in content
        assert "total_attachments" in content
        assert "total_notifications" in content
        assert "unread_notifications" in content
        assert isinstance(content["total_comments"], int)
        assert isinstance(content["total_attachments"], int)
        assert isinstance(content["total_notifications"], int)
        assert isinstance(content["unread_notifications"], int)
