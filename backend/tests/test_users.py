"""
tests/test_users.py — Phase 6 user management tests.

Tests:
  - GET /users      (listing, pagination, search, filter, sort)
  - GET /users/{id} (detail, 404)
  - PATCH /users/{id}            (update name/email, 409 duplicate, RBAC)
  - PATCH /users/{id}/activate   (activate, already-active, RBAC)
  - PATCH /users/{id}/deactivate (deactivate, already-inactive, last-admin, RBAC)
  - PATCH /users/{id}/role       (valid, same role, last-admin, RBAC)
  - Audit events (USER_UPDATED, USER_ACTIVATED, USER_DEACTIVATED, USER_ROLE_CHANGED)
  - Security (no password_hash in any response)

All test users are separate from Phase 4 CI users (p6um suffix).
Random hex suffix avoids key collisions across test runs.
"""

import secrets

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import (
    _run_sync,
    _ensure_verified_user,
    _ci_email,
    admin_token,
    dev_token,
    tester_token,
    auth_header,
)
from app.main import app
from app.models.user import User, UserRole


# --------------------------------------------------------------------------- #
# Module-level setup helpers                                                   #
# --------------------------------------------------------------------------- #

_CLIENT = TestClient(app)
_SUFFIX = "p6um"
_PASSWORD = "SecurePass123"


def _u(tag: str) -> str:
    """Build a predictable test email for this module."""
    return f"{tag}.{_SUFFIX}@example.com"


def _setup_p6_users() -> None:
    """Ensure a fixed set of Phase 6 test users exist."""
    users = [
        (_u("dev_a"),    "Dev A P6",    UserRole.DEVELOPER),
        (_u("dev_b"),    "Dev B P6",    UserRole.DEVELOPER),
        (_u("tester_a"), "Tester A P6", UserRole.TESTER),
    ]
    for email, name, role in users:
        _run_sync(_ensure_verified_user(email=email, full_name=name, role=role))


_setup_p6_users()


def _get_user_id(email: str) -> int:
    """Fetch user id from the /users list (ADMIN access)."""
    r = _CLIENT.get(
        "/users",
        params={"search": email, "page_size": 5},
        headers=auth_header(admin_token()),
    )
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert items, f"User not found in /users list: {email}"
    return items[0]["id"]


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #

SENSITIVE_FIELDS = {"password_hash", "password", "otp", "otp_hash", "secret"}


def assert_no_sensitive_data(payload: object) -> None:
    """Recursively assert no sensitive field names appear in a response."""
    if isinstance(payload, dict):
        for key, value in payload.items():
            assert key not in SENSITIVE_FIELDS, f"Sensitive field found: {key!r}"
            assert_no_sensitive_data(value)
    elif isinstance(payload, list):
        for item in payload:
            assert_no_sensitive_data(item)


# --------------------------------------------------------------------------- #
# 1. GET /users — unauthenticated + RBAC                                       #
# --------------------------------------------------------------------------- #

class TestUserListRBAC:
    def test_unauth_returns_401(self):
        r = _CLIENT.get("/users")
        assert r.status_code == 401

    def test_developer_returns_403(self):
        r = _CLIENT.get("/users", headers=auth_header(dev_token()))
        assert r.status_code == 403

    def test_tester_returns_403(self):
        r = _CLIENT.get("/users", headers=auth_header(tester_token()))
        assert r.status_code == 403

    def test_admin_can_list_users(self):
        r = _CLIENT.get("/users", headers=auth_header(admin_token()))
        assert r.status_code == 200
        body = r.json()
        assert "items" in body
        assert "total" in body
        assert "page" in body
        assert "page_size" in body
        assert "total_pages" in body
        assert isinstance(body["items"], list)

    def test_no_sensitive_fields_in_response(self):
        r = _CLIENT.get("/users", headers=auth_header(admin_token()))
        assert r.status_code == 200
        assert_no_sensitive_data(r.json())


# --------------------------------------------------------------------------- #
# 2. GET /users — pagination                                                   #
# --------------------------------------------------------------------------- #

class TestUserListPagination:
    def test_default_page_is_1(self):
        r = _CLIENT.get("/users", headers=auth_header(admin_token()))
        assert r.json()["page"] == 1

    def test_custom_page_size(self):
        r = _CLIENT.get("/users", params={"page_size": 2}, headers=auth_header(admin_token()))
        assert r.status_code == 200
        assert len(r.json()["items"]) <= 2

    def test_page_size_too_large_returns_422(self):
        r = _CLIENT.get("/users", params={"page_size": 200}, headers=auth_header(admin_token()))
        assert r.status_code == 422

    def test_zero_page_returns_422(self):
        r = _CLIENT.get("/users", params={"page": 0}, headers=auth_header(admin_token()))
        assert r.status_code == 422


# --------------------------------------------------------------------------- #
# 3. GET /users — search and filter                                            #
# --------------------------------------------------------------------------- #

class TestUserListSearch:
    def test_search_by_email(self):
        r = _CLIENT.get(
            "/users",
            params={"search": "dev_a.p6um"},
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 200
        items = r.json()["items"]
        assert any(_u("dev_a") in u["email"] for u in items)

    def test_search_by_name(self):
        # The user's name may have been updated by a previous run of test_admin_can_update_full_name.
        # Fetch the current name first so the search term is always accurate.
        uid = _get_user_id(_u("dev_b"))
        current_name = _CLIENT.get(f"/users/{uid}", headers=auth_header(admin_token())).json()["full_name"]
        # Use a stable prefix that will always appear in the name
        search_term = current_name[:8]  # e.g. "Dev B P6" or "Updated "
        r = _CLIENT.get(
            "/users",
            params={"search": search_term},
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 200
        assert any(u["id"] == uid for u in r.json()["items"])

    def test_filter_by_role_developer(self):
        r = _CLIENT.get(
            "/users",
            params={"role": "DEVELOPER"},
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 200
        for u in r.json()["items"]:
            assert u["role"] == "DEVELOPER"

    def test_filter_by_role_admin(self):
        r = _CLIENT.get(
            "/users",
            params={"role": "ADMIN"},
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 200
        for u in r.json()["items"]:
            assert u["role"] == "ADMIN"

    def test_filter_by_active_true(self):
        r = _CLIENT.get(
            "/users",
            params={"is_active": "true"},
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 200
        for u in r.json()["items"]:
            assert u["is_active"] is True

    def test_filter_no_results_returns_empty(self):
        r = _CLIENT.get(
            "/users",
            params={"search": f"nonexistent_{secrets.token_hex(8)}"},
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 200
        assert r.json()["total"] == 0
        assert r.json()["items"] == []


# --------------------------------------------------------------------------- #
# 4. GET /users/{user_id}                                                      #
# --------------------------------------------------------------------------- #

class TestUserDetail:
    def test_admin_can_get_user(self):
        uid = _get_user_id(_u("dev_a"))
        r = _CLIENT.get(f"/users/{uid}", headers=auth_header(admin_token()))
        assert r.status_code == 200
        body = r.json()
        assert body["id"] == uid
        assert "email" in body
        assert "role" in body
        assert "is_active" in body
        assert "created_at" in body
        assert "updated_at" in body

    def test_no_password_hash_in_detail(self):
        uid = _get_user_id(_u("dev_a"))
        r = _CLIENT.get(f"/users/{uid}", headers=auth_header(admin_token()))
        assert r.status_code == 200
        assert_no_sensitive_data(r.json())

    def test_nonexistent_user_returns_404(self):
        r = _CLIENT.get("/users/999999", headers=auth_header(admin_token()))
        assert r.status_code == 404

    def test_developer_cannot_get_user_403(self):
        uid = _get_user_id(_u("dev_a"))
        r = _CLIENT.get(f"/users/{uid}", headers=auth_header(dev_token()))
        assert r.status_code == 403

    def test_tester_cannot_get_user_403(self):
        uid = _get_user_id(_u("dev_a"))
        r = _CLIENT.get(f"/users/{uid}", headers=auth_header(tester_token()))
        assert r.status_code == 403

    def test_unauth_returns_401(self):
        r = _CLIENT.get("/users/1")
        assert r.status_code == 401


# --------------------------------------------------------------------------- #
# 5. PATCH /users/{user_id} — update                                          #
# --------------------------------------------------------------------------- #

class TestUserUpdate:
    def test_admin_can_update_full_name(self):
        uid = _get_user_id(_u("dev_b"))
        new_name = f"Updated Dev B {secrets.token_hex(4)}"
        r = _CLIENT.patch(
            f"/users/{uid}",
            json={"full_name": new_name},
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 200
        assert r.json()["full_name"] == new_name

    def test_admin_can_update_email(self):
        uid = _get_user_id(_u("tester_a"))
        new_email = f"updated_tester_{secrets.token_hex(4)}.p6um@example.com"
        r = _CLIENT.patch(
            f"/users/{uid}",
            json={"email": new_email},
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 200
        assert r.json()["email"] == new_email
        # Restore
        _CLIENT.patch(
            f"/users/{uid}",
            json={"email": _u("tester_a")},
            headers=auth_header(admin_token()),
        )

    def test_duplicate_email_returns_409(self):
        uid_a = _get_user_id(_u("dev_a"))
        uid_b = _get_user_id(_u("dev_b"))
        email_a = _CLIENT.get(f"/users/{uid_a}", headers=auth_header(admin_token())).json()["email"]
        r = _CLIENT.patch(
            f"/users/{uid_b}",
            json={"email": email_a},
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 409

    def test_no_change_is_allowed(self):
        uid = _get_user_id(_u("dev_a"))
        r = _CLIENT.patch(
            f"/users/{uid}",
            json={},
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 200  # no-op is valid

    def test_update_nonexistent_returns_404(self):
        r = _CLIENT.patch(
            "/users/999999",
            json={"full_name": "Ghost"},
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 404

    def test_developer_cannot_update_403(self):
        uid = _get_user_id(_u("dev_a"))
        r = _CLIENT.patch(
            f"/users/{uid}",
            json={"full_name": "Hacked"},
            headers=auth_header(dev_token()),
        )
        assert r.status_code == 403

    def test_tester_cannot_update_403(self):
        uid = _get_user_id(_u("dev_a"))
        r = _CLIENT.patch(
            f"/users/{uid}",
            json={"full_name": "Hacked"},
            headers=auth_header(tester_token()),
        )
        assert r.status_code == 403

    def test_no_sensitive_data_in_update_response(self):
        uid = _get_user_id(_u("dev_a"))
        r = _CLIENT.patch(
            f"/users/{uid}",
            json={"full_name": "Safe Name"},
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 200
        assert_no_sensitive_data(r.json())


# --------------------------------------------------------------------------- #
# 6. Activate / Deactivate                                                     #
# --------------------------------------------------------------------------- #

class TestActivateDeactivate:
    def _create_temp_user(self) -> tuple[int, str]:
        """Create a fresh inactive DEVELOPER for activate/deactivate tests."""
        email = f"temp_dev_{secrets.token_hex(6)}.p6um@example.com"
        _run_sync(_ensure_verified_user(email=email, full_name="Temp Dev", role=UserRole.DEVELOPER))
        uid = _get_user_id(email)
        return uid, email

    def test_admin_can_deactivate_user(self):
        uid, _ = self._create_temp_user()
        r = _CLIENT.patch(f"/users/{uid}/deactivate", headers=auth_header(admin_token()))
        assert r.status_code == 200
        assert r.json()["is_active"] is False

    def test_admin_can_activate_user(self):
        uid, _ = self._create_temp_user()
        # Deactivate first
        _CLIENT.patch(f"/users/{uid}/deactivate", headers=auth_header(admin_token()))
        # Now activate
        r = _CLIENT.patch(f"/users/{uid}/activate", headers=auth_header(admin_token()))
        assert r.status_code == 200
        assert r.json()["is_active"] is True

    def test_activate_already_active_returns_400(self):
        uid, _ = self._create_temp_user()
        r = _CLIENT.patch(f"/users/{uid}/activate", headers=auth_header(admin_token()))
        assert r.status_code == 400

    def test_deactivate_already_inactive_returns_400(self):
        uid, _ = self._create_temp_user()
        _CLIENT.patch(f"/users/{uid}/deactivate", headers=auth_header(admin_token()))
        r = _CLIENT.patch(f"/users/{uid}/deactivate", headers=auth_header(admin_token()))
        assert r.status_code == 400

    def test_deactivate_nonexistent_returns_404(self):
        r = _CLIENT.patch("/users/999999/deactivate", headers=auth_header(admin_token()))
        assert r.status_code == 404

    def test_developer_cannot_deactivate_403(self):
        uid, _ = self._create_temp_user()
        r = _CLIENT.patch(f"/users/{uid}/deactivate", headers=auth_header(dev_token()))
        assert r.status_code == 403

    def test_tester_cannot_activate_403(self):
        uid, _ = self._create_temp_user()
        r = _CLIENT.patch(f"/users/{uid}/activate", headers=auth_header(tester_token()))
        assert r.status_code == 403

    def test_unauth_cannot_deactivate_401(self):
        uid, _ = self._create_temp_user()
        r = _CLIENT.patch(f"/users/{uid}/deactivate")
        assert r.status_code == 401

    def test_deactivated_user_response_has_no_sensitive_data(self):
        uid, _ = self._create_temp_user()
        r = _CLIENT.patch(f"/users/{uid}/deactivate", headers=auth_header(admin_token()))
        assert r.status_code == 200
        assert_no_sensitive_data(r.json())


# --------------------------------------------------------------------------- #
# DB-level isolation helpers for last-admin tests                              #
# --------------------------------------------------------------------------- #

async def _set_user_active_direct(user_id: int, active: bool) -> None:
    """Directly set is_active for a user in the DB, bypassing the API.

    Used in test setup/teardown so that we can restore state even when
    an API token is invalid (e.g. the CI admin is temporarily deactivated).
    """
    from app.database.connection import engine
    async with AsyncSession(engine) as session:
        await session.execute(
            update(User).where(User.id == user_id).values(is_active=active)
        )
        await session.commit()


def _get_all_active_admin_ids() -> list[int]:
    """Return IDs of all currently active ADMIN users."""
    r = _CLIENT.get(
        "/users",
        params={"role": "ADMIN", "is_active": "true", "page_size": 100},
        headers=auth_header(admin_token()),
    )
    assert r.status_code == 200, r.text
    return [u["id"] for u in r.json()["items"]]


# --------------------------------------------------------------------------- #
# 7. Last-admin protection                                                     #
# --------------------------------------------------------------------------- #

class TestLastAdminProtection:
    """Test that the last active ADMIN cannot be deactivated or demoted.

    Strategy: isolate one admin as the "sole" active admin by temporarily
    deactivating all others via direct DB access. This makes the test
    robust against accumulated DB state across test runs.
    """

    def test_cannot_deactivate_last_admin(self):
        """Protection must return 400 when the target is the only active ADMIN."""
        ci_uid = _get_user_id(_ci_email("admin"))
        all_admin_ids = _get_all_active_admin_ids()
        others = [uid for uid in all_admin_ids if uid != ci_uid]

        # Temporarily deactivate all other active admins via DB (bypasses API)
        for uid in others:
            _run_sync(_set_user_active_direct(uid, False))

        try:
            # CI admin is now the ONLY active admin → protection must trigger
            r = _CLIENT.patch(f"/users/{ci_uid}/deactivate", headers=auth_header(admin_token()))
            assert r.status_code == 400
            detail = r.json()["detail"].lower()
            assert "last" in detail or "admin" in detail
        finally:
            # Always restore other admins directly via DB, regardless of API state
            for uid in others:
                _run_sync(_set_user_active_direct(uid, True))

    def test_cannot_change_last_admin_role(self):
        """Protection must return 400 when trying to demote the only active ADMIN."""
        ci_uid = _get_user_id(_ci_email("admin"))
        all_admin_ids = _get_all_active_admin_ids()
        others = [uid for uid in all_admin_ids if uid != ci_uid]

        for uid in others:
            _run_sync(_set_user_active_direct(uid, False))

        try:
            r = _CLIENT.patch(
                f"/users/{ci_uid}/role",
                json={"role": "DEVELOPER"},
                headers=auth_header(admin_token()),
            )
            assert r.status_code == 400
            detail = r.json()["detail"].lower()
            assert "last" in detail or "admin" in detail
        finally:
            for uid in others:
                _run_sync(_set_user_active_direct(uid, True))

    def test_can_deactivate_non_last_admin(self):
        """When 2+ active admins exist, deactivating one must succeed (200)."""
        second_email = f"second_admin_{secrets.token_hex(6)}.p6um@example.com"
        _run_sync(_ensure_verified_user(
            email=second_email,
            full_name="Second Admin",
            role=UserRole.ADMIN,
        ))
        second_uid = _get_user_id(second_email)
        r = _CLIENT.patch(f"/users/{second_uid}/deactivate", headers=auth_header(admin_token()))
        assert r.status_code == 200
        # Clean up: re-activate so the user doesn't linger as inactive ADMIN
        _run_sync(_set_user_active_direct(second_uid, True))


# --------------------------------------------------------------------------- #
# 8. Role management                                                           #
# --------------------------------------------------------------------------- #

class TestRoleManagement:
    def _create_temp_developer(self) -> tuple[int, str]:
        email = f"temp_role_{secrets.token_hex(6)}.p6um@example.com"
        _run_sync(_ensure_verified_user(email=email, full_name="Temp Role", role=UserRole.DEVELOPER))
        uid = _get_user_id(email)
        return uid, email

    def test_admin_can_promote_developer_to_admin(self):
        uid, _ = self._create_temp_developer()
        r = _CLIENT.patch(
            f"/users/{uid}/role",
            json={"role": "ADMIN"},
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 200
        assert r.json()["role"] == "ADMIN"
        # Demote back
        _CLIENT.patch(f"/users/{uid}/role", json={"role": "DEVELOPER"}, headers=auth_header(admin_token()))

    def test_admin_can_change_developer_to_tester(self):
        uid, _ = self._create_temp_developer()
        r = _CLIENT.patch(
            f"/users/{uid}/role",
            json={"role": "TESTER"},
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 200
        assert r.json()["role"] == "TESTER"

    def test_same_role_returns_400(self):
        uid, _ = self._create_temp_developer()
        r = _CLIENT.patch(
            f"/users/{uid}/role",
            json={"role": "DEVELOPER"},
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 400

    def test_invalid_role_returns_422(self):
        uid, _ = self._create_temp_developer()
        r = _CLIENT.patch(
            f"/users/{uid}/role",
            json={"role": "SUPERUSER"},
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 422

    def test_developer_cannot_change_role_403(self):
        uid, _ = self._create_temp_developer()
        r = _CLIENT.patch(
            f"/users/{uid}/role",
            json={"role": "ADMIN"},
            headers=auth_header(dev_token()),
        )
        assert r.status_code == 403

    def test_tester_cannot_change_role_403(self):
        uid, _ = self._create_temp_developer()
        r = _CLIENT.patch(
            f"/users/{uid}/role",
            json={"role": "ADMIN"},
            headers=auth_header(tester_token()),
        )
        assert r.status_code == 403

    def test_unauth_cannot_change_role_401(self):
        uid, _ = self._create_temp_developer()
        r = _CLIENT.patch(f"/users/{uid}/role", json={"role": "ADMIN"})
        assert r.status_code == 401

    def test_no_sensitive_data_in_role_response(self):
        uid, _ = self._create_temp_developer()
        r = _CLIENT.patch(
            f"/users/{uid}/role",
            json={"role": "TESTER"},
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 200
        assert_no_sensitive_data(r.json())


# --------------------------------------------------------------------------- #
# 9. Audit event verification                                                  #
# --------------------------------------------------------------------------- #

class TestUserAuditEvents:
    """Verify that user-management actions produce audit log entries."""

    def _get_audit_logs(self, entity_type: str = "USER") -> list[dict]:
        r = _CLIENT.get(
            "/activity",
            params={"entity_type": entity_type, "page_size": 100},
            headers=auth_header(admin_token()),
        )
        assert r.status_code == 200
        return r.json()["items"]

    def test_user_updated_audit_created(self):
        uid = _get_user_id(_u("dev_a"))
        new_name = f"Audit Test {secrets.token_hex(4)}"
        _CLIENT.patch(f"/users/{uid}", json={"full_name": new_name}, headers=auth_header(admin_token()))
        logs = self._get_audit_logs()
        actions = [l["action"] for l in logs]
        assert "USER_UPDATED" in actions

    def test_user_activated_audit_created(self):
        email = f"audit_act_{secrets.token_hex(6)}.p6um@example.com"
        _run_sync(_ensure_verified_user(email=email, full_name="Audit Act", role=UserRole.DEVELOPER))
        uid = _get_user_id(email)
        _CLIENT.patch(f"/users/{uid}/deactivate", headers=auth_header(admin_token()))
        _CLIENT.patch(f"/users/{uid}/activate", headers=auth_header(admin_token()))
        logs = self._get_audit_logs()
        actions = [l["action"] for l in logs]
        assert "USER_ACTIVATED" in actions

    def test_user_deactivated_audit_created(self):
        email = f"audit_dea_{secrets.token_hex(6)}.p6um@example.com"
        _run_sync(_ensure_verified_user(email=email, full_name="Audit Dea", role=UserRole.DEVELOPER))
        uid = _get_user_id(email)
        _CLIENT.patch(f"/users/{uid}/deactivate", headers=auth_header(admin_token()))
        logs = self._get_audit_logs()
        actions = [l["action"] for l in logs]
        assert "USER_DEACTIVATED" in actions

    def test_user_role_changed_audit_created(self):
        email = f"audit_role_{secrets.token_hex(6)}.p6um@example.com"
        _run_sync(_ensure_verified_user(email=email, full_name="Audit Role", role=UserRole.DEVELOPER))
        uid = _get_user_id(email)
        _CLIENT.patch(f"/users/{uid}/role", json={"role": "TESTER"}, headers=auth_header(admin_token()))
        logs = self._get_audit_logs()
        actions = [l["action"] for l in logs]
        assert "USER_ROLE_CHANGED" in actions

    def test_no_password_hash_in_audit_new_values(self):
        logs = self._get_audit_logs()
        for log in logs:
            for values_key in ("old_values", "new_values"):
                vals = log.get(values_key) or {}
                assert "password_hash" not in vals, f"password_hash in {values_key}"
                assert "password" not in vals
                assert "otp" not in vals

    def test_no_jwt_in_audit_logs(self):
        logs = self._get_audit_logs("AUTH")
        for log in logs:
            desc = log.get("description", "")
            assert "eyJ" not in desc  # JWT tokens start with eyJ
            for values_key in ("old_values", "new_values"):
                vals = log.get(values_key) or {}
                assert "token" not in vals
                assert "access_token" not in vals
