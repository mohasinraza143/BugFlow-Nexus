"""
Phase 4 tests: Project Management API.

Uses conftest.py-provided verified tokens (bypasses OTP registration flow).

Covers:
  - Unauthenticated requests return 401
  - ADMIN can create project
  - Duplicate project_key rejected (409)
  - Invalid project_key rejected (422)
  - Non-ADMIN cannot create/update/deactivate (403)
  - All authenticated users can list/view projects
  - Pagination parameters work
  - Project not found returns 404
  - ADMIN can update a project
  - ADMIN can deactivate a project
  - Cannot deactivate already-inactive project (400)
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import admin_token, auth_header, dev_token
from tests.conftest import tester_token as _get_tester_token

# Define local wrappers to avoid pytest collecting 'tester_*' names
_admin_tok = admin_token
_dev_tok = dev_token
_tester_tok = _get_tester_token

client = TestClient(app)

# =========================================================================== #
# Project helpers                                                              #
# =========================================================================== #

def _fresh_key(prefix: str = "TST") -> str:
    """Generate a unique project key per call using uuid."""
    uid = uuid.uuid4().hex[:6].upper()
    safe = prefix[:8] if len(prefix) <= 8 else prefix[:8]
    return f"{safe}{uid}"


def _create_project(key: str, name: str, token: str | None = None) -> dict:
    t = token or _admin_tok()
    r = client.post(
        "/projects",
        json={"name": name, "project_key": key},
        headers=auth_header(t),
    )
    assert r.status_code in (201, 409), f"Failed to create project: {r.status_code} {r.text}"
    if r.status_code == 201:
        return r.json()
    # Already exists — find it
    list_r = client.get("/projects", headers=auth_header(t))
    for p in list_r.json()["items"]:
        if p["project_key"] == key:
            return p
    pytest.skip(f"Could not find or create project {key}")


# =========================================================================== #
# 1. Unauthenticated access                                                    #
# =========================================================================== #

class TestProjectUnauthenticated:
    def test_list_projects_no_token_401(self) -> None:
        assert client.get("/projects").status_code == 401

    def test_create_project_no_token_401(self) -> None:
        assert client.post("/projects", json={"name": "T", "project_key": "TK"}).status_code == 401

    def test_get_project_no_token_401(self) -> None:
        assert client.get("/projects/1").status_code == 401

    def test_update_project_no_token_401(self) -> None:
        assert client.patch("/projects/1", json={"name": "x"}).status_code == 401

    def test_deactivate_no_token_401(self) -> None:
        assert client.patch("/projects/1/deactivate").status_code == 401


# =========================================================================== #
# 2. Project creation                                                          #
# =========================================================================== #

class TestProjectCreation:
    def test_admin_can_create_project(self) -> None:
        key = _fresh_key("CREA")
        r = client.post(
            "/projects",
            json={"name": "Creation Test Project", "project_key": key, "description": "Test"},
            headers=auth_header(_admin_tok()),
        )
        assert r.status_code == 201
        data = r.json()
        assert data["project_key"] == key
        assert data["status"] == "ACTIVE"
        assert "password_hash" not in str(data)

    def test_duplicate_project_key_returns_409(self) -> None:
        key = _fresh_key("DUPE")
        payload = {"name": "Dupe Project", "project_key": key}
        client.post("/projects", json=payload, headers=auth_header(_admin_tok()))
        r = client.post("/projects", json=payload, headers=auth_header(_admin_tok()))
        assert r.status_code == 409

    def test_invalid_project_key_rejected_422(self) -> None:
        r = client.post(
            "/projects",
            json={"name": "Bad Key", "project_key": "bad key!!"},
            headers=auth_header(_admin_tok()),
        )
        assert r.status_code == 422

    def test_single_char_key_rejected_422(self) -> None:
        r = client.post(
            "/projects",
            json={"name": "One Char", "project_key": "A"},
            headers=auth_header(_admin_tok()),
        )
        assert r.status_code == 422

    def test_developer_cannot_create_project_403(self) -> None:
        r = client.post(
            "/projects",
            json={"name": "Dev Project", "project_key": _fresh_key("DEVP")},
            headers=auth_header(_dev_tok()),
        )
        assert r.status_code == 403

    def test_tester_cannot_create_project_403(self) -> None:
        r = client.post(
            "/projects",
            json={"name": "Tester Project", "project_key": _fresh_key("TSTP")},
            headers=auth_header(_tester_tok()),
        )
        assert r.status_code == 403

    def test_empty_name_rejected_422(self) -> None:
        r = client.post(
            "/projects",
            json={"name": "  ", "project_key": _fresh_key("EMPT")},
            headers=auth_header(_admin_tok()),
        )
        assert r.status_code == 422


# =========================================================================== #
# 3. List and view projects                                                    #
# =========================================================================== #

class TestProjectListing:
    def test_admin_can_list_projects(self) -> None:
        r = client.get("/projects", headers=auth_header(_admin_tok()))
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert "total" in data
        assert "page" in data
        assert "total_pages" in data

    def test_developer_can_list_projects(self) -> None:
        r = client.get("/projects", headers=auth_header(_dev_tok()))
        assert r.status_code == 200

    def test_tester_can_list_projects(self) -> None:
        r = client.get("/projects", headers=auth_header(_tester_tok()))
        assert r.status_code == 200

    def test_pagination_params_work(self) -> None:
        r = client.get("/projects?page=1&page_size=3", headers=auth_header(_admin_tok()))
        assert r.status_code == 200
        data = r.json()
        assert len(data["items"]) <= 3
        assert data["page"] == 1
        assert data["page_size"] == 3

    def test_status_filter_active_works(self) -> None:
        r = client.get("/projects?status=ACTIVE", headers=auth_header(_admin_tok()))
        assert r.status_code == 200
        for p in r.json()["items"]:
            assert p["status"] == "ACTIVE"

    def test_get_project_by_id(self) -> None:
        proj = _create_project(_fresh_key("GETID"), "Get By ID Test")
        r = client.get(f"/projects/{proj['id']}", headers=auth_header(_admin_tok()))
        assert r.status_code == 200
        assert r.json()["id"] == proj["id"]

    def test_get_nonexistent_project_404(self) -> None:
        r = client.get("/projects/99999999", headers=auth_header(_admin_tok()))
        assert r.status_code == 404

    def test_response_contains_no_sensitive_data(self) -> None:
        r = client.get("/projects", headers=auth_header(_admin_tok()))
        assert "password_hash" not in r.text


# =========================================================================== #
# 4. Update and deactivate                                                     #
# =========================================================================== #

class TestProjectUpdate:
    def test_admin_can_update_project_name(self) -> None:
        proj = _create_project(_fresh_key("UPDT"), "Original Name")
        r = client.patch(
            f"/projects/{proj['id']}",
            json={"name": "Updated Name"},
            headers=auth_header(_admin_tok()),
        )
        assert r.status_code == 200
        assert r.json()["name"] == "Updated Name"

    def test_admin_can_update_description(self) -> None:
        proj = _create_project(_fresh_key("UDSC"), "Desc Update Test")
        r = client.patch(
            f"/projects/{proj['id']}",
            json={"description": "New description here"},
            headers=auth_header(_admin_tok()),
        )
        assert r.status_code == 200
        assert r.json()["description"] == "New description here"

    def test_developer_cannot_update_project_403(self) -> None:
        proj = _create_project(_fresh_key("UDV"), "Dev Update Forbidden")
        r = client.patch(
            f"/projects/{proj['id']}",
            json={"name": "Hacked Name"},
            headers=auth_header(_dev_tok()),
        )
        assert r.status_code == 403

    def test_tester_cannot_update_project_403(self) -> None:
        proj = _create_project(_fresh_key("UTVST"), "Tester Update Forbidden")
        r = client.patch(
            f"/projects/{proj['id']}",
            json={"name": "Hacked"},
            headers=auth_header(_tester_tok()),
        )
        assert r.status_code == 403

    def test_admin_can_deactivate_project(self) -> None:
        proj = _create_project(_fresh_key("DEAC"), "Deactivate Test")
        r = client.patch(
            f"/projects/{proj['id']}/deactivate",
            headers=auth_header(_admin_tok()),
        )
        assert r.status_code == 200
        assert r.json()["status"] == "INACTIVE"

    def test_cannot_deactivate_already_inactive_400(self) -> None:
        proj = _create_project(_fresh_key("DIAC"), "Already Inactive Test")
        client.patch(f"/projects/{proj['id']}/deactivate", headers=auth_header(_admin_tok()))
        r = client.patch(f"/projects/{proj['id']}/deactivate", headers=auth_header(_admin_tok()))
        assert r.status_code == 400

    def test_developer_cannot_deactivate_403(self) -> None:
        proj = _create_project(_fresh_key("DVDC"), "Dev Deactivate Forbidden")
        r = client.patch(f"/projects/{proj['id']}/deactivate", headers=auth_header(_dev_tok()))
        assert r.status_code == 403

    def test_tester_cannot_deactivate_403(self) -> None:
        proj = _create_project(_fresh_key("TSDC"), "Tester Deactivate Forbidden")
        r = client.patch(f"/projects/{proj['id']}/deactivate", headers=auth_header(_tester_tok()))
        assert r.status_code == 403
