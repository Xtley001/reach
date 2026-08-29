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
        "api-key":      settings.BREVO_API_KEY,
    }


def _otp_html(otp: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>REACH Sign-In Code</title>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; line-height: 1.6; color: #1A1A1A; background: #F5F5F5; }}
    table {{ border-collapse: collapse; width: 100%; }}
    .container {{ max-width: 480px; margin: 40px auto; background: #FFFFFF; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }}
    .header {{ background: #1A1A1A; padding: 32px 24px; text-align: center; }}
    .header-text {{ font-size: 20px; font-weight: 700; color: #FFFFFF; letter-spacing: 3px; }}
    .header-subtext {{ font-size: 12px; color: #CCCCCC; margin-top: 4px; letter-spacing: 1px; }}
    .content {{ padding: 32px 24px; }}
    .greeting {{ font-size: 16px; font-weight: 600; color: #1A1A1A; margin-bottom: 12px; }}
    .message {{ font-size: 13px; color: #666666; margin-bottom: 24px; line-height: 1.5; }}
    .code-section {{ text-align: center; margin: 32px 0; }}
    .code-label {{ font-size: 11px; color: #999999; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; font-weight: 600; }}
    .code-box {{ background: #F5F5F5; border: 2px solid #333333; border-radius: 6px; padding: 24px; margin: 12px 0; }}
    .code-value {{ font-size: 48px; font-weight: 800; color: #333333; letter-spacing: 8px; font-family: 'Courier New', monospace; word-spacing: 12px; }}
    .info-box {{ background: #F5F5F5; border-left: 4px solid #333333; border-radius: 4px; padding: 16px; margin: 24px 0; }}
    .info-title {{ font-size: 13px; font-weight: 600; color: #333333; margin-bottom: 6px; }}
    .info-text {{ font-size: 12px; color: #666666; margin: 0; }}
    .footer {{ background: #F5F5F5; border-top: 1px solid #DDDDDD; padding: 24px; text-align: center; }}
    .footer-text {{ font-size: 11px; color: #999999; margin: 6px 0; }}
    .divider {{ height: 1px; background: #EEEEEE; margin: 24px 0; }}
    a {{ color: #333333; text-decoration: none; }}
    a:hover {{ text-decoration: underline; }}
  </style>
</head>
<body>
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #F5F5F5;">
    <tr>
      <td align="center" style="padding: 20px 8px;">
        <table class="container" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td class="header">
              <div class="header-text">REACH</div>
              <div class="header-subtext">Ministry Outreach Platform</div>
            </td>
          </tr>
          <tr>
            <td class="content">
              <h1 class="greeting">Welcome Back</h1>
              <p class="message">
                Your 6-digit sign-in code is ready. Enter it below to access your REACH account. This code expires in 10 minutes.
              </p>
              <div class="divider"></div>
              <div class="code-section">
                <div class="code-label">🔐 Your Code</div>
                <div class="code-box">
                  <div class="code-value">{otp}</div>
                </div>
              </div>
              <div class="divider"></div>
              <div class="info-box">
                <div class="info-title">Didn't request this code?</div>
                <div class="info-text">
                  If you didn't initiate this sign-in, you can safely ignore this email. Your account is secure.
                </div>
              </div>
            </td>
          </tr>
          <tr>
            <td class="footer">
              <p class="footer-text"><strong>REACH</strong></p>
              <p class="footer-text">Ministry Outreach Platform</p>
              <p class="footer-text" style="font-size: 10px; margin-top: 12px; color: #BBBBBB;">
                This is an automated message. Please do not reply.<br>
                © 2026 REACH. All rights reserved.
              </p>
</body>
</html>"""


async def send_otp(to: str, otp: str) -> bool:
    """
    Send an OTP sign-in code to `to` via Brevo HTTP API.
    Returns True on success, False on any failure.
    Logs the full Brevo error response on failure for easy debugging.
    """
    api_key = settings.BREVO_API_KEY
    sender  = settings.BREVO_SENDER

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
    api_key = settings.BREVO_API_KEY
    sender  = settings.BREVO_SENDER

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
