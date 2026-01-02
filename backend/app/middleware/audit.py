from datetime import datetime, timezone
import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.core.config import settings
from app.core.security import decode_token
from app.db.session import SessionLocal
from app.repos.audit_logs import AuditLogsRepo

logger = logging.getLogger(__name__)


class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not settings.AUDIT_LOG_ENABLED:
            return await call_next(request)

        path = request.url.path
        if path.endswith("/health"):
            return await call_next(request)

        user_id = None
        auth = request.headers.get("authorization") or ""
        if auth.lower().startswith("bearer "):
            token = auth.split(" ", 1)[1].strip()
            try:
                payload = decode_token(token)
                if payload.get("type") == "access" and payload.get("sub"):
                    user_id = int(payload.get("sub"))
            except Exception:
                pass

        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            try:
                async with SessionLocal() as session:
                    repo = AuditLogsRepo(session)
                    await repo.create(
                        user_id=user_id,
                        action="request",
                        method=request.method,
                        path=path,
                        status_code=status_code,
                        ip=request.client.host if request.client else None,
                        user_agent=request.headers.get("user-agent"),
                        details=None,
                        created_at=datetime.now(timezone.utc),
                    )
            except Exception:
                logger.exception("audit_log_failed")
