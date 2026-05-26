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
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Cloudinary
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""

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


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
