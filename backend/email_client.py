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
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ margin: 0; padding: 0; background: linear-gradient(135deg, #F5F3F0 0%, #EDE9E4 100%); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Inter', sans-serif; line-height: 1.6; color: #1A1917; }}
    table {{ border-collapse: collapse; width: 100%; }}
    .container {{ width: 100%; max-width: 580px; margin: 0 auto; background-color: #FFFFFF; box-shadow: 0 4px 20px rgba(45, 90, 61, 0.08); border-radius: 16px; overflow: hidden; }}
    .header {{ background: linear-gradient(135deg, #2D5A3D 0%, #1A3A24 100%); padding: 50px 40px; text-align: center; position: relative; overflow: hidden; }}
    .header::before {{ content: ''; position: absolute; top: -50%; right: -50%; width: 200%; height: 200%; background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%); }}
    .logo {{ font-size: 20px; font-weight: 700; color: #FFFFFF; letter-spacing: 3px; margin-bottom: 6px; position: relative; z-index: 1; }}
    .tagline {{ font-size: 11px; color: #A8D5B8; text-transform: uppercase; letter-spacing: 1.5px; position: relative; z-index: 1; }}
    .content {{ padding: 48px 40px; }}
    .greeting {{ font-size: 18px; font-weight: 600; color: #1A1917; margin-bottom: 16px; }}
    .greeting-subtext {{ font-size: 14px; color: #5C5954; margin-bottom: 32px; line-height: 1.5; }}
    .divider {{ height: 1px; background: linear-gradient(90deg, transparent, #DDD9D3, transparent); margin: 24px 0; }}
    .code-section {{ text-align: center; margin: 40px 0; }}
    .code-label {{ font-size: 11px; color: #9C9790; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 18px; font-weight: 600; }}
    .code-box {{ background: linear-gradient(135deg, #F8F6F3 0%, #F0EBE4 100%); border: 2px solid #2D5A3D; border-radius: 14px; padding: 32px 24px; margin: 16px 0; box-shadow: inset 0 2px 4px rgba(45, 90, 61, 0.08); }}
    .code-value {{ font-size: 56px; font-weight: 800; color: #2D5A3D; letter-spacing: 12px; font-family: 'Monaco', 'Courier New', monospace; word-spacing: 16px; line-height: 1; }}
    .info-box {{ background: linear-gradient(135deg, #F0F9F4 0%, #E8F2EC 100%); border: 1.5px solid #2D5A3D; border-radius: 12px; padding: 24px; margin: 32px 0; }}
    .info-box-icon {{ font-size: 24px; margin-bottom: 8px; }}
    .info-box-title {{ font-size: 14px; font-weight: 600; color: #2D5A3D; margin-bottom: 8px; }}
    .info-box-text {{ font-size: 13px; color: #5C5954; margin: 0; line-height: 1.5; }}
    .footer {{ background: linear-gradient(135deg, #FAFAF8 0%, #F5F3F0 100%); border-top: 1px solid #E8E3DB; padding: 32px 40px; text-align: center; }}
    .footer-text {{ font-size: 11px; color: #9C9790; margin: 8px 0; }}
    .footer-divider {{ height: 1px; background: #E8E3DB; margin: 16px 0; }}
    .security-note {{ font-size: 11px; color: #B0ADA6; margin-top: 12px; font-style: italic; }}
    a {{ color: #2D5A3D; text-decoration: none; transition: color 0.2s; }}
    a:hover {{ text-decoration: underline; color: #1A3A24; }}
    .muted-text {{ color: #9C9790; font-size: 12px; }}
    .spacer {{ height: 24px; }}
  </style>
</head>
<body>
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding: 32px 8px;">
        <table class="container" width="100%" cellpadding="0" cellspacing="0">
          <!-- Header with Gradient Background -->
          <tr>
            <td class="header">
              <div class="logo">REACH</div>
              <div class="tagline">Ministry Outreach Platform</div>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td class="content">
              <h1 class="greeting" style="font-size: 20px; margin-bottom: 12px;">Welcome Back</h1>
              
              <p class="greeting-subtext">
                Your sign-in code is ready. Enter the 6-digit code below to access your REACH account:
              </p>

              <div class="divider"></div>

              <!-- Code Section with Enhanced Styling -->
              <div class="code-section">
                <div class="code-label">🔐 Your Verification Code</div>
                <div class="code-box">
                  <div class="code-value">{otp}</div>
                </div>
                <p style="font-size: 12px; color: #9C9790; margin: 12px 0 0 0;">Copy and paste into the login screen</p>
              </div>

              <div class="divider"></div>

              <!-- Information Box with Icon -->
              <div class="info-box">
                <div class="info-box-icon">⏱️</div>
                <div class="info-box-title">Code Expires in 10 Minutes</div>
                <div class="info-box-text">
                  This code is valid for a single sign-in attempt only. It will automatically expire after 10 minutes.
                </div>
              </div>

              <!-- Security Notice -->
              <div style="background-color: #FEF9F6; border: 1px solid #F0EBE4; border-radius: 10px; padding: 18px; margin: 24px 0;">
                <p style="font-size: 13px; color: #5C5954; margin: 0;">
                  <strong>🔒 Didn't request this code?</strong><br>
                  If you didn't initiate this sign-in request, you can safely ignore this email. Your account remains secure. We never share your personal information with third parties.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="footer">
              <p class="footer-text" style="margin-bottom: 12px;">
                <strong>REACH</strong> — Ministry Outreach Platform
              </p>
              <p class="footer-text">
                <a href="https://reach-livid.vercel.app">Visit our website</a> • <a href="https://reach-livid.vercel.app">Need help?</a>
              </p>
              <div class="footer-divider"></div>
              <p class="security-note">
                This is an automated security message. Please do not reply to this email.<br>
                © 2026 REACH. All rights reserved.
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
