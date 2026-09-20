"""
Phase-1 tests: root endpoint and health check.

Uses FastAPI's TestClient via httpx.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class TestRootEndpoint:
    def test_root_returns_200(self) -> None:
        response = client.get("/")
        assert response.status_code == 200

    def test_root_returns_correct_message(self) -> None:
        response = client.get("/")
        data = response.json()
        assert data == {"message": "BugTracker API is running"}


class TestHealthEndpoint:
    def test_health_returns_200(self) -> None:
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_returns_correct_body(self) -> None:
        response = client.get("/health")
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "BugTracker API"

    def test_health_response_has_required_keys(self) -> None:
        response = client.get("/health")
        data = response.json()
        assert "status" in data
        assert "service" in data
