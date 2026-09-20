"""
tests/test_admin_dashboard.py — Phase 6 admin dashboard tests.

Tests:
  - GET /admin/dashboard  RBAC (admin/dev/tester/unauth)
  - Response schema validation
  - Correct user counts (by role, active, verified)
  - Correct project counts
  - Correct issue status/severity/priority counts
  - Recent activity counts
  - No sensitive data in response

Uses the existing CI users and creates controlled data to verify counts.
"""

import secrets

import pytest
from fastapi.testclient import TestClient

from tests.conftest import (
    _run_sync,
    _ensure_verified_user,
    admin_token,
    dev_token,
    tester_token,
    user_token,
    auth_header,
)
from app.main import app
from app.models.user import UserRole


_CLIENT = TestClient(app)
_SUFFIX = "p6dash"
_PASSWORD = "SecurePass123"


def _random_key() -> str:
    return "DASH" + secrets.token_hex(3).upper()


# --------------------------------------------------------------------------- #
# 1. RBAC                                                                      #
# --------------------------------------------------------------------------- #

class TestDashboardRBAC:
    def test_unauth_returns_401(self):
        r = _CLIENT.get("/admin/dashboard")
        assert r.status_code == 401

    def test_developer_returns_403(self):
        r = _CLIENT.get("/admin/dashboard", headers=auth_header(dev_token()))
        assert r.status_code == 403

    def test_tester_returns_403(self):
        r = _CLIENT.get("/admin/dashboard", headers=auth_header(tester_token()))
        assert r.status_code == 403

    def test_admin_returns_200(self):
        r = _CLIENT.get("/admin/dashboard", headers=auth_header(admin_token()))
        assert r.status_code == 200


# --------------------------------------------------------------------------- #
# 2. Response schema                                                            #
# --------------------------------------------------------------------------- #

class TestDashboardSchema:
    def _dashboard(self) -> dict:
        r = _CLIENT.get("/admin/dashboard", headers=auth_header(admin_token()))
        assert r.status_code == 200
        return r.json()

    def test_has_users_section(self):
        d = self._dashboard()
        assert "users" in d
        users = d["users"]
        for field in ["total", "active", "inactive", "admins", "developers", "testers",
                      "verified", "unverified"]:
            assert field in users, f"Missing users.{field}"

    def test_has_projects_section(self):
        d = self._dashboard()
        assert "projects" in d
        projects = d["projects"]
        for field in ["total", "active", "inactive"]:
            assert field in projects, f"Missing projects.{field}"

    def test_has_issues_section(self):
        d = self._dashboard()
        assert "issues" in d
        issues = d["issues"]
        for field in ["total", "reported", "triaged", "assigned", "in_development",
                      "in_review", "in_testing", "resolved", "closed", "reopened", "unresolved"]:
            assert field in issues, f"Missing issues.{field}"

    def test_has_severity_section(self):
        d = self._dashboard()
        assert "severity" in d
        for field in ["minor", "major", "critical", "blocker"]:
            assert field in d["severity"], f"Missing severity.{field}"

    def test_has_priority_section(self):
        d = self._dashboard()
        assert "priority" in d
        for field in ["low", "medium", "high", "urgent"]:
            assert field in d["priority"], f"Missing priority.{field}"

    def test_has_recent_section(self):
        d = self._dashboard()
        assert "recent" in d
        for field in ["recently_created", "recently_resolved"]:
            assert field in d["recent"], f"Missing recent.{field}"

    def test_all_values_are_non_negative_integers(self):
        d = self._dashboard()
        def check_ints(obj):
            if isinstance(obj, dict):
                for v in obj.values():
                    check_ints(v)
            elif isinstance(obj, list):
                for v in obj:
                    check_ints(v)
            else:
                assert isinstance(obj, int) and obj >= 0, f"Expected non-negative int, got {obj!r}"
        check_ints(d)


# --------------------------------------------------------------------------- #
# 3. User count correctness                                                    #
# --------------------------------------------------------------------------- #

class TestDashboardUserCounts:
    def _dashboard(self) -> dict:
        r = _CLIENT.get("/admin/dashboard", headers=auth_header(admin_token()))
        assert r.status_code == 200
        return r.json()

    def test_total_users_at_least_ci_users(self):
        """At minimum the 5 CI users must exist."""
        d = self._dashboard()
        assert d["users"]["total"] >= 5

    def test_active_inactive_sum_equals_total(self):
        d = self._dashboard()
        u = d["users"]
        assert u["active"] + u["inactive"] == u["total"]

    def test_role_counts_sum_equals_total(self):
        d = self._dashboard()
        u = d["users"]
        # admins + developers + testers + users (USER role) should equal total
        assert u["admins"] + u["developers"] + u["testers"] + u["users"] == u["total"]

    def test_verified_unverified_sum_equals_total(self):
        d = self._dashboard()
        u = d["users"]
        assert u["verified"] + u["unverified"] == u["total"]

    def test_at_least_one_admin(self):
        d = self._dashboard()
        assert d["users"]["admins"] >= 1

    def test_creating_new_user_increments_total(self):
        before = self._dashboard()["users"]["total"]
        email = f"counter_{secrets.token_hex(6)}.p6dash@example.com"
        _run_sync(_ensure_verified_user(email=email, full_name="Counter User", role=UserRole.DEVELOPER))
        after = self._dashboard()["users"]["total"]
        assert after >= before + 1


# --------------------------------------------------------------------------- #
# 4. Project count correctness                                                 #
# --------------------------------------------------------------------------- #

class TestDashboardProjectCounts:
    def _dashboard(self) -> dict:
        r = _CLIENT.get("/admin/dashboard", headers=auth_header(admin_token()))
        assert r.status_code == 200
        return r.json()

    def test_active_inactive_sum_equals_total(self):
        d = self._dashboard()
        p = d["projects"]
        assert p["active"] + p["inactive"] == p["total"]

    def test_creating_project_increments_active_count(self):
        before = self._dashboard()["projects"]["active"]
        r = _CLIENT.post(
            "/projects",
            json={"project_key": _random_key(), "name": f"Dash Project {secrets.token_hex(4)}"},
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 201, f"Project creation failed: {r.status_code} {r.text}"
        after = self._dashboard()["projects"]["active"]
        assert after >= before + 1


# --------------------------------------------------------------------------- #
# 5. Issue count correctness                                                   #
# --------------------------------------------------------------------------- #

class TestDashboardIssueCounts:
    def _dashboard(self) -> dict:
        r = _CLIENT.get("/admin/dashboard", headers=auth_header(admin_token()))
        assert r.status_code == 200
        return r.json()

    def _create_project(self) -> int:
        """Create a project and return its integer ID."""
        key = _random_key()
        r = _CLIENT.post(
            "/projects",
            json={"project_key": key, "name": f"Issue Dash {key}"},
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 201, f"Project creation failed: {r.status_code} {r.text}"
        return r.json()["id"]

    def _create_issue(self, project_id: int) -> dict:
        r = _CLIENT.post(
            "/issues",
            json={
                "project_id": project_id,
                "title": f"Dashboard test issue {secrets.token_hex(4)}",
                "description": "Testing dashboard issue counts for Phase 6.",
            },
            headers=auth_header(user_token()),
        )
        assert r.status_code == 201, f"Issue creation failed: {r.status_code} {r.text}"
        return r.json()

    def test_status_counts_sum_equals_total(self):
        d = self._dashboard()
        iss = d["issues"]
        status_sum = (
            iss["reported"] + iss["triaged"] + iss["assigned"] +
            iss["in_development"] + iss["in_review"] + iss["in_testing"] +
            iss["resolved"] + iss["closed"] + iss["reopened"]
        )
        assert status_sum == iss["total"]

    def test_unresolved_equals_total_minus_resolved_closed(self):
        d = self._dashboard()
        iss = d["issues"]
        expected = iss["total"] - iss["resolved"] - iss["closed"]
        assert iss["unresolved"] == max(0, expected)

    def test_severity_counts_sum_equals_total(self):
        d = self._dashboard()
        sev = d["severity"]
        assert sev["minor"] + sev["major"] + sev["critical"] + sev["blocker"] == d["issues"]["total"]

    def test_priority_counts_sum_equals_total(self):
        d = self._dashboard()
        pri = d["priority"]
        assert pri["low"] + pri["medium"] + pri["high"] + pri["urgent"] == d["issues"]["total"]

    def test_creating_issue_increments_reported_count(self):
        key = self._create_project()
        before = self._dashboard()["issues"]["reported"]
        self._create_issue(key)
        after = self._dashboard()["issues"]["reported"]
        assert after >= before + 1

    def test_creating_issue_increments_total(self):
        key = self._create_project()
        before = self._dashboard()["issues"]["total"]
        self._create_issue(key)
        after = self._dashboard()["issues"]["total"]
        assert after >= before + 1


# --------------------------------------------------------------------------- #
# 6. Security                                                                  #
# --------------------------------------------------------------------------- #

class TestDashboardSecurity:
    SENSITIVE = {"password_hash", "password", "otp", "token", "secret"}

    def _check_no_sensitive(self, obj: object) -> None:
        if isinstance(obj, dict):
            for k, v in obj.items():
                assert k not in self.SENSITIVE, f"Sensitive key in dashboard: {k!r}"
                self._check_no_sensitive(v)
        elif isinstance(obj, list):
            for item in obj:
                self._check_no_sensitive(item)

    def test_no_sensitive_fields_in_dashboard_response(self):
        r = _CLIENT.get("/admin/dashboard", headers=auth_header(admin_token()))
        assert r.status_code == 200
        self._check_no_sensitive(r.json())

    def test_dashboard_values_are_all_numbers(self):
        """Dashboard must contain only aggregate numbers, no user PII."""
        r = _CLIENT.get("/admin/dashboard", headers=auth_header(admin_token()))
        body = r.json()
        for section_name, section in body.items():
            assert isinstance(section, dict), f"Section {section_name} is not a dict"
            for field, value in section.items():
                assert isinstance(value, int), (
                    f"dashboard.{section_name}.{field} = {value!r} — expected int"
                )
