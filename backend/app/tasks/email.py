from app.core.celery_app import celery_app
from app.core.email import send_email


@celery_app.task(
    name="send_email",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 5},
)
def send_email_task(to_email: str, subject: str, body: str) -> None:
    send_email(to_email=to_email, subject=subject, body=body)
