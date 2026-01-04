from redis.asyncio import Redis
from app.core.config import settings

redis_client: Redis | None = None


async def get_redis() -> Redis:
    global redis_client
    if redis_client is None:
        redis_client = Redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_timeout=settings.REDIS_SOCKET_TIMEOUT_SEC,
            socket_connect_timeout=settings.REDIS_CONNECT_TIMEOUT_SEC,
        )
    return redis_client


async def safe_redis() -> Redis | None:
    try:
        return await get_redis()
    except Exception:
        return None
