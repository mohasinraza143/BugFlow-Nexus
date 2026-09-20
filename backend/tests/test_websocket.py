"""
test_websocket.py — Phase 8 tests for WebSocket notification streaming.

Covers:
  - Connection handshake with valid JWT
  - Rejection on missing token (code 4001)
  - Rejection on invalid token (code 4001)
  - Rejection on deactivated user (code 4003)
  - Real-time notification delivery over active WebSocket
"""

import uuid
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import app
from app.services.websocket_manager import ws_manager
from tests.conftest import (
    admin_token,
    auth_header,
    dev_token,
    dev2_token,
    tester_token,
)

client = TestClient(app)


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
# Connection & Auth Handshake                                                  #
# --------------------------------------------------------------------------- #

class TestWebSocketAuth:
    def test_ws_connect_success(self):
        tok = dev_token()
        with client.websocket_connect(f"/ws/notifications?token={tok}") as ws:
            # Connection open, send keepalive text frame
            ws.send_text("ping")

    def test_ws_connect_missing_token_rejected_4001(self):
        with pytest.raises(WebSocketDisconnect) as exc_info:
            with client.websocket_connect("/ws/notifications"):
                pass
        assert exc_info.value.code == 4001

    def test_ws_connect_invalid_token_rejected_4001(self):
        with pytest.raises(WebSocketDisconnect) as exc_info:
            with client.websocket_connect("/ws/notifications?token=invalid.jwt.token"):
                pass
        assert exc_info.value.code == 4001

    def test_ws_connect_deactivated_user_rejected_4003(self):
        adm = admin_token()
        dev2 = dev2_token()
        dev2_id = _get_user_id_by_email("dev2.p4ci@example.com", adm)

        # Deactivate dev2
        r_deact = client.patch(f"/users/{dev2_id}/deactivate", headers=auth_header(adm))
        assert r_deact.status_code == 200

        try:
            with pytest.raises(WebSocketDisconnect) as exc_info:
                with client.websocket_connect(f"/ws/notifications?token={dev2}"):
                    pass
            assert exc_info.value.code == 4003
        finally:
            # Reactivate dev2
            client.patch(f"/users/{dev2_id}/activate", headers=auth_header(adm))


# --------------------------------------------------------------------------- #
# Real-Time Event Dispatch                                                    #
# --------------------------------------------------------------------------- #

class TestWebSocketRealTimeDelivery:
    def test_ws_direct_send(self):
        tok = dev_token()
        adm = admin_token()
        dev_id = _get_user_id_by_email("dev.p4ci@example.com", adm)

        with client.websocket_connect(f"/ws/notifications?token={tok}") as ws:
            # Test direct connection dispatch
            payload = {
                "type": "notification",
                "data": {
                    "notification_type": "ISSUE_ASSIGNED",
                    "title": "Direct WS test",
                    "message": "Testing real-time message stream",
                },
            }
            # Simulate ws_manager send
            import asyncio
            asyncio.run(ws_manager.send_personal_notification(dev_id, payload))

            received = ws.receive_json()
            assert received["type"] == "notification"
            assert received["data"]["notification_type"] == "ISSUE_ASSIGNED"
            assert received["data"]["title"] == "Direct WS test"
