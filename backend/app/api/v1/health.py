"""Health check endpoints."""
import time
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.redis import safe_redis, safe_redis_for_url
from app.db.session import SessionLocal
from app.core.config import settings
from app.core.metrics import CELERY_QUEUE_LENGTH, DB_HEALTH_LATENCY_SECONDS, REDIS_HEALTH_LATENCY_SECONDS
from app.core.storage import storage_health

router = APIRouter()

ERROR_RESPONSE_503 = {
    "model": dict,
    "content": {"application/json": {"example": {"status": "degraded", "db": False, "redis": False}}},
}


@router.get("/health", tags=["health"], description="Проверка доступности сервиса")
async def health():
    return {"status": "ok"}

@router.get(
    "/health/ready",
    tags=["health"],
    description="Проверка готовности сервиса",
    responses={503: ERROR_RESPONSE_503},
)
async def readiness():
    db_ok = False
    redis_ok = False
    try:
        start = time.perf_counter()
        async with SessionLocal() as session:
            await session.execute(text("SELECT 1"))
        db_ok = True
        DB_HEALTH_LATENCY_SECONDS.set(time.perf_counter() - start)
    except Exception:
        db_ok = False

    try:
        start = time.perf_counter()
        redis = await safe_redis()
        if redis is not None:
            await redis.ping()
            redis_ok = True
        if redis_ok:
            REDIS_HEALTH_LATENCY_SECONDS.set(time.perf_counter() - start)
    except Exception:
        redis_ok = False

    payload = {"status": "ok" if db_ok and redis_ok else "degraded", "db": db_ok, "redis": redis_ok}
    if db_ok and redis_ok:
        return payload
    return JSONResponse(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content=payload)


@router.get(
    "/health/queues",
    tags=["health"],
    description="Проверка очередей фоновых задач",
    responses={503: ERROR_RESPONSE_503},
)
async def queues():
    queue_length = None
    client = await safe_redis_for_url(settings.CELERY_BROKER_URL)
    if client is not None:
        try:
            queue_length = await client.llen("celery")
            CELERY_QUEUE_LENGTH.labels(queue="celery").set(queue_length)
        except Exception:
            queue_length = None
        finally:
            await client.aclose()

    payload = {"queue": "celery", "length": queue_length}
    if queue_length is None:
        return JSONResponse(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content=payload)
    return payload


@router.get(
    "/health/deps",
    tags=["health"],
    description="Проверка внешних зависимостей (storage/email)",
    responses={503: ERROR_RESPONSE_503},
)
async def deps():
    storage_required = bool(settings.STORAGE_ENDPOINT and settings.STORAGE_ACCESS_KEY and settings.STORAGE_SECRET_KEY)
    storage_ok = True if not storage_required else storage_health()

    email_required = settings.EMAIL_SEND_ENABLED
    email_ok = True if not email_required else bool(settings.SMTP_HOST)

    payload = {
        "status": "ok" if storage_ok and email_ok else "degraded",
        "storage": storage_ok,
        "email": email_ok,
        "storage_required": storage_required,
        "email_required": email_required,
    }
    if storage_ok and email_ok:
        return payload
    return JSONResponse(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content=payload)
