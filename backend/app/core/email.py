import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

import httpx

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

    provider = (settings.EMAIL_PROVIDER or "smtp").lower()
    if provider == "unisender":
        send_email_unisender(to_email=to_email, subject=subject, body=body)
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


def send_email_unisender(*, to_email: str, subject: str, body: str) -> None:
    if not settings.UNISENDER_API_KEY:
        raise RuntimeError("UNISENDER_API_KEY is not configured")

    from_name = settings.EMAIL_FROM_NAME or ""
    payload = {
        "message": {
            "recipients": [{"email": to_email}],
            "body": {"plaintext": body},
            "subject": subject,
            "from_email": settings.EMAIL_FROM,
            "from_name": from_name,
        }
    }

    timeout = settings.HTTP_CLIENT_TIMEOUT_SEC
    with httpx.Client(timeout=timeout) as client:
        resp = client.post(
            settings.UNISENDER_API_URL,
            json=payload,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-API-KEY": settings.UNISENDER_API_KEY,
            },
        )
        if resp.status_code >= 400:
            logger.error("unisender_http_error status=%s body=%s", resp.status_code, resp.text)
            resp.raise_for_status()
        try:
            data = resp.json()
        except Exception:
            logger.error("unisender_invalid_json body=%s", resp.text)
            raise
        if data.get("status") == "error":
            logger.error("unisender_api_error response=%s", data)
            raise RuntimeError("unisender_error")
