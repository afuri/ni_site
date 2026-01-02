import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


def build_verify_link(token: str) -> str:
    return f"{settings.EMAIL_BASE_URL.rstrip('/')}/verify-email?token={token}"


def build_reset_link(token: str) -> str:
    return f"{settings.EMAIL_BASE_URL.rstrip('/')}/reset-password?token={token}"


def send_email(*, to_email: str, subject: str, body: str) -> None:
    if not settings.EMAIL_SEND_ENABLED:
        logger.info("email_disabled to=%s subject=%s", to_email, subject)
        return

    if not settings.SMTP_HOST:
        raise RuntimeError("SMTP_HOST is not configured")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.EMAIL_FROM
    msg["To"] = to_email
    msg.set_content(body)

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
        if settings.SMTP_USE_TLS:
            server.starttls()
        if settings.SMTP_USER and settings.SMTP_PASSWORD:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.send_message(msg)
