"""
Alembic migration environment.

Configured for:
  - psycopg3 async driver (postgresql+psycopg)
  - SelectorEventLoop — required on Windows with Python 3.14
  - Autogeneration from app models
  - DATABASE_URL loaded from application settings (no hardcoded credentials)
"""

import asyncio
import selectors
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: F401 — kept for reference

# ---------------------------------------------------------------------------
# Load application settings (DATABASE_URL lives here)
# ---------------------------------------------------------------------------
from app.core.config import settings

# ---------------------------------------------------------------------------
# Load all models so their tables are registered on Base.metadata.
# This must happen before target_metadata is set.
# ---------------------------------------------------------------------------
from app.database.base import Base  # noqa: F401 — registers models via side-effects
import app.models  # noqa: F401 — explicit re-import for safety

# ---------------------------------------------------------------------------
# Alembic Config object (gives access to alembic.ini values)
# ---------------------------------------------------------------------------
config = context.config

# NOTE: We do NOT set sqlalchemy.url via config.set_main_option because
# the URL contains percent-encoded characters (%40) that confuse configparser.
# Instead, the DATABASE_URL is passed directly to the engine in
# run_async_migrations() below.

# Interpret logging config from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Metadata containing all registered table definitions
target_metadata = Base.metadata


# ---------------------------------------------------------------------------
# Offline migrations (no live DB connection)
# ---------------------------------------------------------------------------
def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    Configures the context with just a URL — useful for generating
    SQL scripts without a live database connection.
    """
    context.configure(
        url=str(settings.sqlalchemy_url),   # safe URL via URL.create()
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


# ---------------------------------------------------------------------------
# Online migrations (live async DB connection)
# ---------------------------------------------------------------------------
def do_run_migrations(connection):  # type: ignore[no-untyped-def]
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Use the shared async engine (already constructed with a valid URL)."""
    from app.database.connection import engine as connectable

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    # Do NOT dispose the shared engine — it is reused by the application.


def run_migrations_online() -> None:
    """Run migrations using a SelectorEventLoop (required on Windows + Python 3.14)."""
    if sys.platform == "win32":
        loop = asyncio.SelectorEventLoop(selectors.SelectSelector())
        loop.run_until_complete(run_async_migrations())
        loop.close()
    else:
        asyncio.run(run_async_migrations())


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
