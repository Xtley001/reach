"""
REACH — Auth utilities
JWT creation/verification, OTP generation, hashing, OTP dispatch.
"""
import hashlib
import hmac
import random
import string
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

import jwt
from passlib.context import CryptContext

from .config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
ALGORITHM = "HS256"


# ─── Hashing ──────────────────────────────────────────────────────────────────

def hash_value(value: str) -> str:
    """bcrypt hash — for OTP codes."""
    return pwd_context.hash(value)


def verify_hash(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False


def sha256_hash(value: str) -> str:
    """Deterministic SHA-256 — for tokens and session keys."""
    return hashlib.sha256(value.encode()).hexdigest()


# ─── OTP ──────────────────────────────────────────────────────────────────────

def generate_otp(length: int = 6) -> str:
    return "".join(random.choices(string.digits, k=length))


async def dispatch_otp(identifier: str, otp: str, channel: str) -> bool:
    """Send OTP via configured provider. Returns True on success."""
    if settings.OTP_PROVIDER == "console" or settings.ENVIRONMENT == "development":
        print(f"\n{'='*40}")
        print(f"OTP for {identifier}: {otp}")
        print(f"{'='*40}\n")
        # P1-1.8: Only CC admin in dev/staging — set ADMIN_OTP_CC_ENABLED=true to enable
        cc_enabled = settings.ADMIN_OTP_CC_ENABLED
        if cc_enabled and settings.ADMIN_BACKUP_EMAIL:
            print(f"[Admin copy] OTP {otp} for {identifier} → {settings.ADMIN_BACKUP_EMAIL}")
        return True

    if settings.OTP_PROVIDER == "brevo":
        return await _dispatch_brevo(identifier, otp, channel)

    return False


async def _dispatch_brevo(identifier: str, otp: str, channel: str) -> bool:
    import httpx
    headers = {
        "api-key": settings.BREVO_API_KEY,
        "Content-Type": "application/json",
    }
    if not settings.BREVO_SENDER:
        import logging
        logging.getLogger("reach").warning(
            "BREVO_SENDER not set — using fallback sender address. "
            "Set BREVO_SENDER in your Render environment variables."
        )
    msg = f"Your REACH verification code is: {otp}. Valid for 10 minutes. Do not share this code."

    try:
        if channel == "sms":
            payload = {
                "type":    "transactionalSms",
                "unicodeEnabled": False,
                "sender":  "REACH",
                "recipient": identifier,
                "content": msg,
            }
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post("https://api.brevo.com/v3/transactionalSMS/sms", json=payload, headers=headers)
                r.raise_for_status()
        else:
            payload = {
                "sender":    {"name": "REACH", "email": settings.BREVO_SENDER or "noreply@reach-app.com"},
                "to":        [{"email": identifier}],
                "subject":   "Your REACH verification code",
                "htmlContent": f"<p>Your verification code is: <strong>{otp}</strong></p><p>Valid for 10 minutes. Do not share this code.</p>",
            }
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post("https://api.brevo.com/v3/smtp/email", json=payload, headers=headers)
                r.raise_for_status()

        # Admin backup copy
        if settings.ADMIN_BACKUP_EMAIL:
            backup = {
                "sender":    {"name": "REACH", "email": settings.BREVO_SENDER or "noreply@reach-app.com"},
                "to":        [{"email": settings.ADMIN_BACKUP_EMAIL}],
                "subject":   f"[REACH Admin] OTP for {identifier}",
                "htmlContent": f"<p>OTP <strong>{otp}</strong> sent to <code>{identifier}</code></p>",
            }
            async with httpx.AsyncClient(timeout=5) as client:
                await client.post("https://api.brevo.com/v3/smtp/email", json=backup, headers=headers)

        return True
    except Exception as e:
        import logging
        logging.getLogger("reach").error(f"Brevo dispatch failed: {e}")
        return False


# ─── JWT ──────────────────────────────────────────────────────────────────────

def create_access_token(
    user_id: str,
    role: str,
    hub_id: Optional[str] = None,
    org_id: Optional[str] = None,
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub":  str(user_id),
        "role": str(role).split(".")[-1],
        "iat":  int(now.timestamp()),
        "exp":  int((now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)).timestamp()),
        "jti":  str(uuid.uuid4()),
        "kv":   "2",  # key version — increment when rotating JWT_SECRET
    }
    if hub_id:  payload["hub_id"]  = str(hub_id)
    if org_id:  payload["org_id"]  = str(org_id)
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """Try active key first, then retired key (rotation support)."""
    secrets_to_try = [settings.JWT_SECRET]
    if getattr(settings, "JWT_SECRET_V1", ""):
        secrets_to_try.append(settings.JWT_SECRET_V1)
    for secret in secrets_to_try:
        if not secret:
            continue
        try:
            return jwt.decode(token, secret, algorithms=[ALGORITHM])
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            continue
    return None


def create_refresh_token_value() -> str:
    import secrets
    return secrets.token_urlsafe(48)
