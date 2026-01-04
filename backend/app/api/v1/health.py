"""Health check endpoints."""
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.redis import safe_redis, safe_redis_for_url
from app.db.session import SessionLocal
from app.core.config import settings
from app.core.metrics import CELERY_QUEUE_LENGTH

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
        async with SessionLocal() as session:
            await session.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    try:
        redis = await safe_redis()
        if redis is not None:
            await redis.ping()
            redis_ok = True
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
