import uuid
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import (
    admin_token, tester_token, tester3_token, user_token, auth_header, _CLIENT, _ci_email
)

# ─── Project/sprint shared across the whole class (created once) ─────────────
_SHARED_PROJECT_ID: int | None = None
_SHARED_TESTER_ID: int | None = None


def _get_shared_project_id() -> int:
    global _SHARED_PROJECT_ID
    if _SHARED_PROJECT_ID is None:
        key = 'AWFT' + uuid.uuid4().hex[:6].upper()
        r = _CLIENT.post('/projects', json={
            'name': 'Approval WF Project',
            'description': 'Shared project for sprint approval tests',
            'project_key': key,
            'is_active': True,
        }, headers=auth_header(admin_token()))
        assert r.status_code in (200, 201), f'Create project: {r.text}'
        _SHARED_PROJECT_ID = r.json()['id']
    return _SHARED_PROJECT_ID


def _get_shared_tester_id() -> int:
    global _SHARED_TESTER_ID
    if _SHARED_TESTER_ID is None:
        r = _CLIENT.get('/users', params={'role': 'TESTER', 'page_size': 100},
                        headers=auth_header(admin_token()))
        assert r.status_code == 200
        email = _ci_email('tester3')
        for u in r.json().get('items', []):
            if u['email'] == email:
                _SHARED_TESTER_ID = u['id']
                break
        assert _SHARED_TESTER_ID is not None, 'tester3 user not found'
    return _SHARED_TESTER_ID


def _create_sprint(project_id: int) -> int:
    start = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    end = (datetime.now(timezone.utc) + timedelta(days=8)).isoformat()
    r = _CLIENT.post('/sprints', json={
        'name': f'Approval Sprint {uuid.uuid4().hex[:6]}',
        'goal': 'Test the approval flow',
        'start_date': start,
        'end_date': end,
        'project_id': project_id,
    }, headers=auth_header(admin_token()))
    assert r.status_code in (200, 201), f'Create sprint: {r.text}'
    return r.json()['id']


class TestSprintApprovalWorkflow:
    """Full Admin -> Tester -> Admin sprint approval workflow.

    Status flow:
        PLANNED -> ACTIVE  (admin: assign-tester)
        ACTIVE  -> IN_PROGRESS  (tester: begin-work)  [REQUIRED step]
        IN_PROGRESS -> READY_FOR_APPROVAL  (tester: submit-for-approval)
        READY_FOR_APPROVAL -> COMPLETED  (admin: approve)
          OR
        READY_FOR_APPROVAL -> IN_PROGRESS  (admin: request-changes) -> re-submit -> COMPLETED
    """

    def setup_method(self):
        self.project_id = _get_shared_project_id()
        self.tester_id = _get_shared_tester_id()
        self.sprint_id = _create_sprint(self.project_id)

    # ── helpers ───────────────────────────────────────────────────────────────
    def _assign(self):
        r = _CLIENT.post(f'/sprints/{self.sprint_id}/assign-tester',
                         json={'tester_id': self.tester_id},
                         headers=auth_header(admin_token()))
        assert r.status_code == 200, r.text

    def _begin_work(self):
        r = _CLIENT.post(f'/sprints/{self.sprint_id}/begin-work',
                         headers=auth_header(tester3_token()))
        assert r.status_code == 200, r.text

    def _submit(self):
        r = _CLIENT.post(f'/sprints/{self.sprint_id}/submit-for-approval',
                         headers=auth_header(tester3_token()))
        assert r.status_code == 200, r.text

    # ── 1. Assign Tester ──────────────────────────────────────────────────────
    def test_assign_tester_admin_ok(self):
        r = _CLIENT.post(f'/sprints/{self.sprint_id}/assign-tester',
                         json={'tester_id': self.tester_id},
                         headers=auth_header(admin_token()))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data['assigned_tester_id'] == self.tester_id
        assert data['status'] == 'ACTIVE'  # PLANNED -> ACTIVE auto-transition

    def test_assign_tester_user_forbidden(self):
        r = _CLIENT.post(f'/sprints/{self.sprint_id}/assign-tester',
                         json={'tester_id': self.tester_id},
                         headers=auth_header(user_token()))
        assert r.status_code == 403

    def test_assign_tester_tester_role_forbidden(self):
        r = _CLIENT.post(f'/sprints/{self.sprint_id}/assign-tester',
                         json={'tester_id': self.tester_id},
                         headers=auth_header(tester3_token()))
        assert r.status_code == 403

    # ── 2. Begin Work ─────────────────────────────────────────────────────────
    def test_begin_work_by_assigned_tester(self):
        self._assign()
        r = _CLIENT.post(f'/sprints/{self.sprint_id}/begin-work',
                         headers=auth_header(tester3_token()))
        assert r.status_code == 200, r.text
        assert r.json()['status'] == 'IN_PROGRESS'

    def test_begin_work_not_assigned_tester_forbidden(self):
        self._assign()
        r = _CLIENT.post(f'/sprints/{self.sprint_id}/begin-work',
                         headers=auth_header(tester_token()))  # different tester
        assert r.status_code == 403

    def test_begin_work_wrong_status_fails(self):
        """Sprint is PLANNED when no tester is assigned - begin-work must fail."""
        # PLANNED, no tester, tester3 is not assigned so 403
        r = _CLIENT.post(f'/sprints/{self.sprint_id}/begin-work',
                         headers=auth_header(admin_token()))
        # admin is allowed role-wise but sprint is PLANNED not ACTIVE -> 400
        assert r.status_code == 400

    def test_begin_work_user_forbidden(self):
        self._assign()
        r = _CLIENT.post(f'/sprints/{self.sprint_id}/begin-work',
                         headers=auth_header(user_token()))
        assert r.status_code == 403

    # ── 3. Submit for Approval ────────────────────────────────────────────────
    def test_submit_for_approval_from_in_progress(self):
        self._assign()
        self._begin_work()
        r = _CLIENT.post(f'/sprints/{self.sprint_id}/submit-for-approval',
                         headers=auth_header(tester3_token()))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data['status'] == 'READY_FOR_APPROVAL'
        assert data['submitted_by_id'] is not None
        assert data['submitted_at'] is not None
        assert data['review_comment'] is None  # cleared on submit

    def test_submit_from_active_without_begin_work_fails(self):
        """Tester cannot submit directly from ACTIVE - must begin-work first."""
        self._assign()  # sprint is now ACTIVE
        r = _CLIENT.post(f'/sprints/{self.sprint_id}/submit-for-approval',
                         headers=auth_header(tester3_token()))
        assert r.status_code == 400

    def test_submit_not_assigned_tester_forbidden(self):
        self._assign()
        self._begin_work()
        r = _CLIENT.post(f'/sprints/{self.sprint_id}/submit-for-approval',
                         headers=auth_header(tester_token()))  # different tester
        assert r.status_code == 403

    # ── 4. Assigned / Awaiting Approval queues ────────────────────────────────
    def test_assigned_sprints_visible_to_tester(self):
        self._assign()
        r = _CLIENT.get('/sprints/assigned', headers=auth_header(tester3_token()))
        assert r.status_code == 200, r.text
        assert self.sprint_id in [s['id'] for s in r.json()]

    def test_assigned_sprints_forbidden_for_user(self):
        r = _CLIENT.get('/sprints/assigned', headers=auth_header(user_token()))
        assert r.status_code == 403

    def test_awaiting_approval_visible_to_admin(self):
        self._assign()
        self._begin_work()
        self._submit()
        r = _CLIENT.get('/sprints/awaiting-approval', headers=auth_header(admin_token()))
        assert r.status_code == 200, r.text
        assert self.sprint_id in [s['id'] for s in r.json()]

    def test_awaiting_approval_forbidden_for_tester(self):
        r = _CLIENT.get('/sprints/awaiting-approval', headers=auth_header(tester3_token()))
        assert r.status_code == 403

    # ── 5. Admin Approves ─────────────────────────────────────────────────────
    def test_approve_sprint_admin_ok(self):
        self._assign()
        self._begin_work()
        self._submit()
        r = _CLIENT.post(f'/sprints/{self.sprint_id}/approve', headers=auth_header(admin_token()))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data['status'] == 'COMPLETED'
        assert data['approved_by_id'] is not None
        assert data['approved_at'] is not None
        assert data['completed_at'] is not None

    def test_approve_sprint_tester_forbidden(self):
        self._assign()
        self._begin_work()
        self._submit()
        r = _CLIENT.post(f'/sprints/{self.sprint_id}/approve', headers=auth_header(tester3_token()))
        assert r.status_code == 403

    def test_approve_wrong_status_fails(self):
        r = _CLIENT.post(f'/sprints/{self.sprint_id}/approve', headers=auth_header(admin_token()))
        assert r.status_code == 400

    # ── 6. Admin Requests Changes ─────────────────────────────────────────────
    def test_request_changes_admin_ok(self):
        self._assign()
        self._begin_work()
        self._submit()
        r = _CLIENT.post(f'/sprints/{self.sprint_id}/request-changes',
                         json={'comment': 'Fix edge cases in feature X.'},
                         headers=auth_header(admin_token()))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data['status'] == 'IN_PROGRESS'
        assert data['review_comment'] == 'Fix edge cases in feature X.'

    def test_request_changes_tester_forbidden(self):
        self._assign()
        self._begin_work()
        self._submit()
        r = _CLIENT.post(f'/sprints/{self.sprint_id}/request-changes',
                         json={'comment': 'nope'},
                         headers=auth_header(tester3_token()))
        assert r.status_code == 403

    def test_request_changes_without_comment_ok(self):
        self._assign()
        self._begin_work()
        self._submit()
        r = _CLIENT.post(f'/sprints/{self.sprint_id}/request-changes',
                         json={'comment': None},
                         headers=auth_header(admin_token()))
        assert r.status_code == 200, r.text
        assert r.json()['status'] == 'IN_PROGRESS'

    # ── 7. Re-submit after changes requested ──────────────────────────────────
    def test_resubmit_after_changes_requested(self):
        # Full flow: assign -> begin_work -> submit -> request_changes -> re-submit
        self._assign()
        self._begin_work()
        self._submit()
        _CLIENT.post(f'/sprints/{self.sprint_id}/request-changes',
                     json={'comment': 'Fix tests'},
                     headers=auth_header(admin_token()))
        # Re-submit (sprint is IN_PROGRESS again - no begin-work needed)
        r = _CLIENT.post(f'/sprints/{self.sprint_id}/submit-for-approval',
                         headers=auth_header(tester3_token()))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data['status'] == 'READY_FOR_APPROVAL'
        assert data['review_comment'] is None  # cleared on re-submit

    # ── 8. Full end-to-end ────────────────────────────────────────────────────
    def test_full_workflow_approve(self):
        """End-to-end: PLANNED->ACTIVE->IN_PROGRESS->READY_FOR_APPROVAL->COMPLETED"""
        self._assign()
        self._begin_work()
        self._submit()
        r = _CLIENT.post(f'/sprints/{self.sprint_id}/approve', headers=auth_header(admin_token()))
        assert r.status_code == 200
        assert r.json()['status'] == 'COMPLETED'

