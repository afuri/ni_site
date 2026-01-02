from app.core.celery_app import celery_app
from app.core.email import send_email


@celery_app.task(name="send_email")
def send_email_task(to_email: str, subject: str, body: str) -> None:
    send_email(to_email=to_email, subject=subject, body=body)
