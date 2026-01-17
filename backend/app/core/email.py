import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

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

    from_header = settings.EMAIL_FROM
    if settings.EMAIL_FROM_NAME:
        from_header = formataddr((settings.EMAIL_FROM_NAME, settings.EMAIL_FROM))

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_header
    msg["To"] = to_email
    msg.set_content(body)

    if settings.SMTP_USE_SSL:
        server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
    else:
        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
    with server:
        if not settings.SMTP_USE_SSL and settings.SMTP_USE_TLS:
            server.starttls()
        if settings.SMTP_USER and settings.SMTP_PASSWORD:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.send_message(msg)
