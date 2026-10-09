import logging
import smtplib
import hashlib
import hmac
import json
import re
from email.message import EmailMessage
from email.utils import formataddr

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailDeliveryRejected(Exception):
    """A provider refusal/configuration error that another immediate send cannot fix."""


def _recipient_id(address: str) -> str:
    return hmac.new(settings.JWT_SECRET.encode(), b"email-log\0" + address.strip().lower().encode(), hashlib.sha256).hexdigest()[:16]


def build_verify_link(token: str) -> str:
    return f"{settings.EMAIL_BASE_URL.rstrip('/')}/verify-email?token={token}"


def build_reset_link(token: str) -> str:
    return f"{settings.EMAIL_BASE_URL.rstrip('/')}/reset-password?token={token}"


def send_email(*, to_email: str, subject: str, body: str) -> None:
    if not settings.EMAIL_SEND_ENABLED:
        logger.info("email_disabled")
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
        raise EmailDeliveryRejected("unisender_configuration_missing")

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
        try:
            data = resp.json()
        except ValueError:
            logger.warning("unisender_invalid_json status=%s", resp.status_code)
            if 400 <= resp.status_code < 500 and resp.status_code != 429:
                raise EmailDeliveryRejected(f"unisender_http_rejected status={resp.status_code}") from None
            raise RuntimeError("unisender_invalid_response") from None
        if not isinstance(data, dict):
            raise RuntimeError("unisender_invalid_response")
        refusals = data.get("failed_emails")
        if not isinstance(refusals, dict):
            refusals = {}
        reasons = {"invalid", "permanent_unavailable", "temporary_unavailable", "unsubscribed", "blocked", "complained", "duplicate"}
        reason = next(iter(refusals.values()), None)
        reason = reason if isinstance(reason, str) and reason in reasons else "other"
        recipient = _recipient_id(to_email)
        error_id = re.search(r"Error ID:([A-Fa-f0-9-]{20,50})", str(data.get("message", "")))
        safe_data = {"status": "error", "code": data.get("code") if type(data.get("code")) is int else None,
                     "failed_emails": {f"recipient_{recipient}": reason} if refusals else {}}
        if error_id:
            safe_data["message"] = f"Error ID:{error_id[1]}"
        if refusals or data.get("status") == "error" or resp.status_code >= 400:
            logger.warning("unisender_http_error status=%s body=%s", resp.status_code, json.dumps(safe_data))
            # A suppression refusal can persist for days; a confirmation/reset
            # link will expire before it clears. Don't queue the same letter again.
            if refusals:
                raise EmailDeliveryRejected(f"unisender_recipient_rejected reason={reason} recipient_id={recipient}")
            if resp.status_code == 429 or resp.status_code >= 500:
                resp.raise_for_status()
            raise EmailDeliveryRejected(f"unisender_api_rejected code={safe_data['code']} status={resp.status_code}")
        if data.get("status") != "success":
            raise RuntimeError("unisender_invalid_response")
        job_id = data.get("job_id")
        safe_job_id = job_id if isinstance(job_id, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,100}", job_id) else "unknown"
        logger.info("unisender_email_accepted job_id=%s recipient_id=%s", safe_job_id, recipient)
