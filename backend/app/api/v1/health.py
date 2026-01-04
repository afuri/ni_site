"""Health check endpoints."""
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.redis import safe_redis
from app.db.session import SessionLocal

router = APIRouter()

@router.get("/health", tags=["health"], description="Проверка доступности сервиса")
async def health():
    return {"status": "ok"}


@router.get("/health/ready", tags=["health"], description="Проверка готовности сервиса")
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
