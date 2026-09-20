"""
Email service.

Sends transactional emails via SMTP using aiosmtplib.

Security principles:
  - SMTP credentials are loaded from settings (never hardcoded).
  - The raw OTP is accepted as a parameter but is NEVER logged.
  - If SMTP is not configured (empty username), the email is silently
    skipped and a warning is printed — useful during development when
    real SMTP credentials are not yet set up.
"""

import logging

import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger(__name__)


def _build_otp_email(to_email: str, otp: str) -> MIMEMultipart:
    """Build the OTP verification email message object."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Verify your BugTracker account"
    msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
    msg["To"] = to_email

    plain_body = (
        f"Hello,\n\n"
        f"Your BugTracker verification code is: {otp}\n\n"
        f"This code expires in {settings.OTP_EXPIRE_MINUTES} minutes.\n\n"
        f"If you did not create a BugTracker account, you can safely ignore "
        f"this email.\n\n"
        f"— The BugTracker Team"
    )

    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
        <h2 style="color: #1a56db;">BugTracker — Email Verification</h2>
        <p>Use the code below to verify your account:</p>
        <div style="
          font-size: 36px;
          font-weight: bold;
          letter-spacing: 8px;
          color: #111827;
          background: #f3f4f6;
          padding: 16px 24px;
          border-radius: 8px;
          display: inline-block;
          margin: 16px 0;
        ">{otp}</div>
        <p>This code expires in <strong>{settings.OTP_EXPIRE_MINUTES} minutes</strong>.</p>
        <p style="color: #6b7280; font-size: 13px;">
          If you did not create a BugTracker account, please ignore this email.
          Do not share this code with anyone.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="color: #9ca3af; font-size: 12px;">BugTracker — Intelligent Defect Tracking System</p>
      </body>
    </html>
    """

    msg.attach(MIMEText(plain_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))
    return msg


async def send_otp_email(to_email: str, otp: str) -> None:
    """Send a verification OTP email to *to_email*.

    If SMTP credentials are not configured (SMTP_USERNAME is empty),
    the function logs a warning and returns without sending — this
    allows development/test environments to run without real SMTP.

    The raw *otp* value is NOT logged anywhere in this function.
    """
    if not settings.SMTP_USERNAME:
        logger.warning(
            "SMTP not configured (SMTP_USERNAME is empty). "
            "Email to %s was NOT sent.",
            to_email,
        )
        return

    msg = _build_otp_email(to_email, otp)
    smtp_pass = settings.SMTP_PASSWORD.replace(" ", "") if settings.SMTP_PASSWORD else ""

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USERNAME,
            password=smtp_pass,
            start_tls=settings.SMTP_USE_TLS,
        )
        logger.info("OTP email successfully sent to %s", to_email)
    except Exception as exc:
        # Log the error but DO NOT include the OTP in the log message.
        logger.error(
            "Failed to send OTP email to %s: %s (%s)",
            to_email,
            type(exc).__name__,
            exc,
        )
        # Re-raise so the caller can decide whether to surface the error.
        raise


async def send_notification_email(
    to_email: str,
    title: str,
    message: str,
) -> None:
    """Send an in-app notification as an email.

    Called from BackgroundTasks — runs AFTER the HTTP response is sent.
    Email failure is logged but does NOT propagate (callers never raise).

    Never logs: OTP, password, JWT, SMTP credentials.
    """
    if not settings.SMTP_USERNAME:
        logger.debug(
            "SMTP not configured — notification email to %s skipped.", to_email
        )
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"[BugTracker] {title}"
    msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
    msg["To"] = to_email

    plain_body = f"{title}\n\n{message}\n\n— The BugTracker Team"
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; max-width: 520px; margin: auto;">
        <h2 style="color: #1a56db;">BugTracker Notification</h2>
        <h3 style="color: #111827;">{title}</h3>
        <p style="color: #374151;">{message}</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="color: #9ca3af; font-size: 12px;">
          BugTracker — Intelligent Defect Tracking System.<br>
          You are receiving this because you have notifications enabled.
          Update your preferences in the BugTracker app.
        </p>
      </body>
    </html>
    """

    msg.attach(MIMEText(plain_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    smtp_pass = settings.SMTP_PASSWORD.replace(" ", "") if settings.SMTP_PASSWORD else ""

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USERNAME,
            password=smtp_pass,
            start_tls=settings.SMTP_USE_TLS,
        )
        logger.info("Notification email sent to %s: %s", to_email, title)
    except Exception as exc:
        # Log error safely — no credentials, no user secrets
        logger.error(
            "Failed to send notification email to %s (%s): %s",
            to_email,
            title,
            type(exc).__name__,
        )
        # Do NOT re-raise — email failure must not affect the business operation

