from datetime import datetime, timezone
import time
import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.core.config import settings
from app.core.security import decode_token
import sentry_sdk
from app.db.session import SessionLocal
from app.repos.audit_logs import AuditLogsRepo
from app.repos.users import UsersRepo
from app.core.metrics import REQUEST_LATENCY_SECONDS
from app.core.request_id import get_request_id

logger = logging.getLogger(__name__)


class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not settings.AUDIT_LOG_ENABLED:
            return await call_next(request)

        path = request.url.path
        if path.endswith("/health") or path.endswith("/health/ready"):
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

        if settings.SENTRY_DSN:
            sentry_sdk.set_tag("env", settings.ENV)
            sentry_sdk.set_tag("version", settings.APP_VERSION)
            sentry_sdk.set_tag("path", path)
            sentry_sdk.set_tag("method", request.method)
            req_id = get_request_id()
            if req_id:
                sentry_sdk.set_tag("request_id", req_id)
            if user_id is not None:
                sentry_sdk.set_user({"id": user_id})
                try:
                    async with SessionLocal() as session:
                        user = await UsersRepo(session).get_by_id(user_id)
                    if user:
                        sentry_sdk.set_tag("role", user.role.value)
                except Exception:
                    pass

        status_code = 500
        start = time.perf_counter()
        action = "request"
        if path.startswith("/api/v1/admin/users/") and request.method == "PUT":
            action = "admin_update_user"
        elif path.endswith("/temp-password") and request.method == "POST":
            action = "admin_set_temp_password"
        elif path.endswith("/temp-password/generate") and request.method == "POST":
            action = "admin_generate_temp_password"
        elif path == "/api/v1/auth/password/change" and request.method == "POST":
            action = "auth_password_change"
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            try:
                route = request.scope.get("route")
                path_label = route.path if route is not None and hasattr(route, "path") else path
                REQUEST_LATENCY_SECONDS.labels(path=path_label, method=request.method).observe(
                    time.perf_counter() - start
                )
            except Exception:
                pass
            try:
                async with SessionLocal() as session:
                    repo = AuditLogsRepo(session)
                    await repo.create(
                        user_id=user_id,
                        action=action,
                        method=request.method,
                        path=path,
                        status_code=status_code,
                        ip=request.client.host if request.client else None,
                        user_agent=request.headers.get("user-agent"),
                        request_id=get_request_id(),
                        details=None,
                        created_at=datetime.now(timezone.utc),
                    )
            except Exception:
                logger.exception("audit_log_failed")
