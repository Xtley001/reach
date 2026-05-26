"""
backend/email_client.py
=======================
OTP email delivery via Brevo HTTP API.

Why HTTP and not SMTP
---------------------
Render's free tier blocks outbound port 587 (SMTP). The Brevo HTTP API
(api.brevo.com/v3/smtp/email) has no port restrictions and works on all
hosting providers. It uses the same API key as SMTP.

Required env vars (set in Render → Environment)
------------------------------------------------
BREVO_API_KEY  — API key from Brevo → Settings → API Keys (starts xkeysib-…)
                 If blank, falls back to SMTP_PASS (legacy name).
BREVO_SENDER   — Verified sender email set up in Brevo → Senders & IP → Senders.
                 If blank, falls back to SMTP_FROM (legacy name).

⚠  The sender email MUST be verified inside Brevo or the API returns 400.
   Use a domain sender (e.g. reach@yourdomain.com) not a Gmail address —
   Gmail rejects third-party senders and routes them to spam.
   If you don't own a domain yet, use ac509e001@smtp-brevo.com which is
   pre-verified by Brevo, but set a friendly reply-to of your Gmail.
"""
import httpx
import logging
from .config import settings

logger = logging.getLogger("reach.email")

_BREVO_URL = "https://api.brevo.com/v3/smtp/email"


def _headers() -> dict:
    return {
        "accept":       "application/json",
        "content-type": "application/json",
        "api-key":      settings.brevo_api_key,
    }


def _otp_html(otp: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F5F2;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F2;padding:48px 0">
    <tr><td align="center">
      <table width="440" cellpadding="0" cellspacing="0" style="max-width:440px;width:100%;padding:0 24px">
        <tr><td style="padding-bottom:32px">
          <span style="font-size:13px;font-weight:600;color:#1A1917;letter-spacing:0.25em;text-transform:uppercase">REACH</span>
        </td></tr>
        <tr><td style="padding-bottom:8px">
          <span style="font-size:11px;color:#9C9790;letter-spacing:0.12em;text-transform:uppercase">Your sign-in code</span>
        </td></tr>
        <tr><td style="padding-bottom:32px">
          <div style="display:inline-block;background:#EFEDE9;border-radius:8px;padding:20px 32px">
            <span style="font-size:48px;font-weight:700;color:#1A1917;letter-spacing:12px;font-variant-numeric:tabular-nums">{otp}</span>
          </div>
        </td></tr>
        <tr><td style="padding-bottom:8px">
          <span style="font-size:13px;color:#5C5954;line-height:1.7">
            This code expires in <strong>10 minutes</strong>.<br>
            If you did not request this, you can safely ignore this email.
          </span>
        </td></tr>
        <tr><td style="padding-top:32px;border-top:1px solid #D8D4CE">
          <span style="font-size:11px;color:#9C9790">REACH · Ministry Outreach Platform</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


async def send_otp(to: str, otp: str) -> bool:
    """
    Send an OTP sign-in code to `to` via Brevo HTTP API.
    Returns True on success, False on any failure.
    Logs the full Brevo error response on failure for easy debugging.
    """
    api_key = settings.brevo_api_key
    sender  = settings.brevo_sender

    if not api_key:
        logger.error(
            "BREVO_API_KEY is not set (also checked SMTP_PASS). "
            "Add it to Render → Environment and redeploy."
        )
        return False

    if not sender:
        logger.error(
            "BREVO_SENDER is not set (also checked SMTP_FROM). "
            "Add a verified sender email from Brevo → Senders & IP → Senders."
        )
        return False

    payload = {
        "sender":      {"name": "REACH", "email": sender},
        "to":          [{"email": to}],
        "subject":     f"Your REACH code: {otp}",
        "textContent": (
            f"Your REACH sign-in code: {otp}\n\n"
            f"Valid for 10 minutes.\n"
            f"If you did not request this, ignore this email."
        ),
        "htmlContent": _otp_html(otp),
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(_BREVO_URL, json=payload, headers=_headers())

        if resp.status_code in (200, 201):
            logger.info(f"OTP sent → {to}")
            return True

        logger.error(
            f"Brevo rejected OTP to {to} — "
            f"status={resp.status_code} body={resp.text[:400]}"
        )
        return False

    except httpx.TimeoutException:
        logger.error(f"Brevo request timed out sending OTP to {to}")
        return False
    except Exception as exc:
        logger.error(f"Unexpected error sending OTP to {to}: {exc}")
        return False


async def send_mirror(admin_email: str, otp: str, target: str) -> None:
    """
    Mirror every OTP to the admin inbox so delivery can be verified remotely.
    Failures are logged as warnings — never block the main OTP flow.
    """
    api_key = settings.brevo_api_key
    sender  = settings.brevo_sender

    if not api_key or not sender:
        logger.warning("Mirror skipped — Brevo not configured")
        return

    payload = {
        "sender":      {"name": "REACH OTP Mirror", "email": sender},
        "to":          [{"email": admin_email}],
        "subject":     f"[REACH OTP] {otp} → {target}",
        "textContent": f"Code: {otp}\nSent to: {target}\n\nValid 10 minutes.",
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(_BREVO_URL, json=payload, headers=_headers())
        if resp.status_code in (200, 201):
            logger.info(f"OTP mirror sent → {admin_email}")
        else:
            logger.warning(
                f"OTP mirror failed — status={resp.status_code} body={resp.text[:200]}"
            )
    except Exception as exc:
        logger.warning(f"OTP mirror error: {exc}")
