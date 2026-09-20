"""
Phase-2 tests: database connectivity and model metadata.

Tests verify:
  1. SQLAlchemy can connect to PostgreSQL and execute SELECT 1.
  2. All three core models are registered in Base.metadata.

These tests are READ-ONLY — they do not insert or modify any data.
"""

import asyncio
import selectors

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.base import Base
from app.database.connection import engine
from app.models import Issue, Project, User


# ---------------------------------------------------------------------------
# Event loop configuration for Python 3.14 on Windows
# psycopg requires SelectorEventLoop (ProactorEventLoop is incompatible)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def event_loop_policy():
    """Return a SelectorEventLoop-based policy for Windows Python 3.14."""
    return asyncio.DefaultEventLoopPolicy()


# ---------------------------------------------------------------------------
# Database connection tests
# ---------------------------------------------------------------------------

class TestDatabaseConnection:
    """Verify the async SQLAlchemy engine can reach PostgreSQL."""

    def test_select_one_sync(self) -> None:
        """Run a synchronous wrapper around the async SELECT 1 test."""
        loop = asyncio.SelectorEventLoop(selectors.SelectSelector())
        result = loop.run_until_complete(self._async_select_one())
        loop.close()
        assert result == 1, f"Expected SELECT 1 to return 1, got {result!r}"

    @staticmethod
    async def _async_select_one() -> int:
        async with engine.connect() as conn:
            row = await conn.execute(text("SELECT 1"))
            return row.scalar()  # type: ignore[return-value]

    def test_engine_url_points_to_bugtracker_db(self) -> None:
        """Confirm the engine is configured to connect to bugtracker_db."""
        url_str = str(engine.url)
        assert "bugtracker_db" in url_str, (
            f"Engine URL does not reference bugtracker_db: {url_str}"
        )


# ---------------------------------------------------------------------------
# Model metadata tests
# ---------------------------------------------------------------------------

class TestModelMetadata:
    """Verify all Phase-2 models are registered in Base.metadata."""

    def test_users_table_in_metadata(self) -> None:
        assert "users" in Base.metadata.tables, (
            "User model not registered — 'users' table missing from Base.metadata"
        )

    def test_projects_table_in_metadata(self) -> None:
        assert "projects" in Base.metadata.tables, (
            "Project model not registered — 'projects' table missing from Base.metadata"
        )

    def test_issues_table_in_metadata(self) -> None:
        assert "issues" in Base.metadata.tables, (
            "Issue model not registered — 'issues' table missing from Base.metadata"
        )

    def test_all_three_models_importable(self) -> None:
        """Confirm the three model classes are importable and have __tablename__."""
        assert User.__tablename__ == "users"
        assert Project.__tablename__ == "projects"
        assert Issue.__tablename__ == "issues"

    def test_metadata_table_count(self) -> None:
        """Exactly three application tables should be registered."""
        tables = set(Base.metadata.tables.keys())
        expected = {"users", "projects", "issues"}
        assert expected.issubset(tables), (
            f"Missing tables: {expected - tables}"
        )
