"""
E2E integration test for verifying the USER -> ADMIN -> TESTER -> USER workflow
across all boundaries and the database.
"""
import asyncio
import selectors
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

import uuid
from app.database.connection import engine
from app.main import app
from app.models.issue import Issue, IssueStatus
from app.models.audit_log import AuditLog
from app.models.notification import Notification
from tests.conftest import (
    admin_token,
    auth_header,
    tester_token,
    user_token,
)

client = TestClient(app)

def _run_sync(coro):
    loop = asyncio.SelectorEventLoop(selectors.SelectSelector())
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def test_e2e_user_to_admin_to_tester_workflow():
    """
    E2E Workflow Test:
    1. USER creates issue.
    2. USER fails to access admin-only and tester-only routes.
    3. ADMIN views unassigned issues and assigns the issue to TESTER.
    4. TESTER views their assigned issues.
    5. TESTER updates status ASSIGNED -> IN_DEVELOPMENT -> IN_REVIEW -> IN_TESTING -> RESOLVED.
    6. USER confirms resolution (RESOLVED -> CLOSED).
    7. USER reopens issue (CLOSED -> REOPENED).
    8. Verify raw database persistence and records.
    """
    u_tok = user_token()
    a_tok = admin_token()
    t_tok = tester_token()

    user_headers = auth_header(u_tok)
    admin_headers = auth_header(a_tok)
    tester_headers = auth_header(t_tok)

    # Need a project to create an issue
    project_key = f"E2E{uuid.uuid4().hex[:4].upper()}"
    r = client.post("/projects", json={"name": "E2E Project", "project_key": project_key}, headers=admin_headers)
    
    if r.status_code == 201:
        project_id = r.json()["id"]
    else:
        # If there's an error, just get the first available project
        list_r = client.get("/projects", headers=admin_headers)
        project_id = list_r.json()["items"][0]["id"]

    # Step 1: User Creates Issue
    create_payload = {
        "title": "E2E Workflow Test Defect",
        "description": "This is a critical test defect.",
        "project_id": project_id,
        "issue_type": "BUG",
        "priority": "HIGH",
        "severity": "CRITICAL",
    }
    create_resp = client.post("/issues", json=create_payload, headers=user_headers)
    assert create_resp.status_code == 201, create_resp.text
    issue_data = create_resp.json()
    issue_id = issue_data["id"]

    assert issue_data["status"] == "REPORTED"
    assert issue_data["reporter"] is not None
    assert issue_data["assignee"] is None

    # Step 2: Role Isolation Checks
    # User tries to assign (Admin only)
    assign_resp = client.patch(
        f"/issues/{issue_id}/assign", 
        json={"developer_id": 2}, 
        headers=user_headers
    )
    assert assign_resp.status_code == 403

    # User tries to change status (Tester only)
    status_resp = client.patch(
        f"/issues/{issue_id}/status", 
        json={"status": "IN_DEVELOPMENT"}, 
        headers=user_headers
    )
    assert status_resp.status_code == 403

    # Step 3: Admin Views Unassigned and Assigns
    unassigned_resp = client.get("/issues?unassigned=true", headers=admin_headers)
    assert unassigned_resp.status_code == 200
    unassigned_issues = unassigned_resp.json()["items"]
    assert any(i["id"] == issue_id for i in unassigned_issues)

    # Get the tester ID to assign
    me_tester = client.get("/auth/me", headers=tester_headers)
    tester_id = me_tester.json()["id"]

    assign_action = client.patch(
        f"/issues/{issue_id}/assign",
        json={"developer_id": tester_id},
        headers=admin_headers
    )
    assert assign_action.status_code == 200, f"Failed assigning to {tester_id}: {assign_action.text}"
    assert assign_action.json()["assignee"]["id"] == tester_id
    assert assign_action.json()["status"] == "ASSIGNED"

    # Step 4: Tester Views Assigned Issue
    tester_list_resp = client.get("/issues", headers=tester_headers)
    assert tester_list_resp.status_code == 200
    tester_issues = tester_list_resp.json()["items"]
    assert any(i["id"] == issue_id for i in tester_issues)

    # Tester Isolation check: Test tester sees only their assigned issues
    for issue in tester_issues:
        assert issue["assignee_id"] == tester_id or issue["reporter_id"] == tester_id

    # Step 5: Tester Workflow Transitions
    dev_resp = client.patch(
        f"/issues/{issue_id}/status",
        json={"status": "IN_DEVELOPMENT"},
        headers=tester_headers
    )
    assert dev_resp.status_code == 200
    assert dev_resp.json()["status"] == "IN_DEVELOPMENT"

    rev_resp = client.patch(
        f"/issues/{issue_id}/status",
        json={"status": "IN_REVIEW"},
        headers=tester_headers
    )
    assert rev_resp.status_code == 200
    assert rev_resp.json()["status"] == "IN_REVIEW"

    test_resp = client.patch(
        f"/issues/{issue_id}/status",
        json={"status": "IN_TESTING"},
        headers=tester_headers
    )
    assert test_resp.status_code == 200
    assert test_resp.json()["status"] == "IN_TESTING"

    res_resp = client.patch(
        f"/issues/{issue_id}/resolve",
        json={"resolution_summary": "Fixed the critical defect.", "resolution_notes": "Tested in stage."},
        headers=tester_headers
    )
    assert res_resp.status_code == 200
    assert res_resp.json()["status"] == "RESOLVED"
    assert res_resp.json()["resolved_at"] is not None

    # Step 6: User Confirms Resolution -> CLOSED
    close_resp = client.patch(
        f"/issues/{issue_id}/close",
        headers=user_headers
    )
    assert close_resp.status_code == 200
    assert close_resp.json()["status"] == "CLOSED"

    # Step 7: User Reopens -> REOPENED
    reopen_resp = client.patch(
        f"/issues/{issue_id}/reopen",
        json={"reason": "The fix broke another part of the system."},
        headers=user_headers
    )
    assert reopen_resp.status_code == 200
    assert reopen_resp.json()["status"] == "REOPENED"

    # Step 8: Raw PostgreSQL Verification
    async def _verify_db():
        from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
        from sqlalchemy.orm import selectinload

        async_session = async_sessionmaker(engine, expire_on_commit=False)
        async with async_session() as session:
            # Eagerly load relationships to prevent implicit lazy IO
            result = await session.execute(
                select(Issue)
                .where(Issue.id == issue_id)
                .options(selectinload(Issue.assignee), selectinload(Issue.reporter))
            )
            db_issue = result.scalar_one_or_none()
            assert db_issue is not None
            assert db_issue.status == IssueStatus.REOPENED
            assert db_issue.assignee_id == tester_id
            assert db_issue.resolved_at is None  # Should be cleared on reopen

            # Check Audit Logs
            audit_res = await session.execute(
                select(AuditLog).where(AuditLog.entity_id == issue_id).order_by(AuditLog.created_at)
            )
            audit_logs = audit_res.scalars().all()
            actions = [log.action.value for log in audit_logs]

            assert "ISSUE_CREATED" in actions
            assert "ISSUE_ASSIGNED" in actions
            assert "ISSUE_STATUS_CHANGED" in actions
            assert "ISSUE_RESOLVED" in actions
            assert "ISSUE_REOPENED" in actions

            # Check Notifications
            notif_res = await session.execute(
                select(Notification).where(Notification.entity_id == issue_id)
            )
            notifications = notif_res.scalars().all()
            assert len(notifications) > 0

            reopen_notifs = [n for n in notifications if n.notification_type.value == "ISSUE_REOPENED"]
            assert len(reopen_notifs) > 0
            assert any(n.user_id == tester_id for n in reopen_notifs)

    _run_sync(_verify_db())

if __name__ == "__main__":
    test_e2e_user_to_admin_to_tester_workflow()
    print("ALL TESTS PASSED")
