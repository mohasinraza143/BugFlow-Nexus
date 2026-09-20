"""
Async SQLAlchemy engine.

Driver: psycopg (psycopg3) — required for Python 3.14 on Windows.
asyncpg has a known incompatibility with Python 3.14's ProactorEventLoop.

Python 3.14 on Windows defaults to ProactorEventLoop, which is
incompatible with psycopg async. We override the event loop policy to
use SelectorEventLoop before the engine is created.

This module is imported at application startup, so the policy is set
before any async operation runs.

URL construction:
  settings.sqlalchemy_url uses URL.create() so credentials are passed
  as plain Python strings — no percent-encoding issues with passwords
  containing @ characters.
"""

import sys

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.core.config import settings

# --------------------------------------------------------------------------- #
# Force SelectorEventLoop on Windows (Python 3.14 compat)                     #
# ProactorEventLoop (Windows default) is incompatible with psycopg async.     #
# --------------------------------------------------------------------------- #
if sys.platform == "win32":
    import asyncio
    asyncio.set_event_loop_policy(
        asyncio.WindowsSelectorEventLoopPolicy()  # type: ignore[attr-defined]
    )

engine: AsyncEngine = create_async_engine(
    settings.sqlalchemy_url,       # URL built via URL.create() — no parsing issues
    echo=settings.DEBUG,           # Log SQL statements in development
    pool_pre_ping=True,            # Verify connections before use
    pool_size=20,
    max_overflow=10,
)
