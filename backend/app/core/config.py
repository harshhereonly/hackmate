"""Application settings loaded from environment variables (and `backend/.env`)."""

from __future__ import annotations

import logging
import secrets
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BeforeValidator, Field, PrivateAttr, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

logger = logging.getLogger(__name__)


def _split_csv(value: object) -> object:
    """Accept comma-separated strings (the natural .env format) for list settings."""
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return value


CsvList = Annotated[list[str], NoDecode, BeforeValidator(_split_csv)]

# backend/ — .env and relative file paths resolve here, whatever the working directory.
BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
        # "JWT_SECRET=" (empty) means "not set", never an empty signing key.
        env_ignore_empty=True,
    )

    # --- General ---
    environment: Literal["development", "test", "production"] = "development"
    app_name: str = "HackMate API"
    app_version: str = "1.0.0"
    log_level: str = "INFO"
    enable_docs: bool | None = None  # defaults to True outside production

    # --- Database ---
    mongodb_uri: SecretStr | None = None
    mongodb_db_name: str = "hackmate"
    mongodb_timeout_ms: int = Field(default=5000, ge=500, le=60000)
    # Development-only in-memory MongoDB emulation (mongomock). Never in production.
    use_in_memory_db: bool = False
    in_memory_db_snapshot: str | None = ".local-db.json"
    # Development only: load the labelled demo dataset at startup when it is missing.
    seed_demo_data_on_startup: bool = False
    seed_demo_password: SecretStr | None = None

    # --- Sessions / auth ---
    jwt_secret: SecretStr | None = None
    jwt_algorithm: Literal["HS256", "HS384", "HS512"] = "HS256"
    session_ttl_hours: int = Field(default=168, ge=1, le=720)
    session_cookie_name: str = "hackmate_session"
    csrf_cookie_name: str = "hackmate_csrf"
    csrf_header_name: str = "X-CSRF-Token"
    cookie_secure: bool | None = None  # defaults to True in production
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    cookie_domain: str | None = None
    require_email_verification: bool = False
    email_verification_ttl_hours: int = Field(default=48, ge=1, le=336)
    password_reset_ttl_minutes: int = Field(default=30, ge=5, le=1440)

    # --- CORS / links ---
    cors_origins: CsvList = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    frontend_url: str = "http://localhost:5173"

    # --- Email (SMTP). Leave SMTP_HOST empty to disable delivery. ---
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_from: str | None = None
    smtp_starttls: bool = True
    smtp_ssl: bool = False
    smtp_timeout_seconds: float = 10.0

    # --- Rate limiting ---
    rate_limit_enabled: bool = True

    # --- Opportunity providers ---
    external_providers_enabled: bool = True
    contact_email: str | None = None  # sent to OpenAlex/Crossref "polite pool"
    openalex_api_key: SecretStr | None = None
    github_token: SecretStr | None = None
    hackathon_feed_urls: CsvList = []
    provider_timeout_seconds: float = Field(default=8.0, ge=1, le=30)
    provider_cache_ttl_seconds: int = Field(default=600, ge=0, le=86400)

    # --- Uploads ---
    max_avatar_upload_bytes: int = Field(default=3_000_000, ge=10_000, le=10_000_000)

    # Set by the validator when no JWT secret was configured outside production.
    _jwt_secret_is_ephemeral: bool = PrivateAttr(default=False)

    @field_validator("cors_origins")
    @classmethod
    def _strip_trailing_slashes(cls, value: list[str]) -> list[str]:
        return [origin.rstrip("/") for origin in value]

    @field_validator("jwt_secret", "mongodb_uri", "smtp_password", "openalex_api_key", "github_token",
                     "seed_demo_password", mode="before")
    @classmethod
    def _blank_secret_is_unset(cls, value: object) -> object:
        # Also covers values passed directly (not via the environment).
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("frontend_url")
    @classmethod
    def _strip_frontend_slash(cls, value: str) -> str:
        return value.rstrip("/")

    @field_validator("in_memory_db_snapshot")
    @classmethod
    def _anchor_snapshot(cls, value: str | None) -> str | None:
        if not value:
            return None
        path = Path(value)
        return str(path if path.is_absolute() else BACKEND_DIR / path)

    @model_validator(mode="after")
    def _validate_security(self) -> "Settings":
        if self.is_production:
            problems: list[str] = []
            if self.use_in_memory_db:
                problems.append("USE_IN_MEMORY_DB must be false in production")
            if self.seed_demo_data_on_startup or self.seed_demo_password:
                problems.append("SEED_DEMO_DATA_ON_STARTUP and SEED_DEMO_PASSWORD are development-only")
            if not self.mongodb_uri:
                problems.append("MONGODB_URI is required in production")
            if not self.jwt_secret or len(self.jwt_secret.get_secret_value()) < 32:
                problems.append("JWT_SECRET must be set to at least 32 random characters")
            if self.cookie_secure is False:
                problems.append("COOKIE_SECURE cannot be false in production")
            if any(origin == "*" for origin in self.cors_origins):
                problems.append("CORS_ORIGINS cannot contain '*' when credentials are used")
            if self.require_email_verification and not self.email_enabled:
                problems.append("REQUIRE_EMAIL_VERIFICATION needs SMTP_HOST and SMTP_FROM, or nobody could sign in")
            if problems:
                raise ValueError("Insecure production configuration: " + "; ".join(problems))
        elif not self.jwt_secret:
            # Development/test convenience only: sessions reset on every restart.
            self.jwt_secret = SecretStr(secrets.token_urlsafe(48))
            self._jwt_secret_is_ephemeral = True

        if self.cookie_samesite == "none" and not self.secure_cookies:
            raise ValueError("COOKIE_SAMESITE=none requires COOKIE_SECURE=true (browsers reject it otherwise)")
        return self

    # --- Derived values ---
    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def secure_cookies(self) -> bool:
        if self.cookie_secure is None:
            return self.is_production
        return self.cookie_secure

    @property
    def docs_enabled(self) -> bool:
        if self.enable_docs is None:
            return not self.is_production
        return self.enable_docs

    @property
    def email_enabled(self) -> bool:
        return bool(self.smtp_host and self.smtp_from)

    @property
    def jwt_key(self) -> str:
        assert self.jwt_secret is not None
        return self.jwt_secret.get_secret_value()

    @property
    def jwt_secret_is_ephemeral(self) -> bool:
        return self._jwt_secret_is_ephemeral


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.jwt_secret_is_ephemeral:
        logger.warning(
            "JWT_SECRET is not set; using an ephemeral development secret. "
            "All sessions will be invalidated when the server restarts."
        )
    return settings
