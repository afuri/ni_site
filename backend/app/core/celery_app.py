from celery import Celery
from datetime import timedelta
from app.core.config import settings


celery_app = Celery(
    "ni_site",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.autodiscover_tasks(["app"])

beat_schedule: dict[str, dict] = {}
if settings.CACHE_WARMUP_INTERVAL_SEC > 0:
    beat_schedule["warmup-olympiad-cache"] = {
        "task": "maintenance.warmup_olympiad_cache",
        "schedule": timedelta(seconds=settings.CACHE_WARMUP_INTERVAL_SEC),
    }
if settings.TOKEN_CLEANUP_INTERVAL_SEC > 0:
    beat_schedule["cleanup-expired-auth"] = {
        "task": "maintenance.cleanup_expired_auth",
        "schedule": timedelta(seconds=settings.TOKEN_CLEANUP_INTERVAL_SEC),
    }
if settings.AUDIT_LOG_CLEANUP_INTERVAL_SEC > 0:
    beat_schedule["cleanup-audit-logs"] = {
        "task": "maintenance.cleanup_audit_logs",
        "schedule": timedelta(seconds=settings.AUDIT_LOG_CLEANUP_INTERVAL_SEC),
    }

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    beat_schedule=beat_schedule,
)
