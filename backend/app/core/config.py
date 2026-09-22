"""
Application configuration using pydantic-settings.
Loads settings from environment variables and .env file.
All secrets (JWT key, SMTP password, DB password) live ONLY in backend/.env
which is git-ignored.

DATABASE_URL construction note:
  The password contains @ which must NOT be URL-encoded in .env when read
  as a plain string (pydantic-settings would decode %40→@ and then
  SQLAlchemy re-parses it incorrectly). Instead we store credentials
  individually and build the SQLAlchemy URL via URL.create().
"""

from functools import cached_property

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL, make_url


class Settings(BaseSettings):
    """Application settings.

    Phase roadmap:
      Phase 1 — APP_NAME, APP_ENV, DEBUG, API_V1_PREFIX
      Phase 2 — DATABASE_URL or individual DB_* settings
      Phase 3 — JWT_*, OTP_*, SMTP_*
      Phase 4 — (no new config needed)
    """

    # ------------------------------------------------------------------ #
    # Application                                                          #
    # ------------------------------------------------------------------ #
    APP_NAME: str = "BugFlow-Nexus"
    APP_ENV: str = "development"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api"

    # ------------------------------------------------------------------ #
    # Database credentials — stored individually to avoid URL             #
    # percent-encoding issues with passwords containing @ characters.     #
    # ------------------------------------------------------------------ #
    DB_DRIVER: str = "postgresql+psycopg"
    DB_USER: str = "postgres"
    DB_PASSWORD: str = ""          # plain text — no URL encoding needed
    DB_HOST: str = "127.0.0.1"
    DB_PORT: int = 5432
    DB_NAME: str = "bugtracker_db"

    # Legacy fallback — kept for backwards compat but NOT used by the engine.
    # If only DATABASE_URL is set, the individual DB_* vars take precedence.
    DATABASE_URL: str = ""

    # Comma-separated browser origins for deployed frontend clients.
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # ------------------------------------------------------------------ #
    # JWT (Phase 3)                                                        #
    # ------------------------------------------------------------------ #
    JWT_SECRET_KEY: str = "CHANGE_ME_TO_A_LONG_RANDOM_SECRET"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # ------------------------------------------------------------------ #
    # OTP (Phase 3)                                                        #
    # ------------------------------------------------------------------ #
    OTP_EXPIRE_MINUTES: int = 5
    OTP_RESEND_COOLDOWN_SECONDS: int = 60
    OTP_MAX_ATTEMPTS: int = 5

    # ------------------------------------------------------------------ #
    # SMTP / Email (Phase 3)                                               #
    # ------------------------------------------------------------------ #
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = ""
    SMTP_FROM_NAME: str = "BugFlow-Nexus"
    SMTP_USE_TLS: bool = True

    # ------------------------------------------------------------------ #
    # File attachments (Phase 7)                                           #
    # ------------------------------------------------------------------ #
    ATTACHMENT_STORAGE_PATH: str = "storage/attachments"
    ATTACHMENT_MAX_SIZE_MB: int = 10
    ATTACHMENT_ALLOWED_MIME_TYPES: str = (
        "image/png,image/jpeg,image/webp,"
        "application/pdf,"
        "text/plain,text/csv"
    )

    @property
    def attachment_max_size_bytes(self) -> int:
        """Return maximum allowed attachment size in bytes."""
        return self.ATTACHMENT_MAX_SIZE_MB * 1024 * 1024

    @property
    def attachment_allowed_mime_set(self) -> frozenset[str]:
        """Return the set of allowed MIME types."""
        return frozenset(
            m.strip() for m in self.ATTACHMENT_ALLOWED_MIME_TYPES.split(",") if m.strip()
        )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    @model_validator(mode="after")
    def validate_production_settings(self) -> "Settings":
        """Reject development-only defaults when explicitly running production."""
        if self.APP_ENV.lower() in {"production", "prod"}:
            if self.DEBUG:
                raise ValueError("DEBUG must be false when APP_ENV=production")
            if self.JWT_SECRET_KEY == "CHANGE_ME_TO_A_LONG_RANDOM_SECRET":
                raise ValueError("JWT_SECRET_KEY must be set when APP_ENV=production")
        return self


    @cached_property
    def sqlalchemy_url(self) -> URL:
        """Build a SQLAlchemy URL safely, without parsing raw URL strings.

        Using URL.create() sidesteps all percent-encoding issues because
        credentials are passed as plain Python strings, not embedded in a URI.
        """
        if self.DATABASE_URL:
            url_str = self.DATABASE_URL
            if url_str.startswith("postgres://"):
                url_str = url_str.replace("postgres://", "postgresql+psycopg://", 1)
            elif url_str.startswith("postgresql://"):
                url_str = url_str.replace("postgresql://", "postgresql+psycopg://", 1)
            return make_url(url_str)

        return URL.create(
            drivername=self.DB_DRIVER,
            username=self.DB_USER,
            password=self.DB_PASSWORD,
            host=self.DB_HOST,
            port=self.DB_PORT,
            database=self.DB_NAME,
        )


# Single shared settings instance for the entire application
settings = Settings()
