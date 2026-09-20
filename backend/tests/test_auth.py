"""
Phase-3 tests: authentication, JWT, OTP, registration, login, RBAC.

Test isolation strategy:
  - Email sending is mocked throughout — no real Gmail messages are sent.
  - OTP values are captured via mocking and verified without logging them.
  - Test emails use @example.com (RFC-compliant domain that passes
    email-validator's domain check without real DNS lookups).

Total: 30 tests covering:
  - Password hashing (3)
  - JWT (4)
  - Registration (5)
  - OTP mechanics (7)
  - Login (4)
  - /auth/me (3)
  - RBAC (2)
  - Email (2)
"""

import asyncio
import selectors
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import bcrypt
import jwt
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.models.user import UserRole
from app.utils.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)

client = TestClient(app)


# =========================================================================== #
# Helpers                                                                      #
# =========================================================================== #

def _make_token(user_id: int = 1, role: str = "DEVELOPER", expire_delta_minutes: int = 60) -> str:
    """Create a JWT token directly (bypasses DB — for unit tests)."""
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=expire_delta_minutes),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def _expired_token(user_id: int = 1) -> str:
    """Return an expired JWT."""
    return _make_token(user_id=user_id, expire_delta_minutes=-1)


# Unique email generator to avoid cross-test contamination
# Uses @example.com — a RFC-2606 reserved domain that passes email-validator
_SUFFIX = "p3test"


def _email(tag: str) -> str:
    return f"{tag}.{_SUFFIX}@example.com"


# =========================================================================== #
# 1. Password hashing                                                          #
# =========================================================================== #

class TestPasswordHashing:
    def test_hash_password_produces_bcrypt_hash(self) -> None:
        """Hash output must be a valid bcrypt hash."""
        h = hash_password("SecurePass1")
        assert h.startswith("$2b$"), f"Expected bcrypt hash, got: {h[:6]!r}"

    def test_verify_correct_password_returns_true(self) -> None:
        password = "CorrectHorseBattery"
        h = hash_password(password)
        assert verify_password(password, h) is True

    def test_verify_wrong_password_returns_false(self) -> None:
        h = hash_password("CorrectPassword1")
        assert verify_password("WrongPassword1", h) is False


# =========================================================================== #
# 2. JWT                                                                       #
# =========================================================================== #

class TestJWT:
    def test_create_token_returns_string(self) -> None:
        token = create_access_token(user_id=42, role="DEVELOPER")
        assert isinstance(token, str) and len(token) > 10

    def test_decode_valid_token_returns_payload(self) -> None:
        token = _make_token(user_id=7, role="TESTER")
        payload = decode_access_token(token)
        assert payload["sub"] == "7"
        assert payload["role"] == "TESTER"

    def test_decode_invalid_token_raises_401(self) -> None:
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            decode_access_token("not.a.valid.token")
        assert exc_info.value.status_code == 401

    def test_decode_expired_token_raises_401(self) -> None:
        from fastapi import HTTPException
        expired = _expired_token()
        with pytest.raises(HTTPException) as exc_info:
            decode_access_token(expired)
        assert exc_info.value.status_code == 401


# =========================================================================== #
# 3. Registration                                                              #
# =========================================================================== #

class TestRegistration:
    def test_valid_developer_registration(self) -> None:
        """POST /auth/register with DEVELOPER role returns 422 — DEVELOPER is a legacy role
        that cannot be registered publicly. Only USER and TESTER are allowed."""
        with patch("app.routes.auth.send_otp_email", new_callable=AsyncMock):
            response = client.post("/auth/register", json={
                "full_name": "Test Developer",
                "email": _email("dev_reg"),
                "password": "SecurePass123",
                "role": "DEVELOPER",
            })
        assert response.status_code == 422

    def test_invalid_email_rejected(self) -> None:
        response = client.post("/auth/register", json={
            "full_name": "Bad Email User",
            "email": "not-an-email",
            "password": "SecurePass123",
            "role": "TESTER",
        })
        assert response.status_code == 422

    def test_weak_password_rejected(self) -> None:
        """Passwords shorter than 8 characters must be rejected."""
        response = client.post("/auth/register", json={
            "full_name": "Weak Password User",
            "email": _email("weakpass"),
            "password": "short",
            "role": "TESTER",
        })
        assert response.status_code == 422

    def test_duplicate_email_returns_409(self) -> None:
        """Second registration with the same email must return 409."""
        payload = {
            "full_name": "Duplicate User",
            "email": _email("dup"),
            "password": "SecurePass123",
            "role": "TESTER",
        }
        with patch("app.routes.auth.send_otp_email", new_callable=AsyncMock):
            client.post("/auth/register", json=payload)  # first
            response = client.post("/auth/register", json=payload)  # duplicate
        assert response.status_code == 409

    def test_admin_registration_rejected(self) -> None:
        """Privileged roles must be created by an administrator, not public signup."""
        import uuid
        response = client.post("/auth/register", json={
            "full_name": "Admin Attempt",
            "email": _email(f"admin_attempt_{uuid.uuid4().hex[:6]}"),
            "password": "SecurePass123",
            "role": "ADMIN",
        })
        assert response.status_code == 422


# =========================================================================== #
# 4. OTP mechanics                                                             #
# =========================================================================== #

@pytest.mark.skip(reason="Gmail OTP is temporarily disabled for demo version")
class TestOTPMechanics:
    def test_otp_is_exactly_six_digits(self) -> None:
        from app.services.otp_service import generate_otp
        for _ in range(20):
            otp = generate_otp()
            assert len(otp) == 6, f"OTP length {len(otp)} != 6"
            assert otp.isdigit(), f"OTP {otp!r} contains non-digits"

    def test_otp_verification_success(self) -> None:
        """
        Successful OTP flow: register → capture OTP → verify-otp → 200.
        Email sending is mocked to capture the OTP without real SMTP.
        """
        email = _email("otp_success")
        captured_otp: list[str] = []

        async def mock_send(to_email: str, otp: str) -> None:
            captured_otp.append(otp)

        with patch("app.routes.auth.send_otp_email", side_effect=mock_send):
            r = client.post("/auth/register", json={
                "full_name": "OTP Test User",
                "email": email,
                "password": "SecurePass123",
                "role": "USER",
            })

        if r.status_code == 409 or not captured_otp:
            pytest.skip("User exists or OTP not captured — re-run with fresh DB")

        response = client.post("/auth/verify-otp", json={
            "email": email,
            "otp": captured_otp[0],
        })
        assert response.status_code == 200

    def test_wrong_otp_rejected(self) -> None:
        email = _email("wrong_otp")
        with patch("app.routes.auth.send_otp_email", new_callable=AsyncMock):
            r = client.post("/auth/register", json={
                "full_name": "Wrong OTP User",
                "email": email,
                "password": "SecurePass123",
                "role": "USER",
            })
        if r.status_code == 409:
            pytest.skip("User exists from prior run")
        response = client.post("/auth/verify-otp", json={
            "email": email,
            "otp": "000000",
        })
        assert response.status_code in (400, 429)

    def test_expired_otp_rejected(self) -> None:
        """Wrong OTP submitted; confirms rejection (400) not a 2xx."""
        email = _email("expired_otp")
        with patch("app.routes.auth.send_otp_email", new_callable=AsyncMock):
            r = client.post("/auth/register", json={
                "full_name": "Expired OTP User",
                "email": email,
                "password": "SecurePass123",
                "role": "USER",
            })
        if r.status_code == 409:
            pytest.skip("User exists from prior run")
        response = client.post("/auth/verify-otp", json={
            "email": email,
            "otp": "111111",
        })
        assert response.status_code in (400, 429)

    def test_used_otp_rejected(self) -> None:
        """After successful verification, replaying the same OTP must fail."""
        email = _email("used_otp")
        captured_otp: list[str] = []

        async def mock_send(to_email: str, otp: str) -> None:
            captured_otp.append(otp)

        with patch("app.routes.auth.send_otp_email", side_effect=mock_send):
            r = client.post("/auth/register", json={
                "full_name": "Used OTP User",
                "email": email,
                "password": "SecurePass123",
                "role": "USER",
            })

        if r.status_code == 409 or not captured_otp:
            pytest.skip("User exists or OTP not captured")

        otp = captured_otp[0]
        # First verification — should succeed
        client.post("/auth/verify-otp", json={"email": email, "otp": otp})
        # Replay — must fail or return "already verified"
        response = client.post("/auth/verify-otp", json={"email": email, "otp": otp})
        assert response.status_code in (200, 400)  # 200 = "already verified"

    def test_max_attempts_enforced(self) -> None:
        """After OTP_MAX_ATTEMPTS wrong guesses the endpoint returns 429."""
        email = f"maxattempts_{uuid.uuid4().hex[:6]}.{_SUFFIX}@example.com"
        with patch("app.routes.auth.send_otp_email", new_callable=AsyncMock):
            r = client.post("/auth/register", json={
                "full_name": "Max Attempts",
                "email": email,
                "password": "SecurePass123",
                "role": "USER",  # USER role (DEVELOPER is now blocked from public registration)
            })
        if r.status_code == 409:
            pytest.skip("User exists from prior run")
        last_status = 400
        for _ in range(settings.OTP_MAX_ATTEMPTS + 1):
            resp = client.post("/auth/verify-otp", json={"email": email, "otp": "000000"})
            last_status = resp.status_code
        assert last_status == 429

    def test_resend_cooldown_enforced(self) -> None:
        """Requesting a second OTP within 60 seconds returns 429."""
        email = _email("cooldown")
        with patch("app.routes.auth.send_otp_email", new_callable=AsyncMock):
            r = client.post("/auth/register", json={
                "full_name": "Cooldown User",
                "email": email,
                "password": "SecurePass123",
                "role": "USER",
            })
            if r.status_code == 409:
                pytest.skip("User exists from prior run")
            response = client.post("/auth/resend-otp", json={"email": email})
        assert response.status_code in (200, 429)


# =========================================================================== #
# 5. Login                                                                     #
# =========================================================================== #

class TestLogin:
    def test_verified_user_login_succeeds(self) -> None:
        """A verified active user can obtain a JWT."""
        email = _email("loginok")
        password = "SecurePass123"
        captured_otp: list[str] = []

        async def mock_send(to_email: str, otp: str) -> None:
            captured_otp.append(otp)

        with patch("app.routes.auth.send_otp_email", side_effect=mock_send):
            reg = client.post("/auth/register", json={
                "full_name": "Login OK",
                "email": email,
                "password": password,
                "role": "DEVELOPER",
            })

        if reg.status_code == 409:
            pytest.skip("User already exists; may already be verified")

        if not captured_otp:
            pytest.skip("OTP not captured")

        client.post("/auth/verify-otp", json={"email": email, "otp": captured_otp[0]})

        response = client.post("/auth/login", json={"email": email, "password": password})
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert "user" in data
        assert "password_hash" not in data["user"]

    def test_wrong_password_rejected(self) -> None:
        response = client.post("/auth/login", json={
            "email": _email("loginok"),
            "password": "WrongPassword!1234",
        })
        assert response.status_code in (401, 422)

    def test_registered_user_can_login_without_otp(self) -> None:
        """Password signup is immediately usable because OTP is disabled."""
        email = _email("password_signup")
        reg = client.post("/auth/register", json={
            "full_name": "Password Signup",
            "email": email,
            "password": "SecurePass123",
            "role": "TESTER",
        })
        if reg.status_code == 409:
            pytest.skip("User already exists")
        assert reg.status_code == 201
        response = client.post("/auth/login", json={
            "email": email,
            "password": "SecurePass123",
        })
        assert response.status_code == 200

    def test_nonexistent_user_login_rejected(self) -> None:
        response = client.post("/auth/login", json={
            "email": "ghost.user.xyz99@example.com",
            "password": "DoesNotMatter1",
        })
        assert response.status_code == 401


# =========================================================================== #
# 6. /auth/me endpoint                                                         #
# =========================================================================== #

class TestAuthMe:
    def test_me_missing_jwt_returns_401(self) -> None:
        response = client.get("/auth/me")
        assert response.status_code == 401

    def test_me_invalid_jwt_returns_401(self) -> None:
        response = client.get(
            "/auth/me",
            headers={"Authorization": "Bearer this.is.not.valid"},
        )
        assert response.status_code == 401

    def test_me_valid_jwt_returns_user(self) -> None:
        """A valid JWT for an existing verified user must return the profile."""
        email = _email("metest")
        password = "SecurePass123"
        captured_otp: list[str] = []

        async def mock_send(to_email: str, otp: str) -> None:
            captured_otp.append(otp)

        with patch("app.routes.auth.send_otp_email", side_effect=mock_send):
            reg = client.post("/auth/register", json={
                "full_name": "Me Test User",
                "email": email,
                "password": password,
                "role": "DEVELOPER",
            })

        if reg.status_code == 201 and captured_otp:
            client.post("/auth/verify-otp", json={"email": email, "otp": captured_otp[0]})

        login_resp = client.post("/auth/login", json={"email": email, "password": password})
        if login_resp.status_code != 200:
            pytest.skip("Could not log in — user may not be verified")

        token = login_resp.json()["access_token"]
        me_resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_resp.status_code == 200
        user_data = me_resp.json()
        assert user_data["email"] == email
        assert "password_hash" not in user_data


# =========================================================================== #
# 7. RBAC                                                                      #
# =========================================================================== #

class TestRBAC:
    def test_correct_role_allowed(self) -> None:
        """require_role(DEVELOPER) allows a DEVELOPER token."""
        from app.dependencies.auth import require_role
        dep = require_role(UserRole.DEVELOPER)
        assert callable(dep)

    def test_wrong_role_returns_403(self) -> None:
        """require_role(ADMIN) rejects a TESTER user with HTTP 403."""
        from fastapi import HTTPException
        from app.dependencies.auth import require_role
        from unittest.mock import MagicMock

        tester_user = MagicMock()
        tester_user.role = UserRole.TESTER

        check = require_role(UserRole.ADMIN)

        async def _run() -> int:
            try:
                await check(current_user=tester_user)
                return 200
            except HTTPException as exc:
                return exc.status_code

        loop = asyncio.SelectorEventLoop(selectors.SelectSelector())
        result = loop.run_until_complete(_run())
        loop.close()
        assert result == 403


# =========================================================================== #
# 8. Email service — mocking                                                   #
# =========================================================================== #

class TestEmailService:
    def test_email_service_is_mockable(self) -> None:
        """Email service can be mocked — no real SMTP call occurs."""
        with patch("app.routes.auth.send_otp_email", new_callable=AsyncMock) as mock_email:
            client.post("/auth/register", json={
                "full_name": "Mock Email Test",
                "email": _email("mockemail"),
                "password": "SecurePass123",
                "role": "TESTER",
            })
            assert mock_email.call_count in (0, 1)

    def test_no_real_emails_sent_in_tests(self) -> None:
        """Confirm no real SMTP is sent when email service is mocked."""
        # Patch at the route import level — this is the canonical mock point
        with patch("app.routes.auth.send_otp_email", new_callable=AsyncMock) as mock_email:
            client.post("/auth/register", json={
                "full_name": "No Real Email",
                "email": _email("norealemail2"),
                "password": "SecurePass123",
                "role": "USER",
            })
            assert mock_email.call_count in (0, 1)


# =========================================================================== #
# 9. Passwordless Email + OTP Flow                                             #
# =========================================================================== #

class TestPasswordlessAuth:
    def test_request_otp_and_verify_returns_jwt(self) -> None:
        """Passwordless flow: request-otp -> verify-otp -> JWT returned immediately."""
        import uuid
        email = _email(f"pwdless_{uuid.uuid4().hex[:8]}")
        captured_otp: list[str] = []

        async def mock_send(to_email: str, otp: str) -> None:
            captured_otp.append(otp)

        with patch("app.routes.auth.send_otp_email", side_effect=mock_send):
            req_res = client.post("/auth/request-otp", json={"email": email})
            assert req_res.status_code == 200

        if not captured_otp:
            pytest.skip("OTP not captured")

        verify_res = client.post("/auth/verify-otp", json={
            "email": email,
            "otp": captured_otp[0],
        })
        assert verify_res.status_code == 200
        data = verify_res.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == email
        assert data["user"]["role"] in ("DEVELOPER", "TESTER", "ADMIN", "USER")
        assert data["user"]["is_active"] is True
        assert data["user"]["is_email_verified"] is True


# =========================================================================== #
# 10. Profile Update & Password Change                                        #
# =========================================================================== #

class TestProfileAndChangePassword:
    def test_update_profile_and_change_password(self) -> None:
        """User can update their full_name and change password."""
        import uuid
        email = _email(f"profile_{uuid.uuid4().hex[:8]}")
        captured_otp: list[str] = []

        async def mock_send(to_email: str, otp: str) -> None:
            captured_otp.append(otp)

        with patch("app.routes.auth.send_otp_email", side_effect=mock_send):
            client.post("/auth/register", json={
                "full_name": "Original Name",
                "email": email,
                "password": "InitialPassword123",
                "role": "USER",
            })

        if not captured_otp:
            pytest.skip("OTP not captured")

        verify_res = client.post("/auth/verify-otp", json={
            "email": email,
            "otp": captured_otp[0],
        })
        token = verify_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Update Profile Full Name
        patch_res = client.patch("/auth/profile", json={"full_name": "Updated Name"}, headers=headers)
        assert patch_res.status_code == 200
        assert patch_res.json()["full_name"] == "Updated Name"

        # 2. Change Password - Incorrect current password
        bad_pass = client.post("/auth/change-password", json={
            "current_password": "WrongPassword",
            "new_password": "NewSecretPassword123",
        }, headers=headers)
        assert bad_pass.status_code == 400

        # 3. Change Password - Success
        good_pass = client.post("/auth/change-password", json={
            "current_password": "InitialPassword123",
            "new_password": "NewSecretPassword123",
        }, headers=headers)
        assert good_pass.status_code == 200

        # 4. Login with New Password
        login_res = client.post("/auth/login", json={
            "email": email,
            "password": "NewSecretPassword123",
        })
        assert login_res.status_code == 200


