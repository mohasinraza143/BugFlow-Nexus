"""
Health check router.

Keeps health-related endpoints separated from main.py.
No business logic lives here.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db


class HealthResponse(BaseModel):
    status: str
    service: str
    database: str


router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse, summary="Health check")
async def health_check(db: AsyncSession = Depends(get_db)) -> HealthResponse:
    """Return API and PostgreSQL connectivity status."""
    await db.execute(text("SELECT 1"))
    return HealthResponse(status="healthy", service="BugFlow-Nexus API", database="postgresql")
