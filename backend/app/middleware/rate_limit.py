from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import settings
from app.core.errors import api_error
from app.core.metrics import RATE_LIMIT_BLOCKS
from app.core.rate_limit import token_bucket_rate_limit
from app.core.redis import safe_redis
from app.core.security import decode_token
from app.core import error_codes as codes


def _critical_paths() -> list[str]:
    return [path.strip() for path in settings.CRITICAL_RL_PATHS.split(",") if path.strip()]


def _is_critical_path(path: str) -> bool:
    return any(path.startswith(prefix) for prefix in _critical_paths())


def _rate_limit_response(retry_after_sec: int) -> Response:
    headers = {"Retry-After": str(retry_after_sec)} if retry_after_sec > 0 else None
    return JSONResponse(
        status_code=429,
        content={"error": api_error(codes.RATE_LIMITED)},
        headers=headers,
    )


def _extract_user_id(request: Request) -> str | None:
    auth = request.headers.get("Authorization")
    if not auth or not auth.startswith("Bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        payload = decode_token(token)
    except Exception:
        return None
    if payload.get("type") != "access":
        return None
    sub = payload.get("sub")
    return str(sub) if sub else None


class GlobalRateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        if path.startswith("/api/v1/health") or path == "/metrics":
            return await call_next(request)

        redis = await safe_redis()
        if redis is None:
            return await call_next(request)

        if settings.GLOBAL_RL_LIMIT > 0 and settings.GLOBAL_RL_WINDOW_SEC > 0:
            ip = request.client.host if request.client else "unknown"
            res = await token_bucket_rate_limit(
                redis,
                key=f"rl:global:{ip}",
                capacity=settings.GLOBAL_RL_LIMIT,
                window_sec=settings.GLOBAL_RL_WINDOW_SEC,
            )
            if not res.allowed:
                RATE_LIMIT_BLOCKS.labels(scope="global").inc()
                return _rate_limit_response(res.retry_after_sec)

        if settings.CRITICAL_RL_USER_LIMIT > 0 and settings.CRITICAL_RL_USER_WINDOW_SEC > 0:
            if _is_critical_path(path):
                user_id = _extract_user_id(request)
                if user_id:
                    res = await token_bucket_rate_limit(
                        redis,
                        key=f"rl:critical:user:{user_id}",
                        capacity=settings.CRITICAL_RL_USER_LIMIT,
                        window_sec=settings.CRITICAL_RL_USER_WINDOW_SEC,
                    )
                    if not res.allowed:
                        RATE_LIMIT_BLOCKS.labels(scope="critical_user").inc()
                        return _rate_limit_response(res.retry_after_sec)

        return await call_next(request)
