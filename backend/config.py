"""
REACH — Configuration
"""
import os
from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="allow")

    DATABASE_URL: str = ""
    JWT_SECRET: str = "change-me-in-production-use-openssl-rand-hex-64"
    # Rotation: set JWT_SECRET_V1 to the old key when rotating.
    # V1 is verify-only (never signs). Leave blank when not rotating.
    JWT_SECRET_V1: str = ""
    ENVIRONMENT: str = "development"
    ALLOWED_ORIGINS: str = "http://localhost:5173"

    # OTP
    OTP_PROVIDER: str = "console"  # "console" | "brevo"
    BREVO_API_KEY: str = ""
    BREVO_SENDER: str = ""
    ADMIN_BACKUP_EMAIL: str = ""

    # Tokens
    # G-87: bumped 60 -> 120 as a belt-and-suspenders measure on top of the
    # refresh-and-retry interceptor (see frontend lib/api.js). Not a substitute
    # for the interceptor — just reduces how often the refresh dance runs
    # during a long call session.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # E-60: DB pool tuning for post-service traffic bursts. See database.py.
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_TIMEOUT_SECONDS: int = 10

    # I-94: Cloudinary settings kept for now as a fallback / rollback path —
    # storage.py prefers Supabase Storage when SUPABASE_URL is set (see I.1
    # in UPDATE-02.md: the app already runs on Supabase Postgres, so Storage
    # is the same project, no new vendor, no new API key to leak).
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""

    # I-93/94/95: Supabase Storage — same project as DATABASE_URL, replaces
    # Cloudinary for the one thing it was used for (400x400 avatar images).
    # SUPABASE_URL is the project's REST endpoint, e.g.
    # https://xxxxx.supabase.co — NOT the Postgres connection string.
    # SUPABASE_SERVICE_ROLE_KEY must be the service_role key (not anon) since
    # uploads happen server-side and bypass Storage RLS policies by design.
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_AVATARS_BUCKET: str = "avatars"

    # Redis
    REDIS_URL: str = ""

    # Optional
    SENTRY_DSN: str = ""
    FRONTEND_URL: str = ""
    ADMIN_OTP_CC_ENABLED: bool = False
    SESSION_INACTIVITY_HOURS: int = 168  # 7 days

    @property
    def allowed_origins_list(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def brevo_api_key(self) -> str:
        return self.BREVO_API_KEY

    @property
    def brevo_sender(self) -> str:
        return self.BREVO_SENDER


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
