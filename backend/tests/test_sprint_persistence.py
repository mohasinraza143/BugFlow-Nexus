import asyncio
import selectors
import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.orm import selectinload

from app.database.connection import engine
from app.models.sprint import Sprint, SprintStatus
from tests.conftest import (
    admin_token, tester3_token, auth_header, _CLIENT, _ci_email
)


def _run_sync(coro):
    loop = asyncio.SelectorEventLoop(selectors.SelectSelector())
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def test_sprint_database_persistence_end_to_end():
    """
    Verify sprint database persistence end-to-end against PostgreSQL:
    1. POST /sprints executes INSERT and commits the record to PostgreSQL.
    2. Confirm all required fields: id, name, goal, start_date, end_date, project_id, status, assigned_tester_id.
    3. Direct PostgreSQL query confirms the row is physically committed.
    4. POST /sprints/{id}/assign-tester updates assigned_tester_id and status in PostgreSQL.
    5. GET /sprints/project/{project_id} retrieves the sprint from PostgreSQL (page refresh).
    6. GET /sprints/assigned retrieves the sprint from PostgreSQL for the assigned tester.
    7. Raw DB verification with a new independent AsyncSession confirms persistence.
    """
    admin_headers = auth_header(admin_token())
    tester_headers = auth_header(tester3_token())

    # Step A: Ensure test project exists
    proj_key = "SPP" + uuid.uuid4().hex[:6].upper()
    r_proj = _CLIENT.post(
        "/projects",
        json={"name": "Sprint Persist Project", "project_key": proj_key, "is_active": True},
        headers=admin_headers,
    )
    assert r_proj.status_code in (200, 201), r_proj.text
    project_id = r_proj.json()["id"]

    # Get tester user ID
    r_users = _CLIENT.get(
        "/users", params={"role": "TESTER", "page_size": 100}, headers=admin_headers
    )
    assert r_users.status_code == 200
    target_email = _ci_email("tester3")
    tester_id = None
    for u in r_users.json().get("items", []):
        if u["email"] == target_email:
            tester_id = u["id"]
            break
    assert tester_id is not None, "tester3 user not found"

    # Step B: Create sprint via POST /sprints
    sprint_name = f"Persist_Sprint_{uuid.uuid4().hex[:6]}"
    goal_text = "Verify database persistence end-to-end"
    start_dt = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    end_dt = (datetime.now(timezone.utc) + timedelta(days=15)).isoformat()

    payload = {
        "name": sprint_name,
        "goal": goal_text,
        "start_date": start_dt,
        "end_date": end_dt,
        "project_id": project_id,
        "estimated_team_members": 4,
        "working_days": 10,
        "hours_per_day": 8,
    }
    create_resp = _CLIENT.post("/sprints", json=payload, headers=admin_headers)
    assert create_resp.status_code == 201, f"Create sprint failed: {create_resp.text}"
    sprint_data = create_resp.json()
    sprint_id = sprint_data["id"]

    # Confirm created sprint fields
    assert sprint_data["id"] is not None
    assert sprint_data["name"] == sprint_name
    assert sprint_data["goal"] == goal_text
    assert sprint_data["start_date"] is not None
    assert sprint_data["end_date"] is not None
    assert sprint_data["project_id"] == project_id
    assert sprint_data["status"] == "PLANNED"
    assert sprint_data["assigned_tester_id"] is None

    # Step C: Assign tester -> updates assigned_tester_id and status to ACTIVE
    assign_resp = _CLIENT.post(
        f"/sprints/{sprint_id}/assign-tester",
        json={"tester_id": tester_id},
        headers=admin_headers,
    )
    assert assign_resp.status_code == 200, f"Assign tester failed: {assign_resp.text}"
    assigned_data = assign_resp.json()
    assert assigned_data["assigned_tester_id"] == tester_id
    assert assigned_data["status"] == "ACTIVE"

    # Step D: Confirm GET /sprints/project/{project_id} retrieves it from PostgreSQL
    list_resp = _CLIENT.get(f"/sprints/project/{project_id}", headers=admin_headers)
    assert list_resp.status_code == 200
    sprints = list_resp.json()
    found = next((s for s in sprints if s["id"] == sprint_id), None)
    assert found is not None, "Sprint not found in project sprint list after reload"
    assert found["name"] == sprint_name
    assert found["goal"] == goal_text
    assert found["project_id"] == project_id
    assert found["status"] == "ACTIVE"
    assert found["assigned_tester_id"] == tester_id

    # Step E: Confirm GET /sprints/assigned retrieves it for the assigned tester
    assigned_list_resp = _CLIENT.get("/sprints/assigned", headers=tester_headers)
    assert assigned_list_resp.status_code == 200
    tester_sprints = assigned_list_resp.json()
    tester_found = next((s for s in tester_sprints if s["id"] == sprint_id), None)
    assert tester_found is not None, "Sprint not found in tester's assigned sprints list"
    assert tester_found["id"] == sprint_id

    # Step F: Direct raw SQL query to PostgreSQL (verifying physical commit and persistence)
    async def _verify_raw_postgresql():
        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        async with session_factory() as session:
            res = await session.execute(
                text("""
                    SELECT id, name, goal, start_date, end_date, project_id, status, assigned_tester_id
                    FROM sprints
                    WHERE id = :id
                """),
                {"id": sprint_id},
            )
            row = res.fetchone()
            assert row is not None, f"Sprint {sprint_id} not found in PostgreSQL!"
            assert row[0] == sprint_id
            assert row[1] == sprint_name
            assert row[2] == goal_text
            assert row[5] == project_id
            assert row[6] == "ACTIVE"
            assert row[7] == tester_id

    _run_sync(_verify_raw_postgresql())
