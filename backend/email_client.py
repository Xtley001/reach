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
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>REACH Sign-In Code</title>
  <style>
    body {{ margin: 0; padding: 0; background-color: #F7F5F2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Inter', sans-serif; line-height: 1.6; color: #1A1917; }}
    table {{ border-collapse: collapse; }}
    .container {{ width: 100%; max-width: 600px; margin: 0 auto; background-color: #FFFFFF; }}
    .header {{ background: linear-gradient(135deg, #2D5A3D 0%, #1A3A24 100%); padding: 40px 32px; text-align: center; }}
    .logo {{ font-size: 18px; font-weight: 700; color: #FFFFFF; letter-spacing: 2px; margin-bottom: 8px; }}
    .tagline {{ font-size: 12px; color: #A8D5B8; text-transform: uppercase; letter-spacing: 1px; }}
    .content {{ padding: 48px 32px; }}
    .greeting {{ font-size: 16px; color: #1A1917; margin-bottom: 24px; }}
    .code-section {{ text-align: center; margin: 32px 0; }}
    .code-label {{ font-size: 12px; color: #9C9790; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 16px; }}
    .code-box {{ background: linear-gradient(135deg, #F0EBE4 0%, #E8E3DB 100%); border: 2px solid #2D5A3D; border-radius: 12px; padding: 24px; margin: 16px 0; }}
    .code-value {{ font-size: 48px; font-weight: 700; color: #2D5A3D; letter-spacing: 8px; font-family: 'Monaco', 'Courier New', monospace; word-spacing: 12px; }}
    .info {{ background-color: #F7F5F2; border-left: 4px solid #2D5A3D; padding: 16px; border-radius: 4px; margin: 24px 0; }}
    .info-text {{ font-size: 13px; color: #5C5954; margin: 0; }}
    .footer {{ background-color: #FAFAF8; border-top: 1px solid #E8E3DB; padding: 24px 32px; text-align: center; }}
    .footer-text {{ font-size: 11px; color: #9C9790; margin: 0; }}
    .security-note {{ font-size: 12px; color: #7C7870; margin-top: 16px; font-style: italic; }}
    a {{ color: #2D5A3D; text-decoration: none; }}
    a:hover {{ text-decoration: underline; }}
  </style>
</head>
<body>
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table class="container" width="100%" cellpadding="0" cellspacing="0">
          <!-- Header -->
          <tr>
            <td class="header">
              <div class="logo">REACH</div>
              <div class="tagline">Ministry Outreach Platform</div>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td class="content">
              <p class="greeting">Hello,</p>
              
              <p style="font-size: 14px; color: #5C5954; margin-bottom: 24px;">
                Your sign-in request was received. Use the code below to access your REACH account:
              </p>

              <!-- Code Section -->
              <div class="code-section">
                <div class="code-label">Your Sign-In Code</div>
                <div class="code-box">
                  <div class="code-value">{otp}</div>
                </div>
              </div>

              <!-- Information Box -->
              <div class="info">
                <p class="info-text">
                  <strong>⏱️ Code expires in 10 minutes</strong><br>
                  This code is only valid for a single sign-in attempt.
                </p>
              </div>

              <p style="font-size: 13px; color: #5C5954; margin-top: 24px;">
                <strong>Didn't request this code?</strong><br>
                If you didn't initiate a sign-in request, you can safely ignore this email. Your account remains secure.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="footer">
              <p class="footer-text">
                © 2026 REACH · Ministry Outreach Platform<br>
                <a href="https://reach-livid.vercel.app">Visit our website</a>
              </p>
              <p class="security-note">
                This is an automated message. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
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
