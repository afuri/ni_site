import logging
from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from prometheus_client import make_asgi_app
import sentry_sdk
from app.core.config import settings, validate_required_settings
from app.core.errors import api_error
from app.core.logging import setup_logging
from app.core.tracing import setup_tracing
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from app.core.request_id import get_request_id
from app.middleware.audit import AuditMiddleware
from app.middleware.attempt_body_limit import AttemptBodyLimitMiddleware
from app.middleware.rate_limit import GlobalRateLimitMiddleware
from app.middleware.request_id import RequestIdMiddleware
from app.middleware.server_time import ServerTimeMiddleware
from app.api.v1.router import router as v1_router

setup_logging()
missing_settings = validate_required_settings()
if missing_settings and settings.ENV in {"prod", "stage"}:
    raise RuntimeError(f"missing_required_env:{','.join(missing_settings)}")
if missing_settings and settings.ENV not in {"prod", "stage"}:
    import logging
    logging.getLogger(__name__).warning(
        "missing_required_env:%s", ",".join(missing_settings)
    )
setup_tracing()

if settings.SENTRY_DSN:
    sentry_sdk.init(dsn=settings.SENTRY_DSN, environment=settings.ENV, release=settings.APP_VERSION)

APP_DESCRIPTION = """
## Серверное время
Ответы /api/v1/ содержат X-Server-Time: UTC Unix timestamp в миллисекундах.
Клиент использует его для локального отсчёта без опроса сервера каждую секунду.

## Формат ошибок
Все ошибки возвращаются единообразно:

```json
{
  "error": {
    "code": "some_error_code",
    "message": "some_error_code",
    "details": {}
  },
  "request_id": "req-..."
}
```

## Частые коды ошибок
- `validation_error`
- `internal_error`
- `invalid_credentials`, `email_not_verified`
- `weak_password`
- `missing_token`, `invalid_token`, `invalid_token_type`
- `forbidden`, `user_not_found`, `olympiad_not_found`, `task_not_found`
- `rate_limited`, `attempt_expired`, `olympiad_not_available`
"""

app = FastAPI(title=settings.APP_NAME, description=APP_DESCRIPTION)
app.add_middleware(AttemptBodyLimitMiddleware, max_bytes=settings.ATTEMPT_MAX_BODY_BYTES)
app.add_middleware(AttemptBodyLimitMiddleware,
                   max_bytes=settings.TASK_UPLOAD_MAX_MB * 1024 * 1024 + 65536,
                   path_pattern=r"/api/v1/admin/task-uploads/?", error_code="task_archive_too_large")
app.add_middleware(AttemptBodyLimitMiddleware,
                   max_bytes=settings.STORAGE_MAX_UPLOAD_MB * 1024 * 1024 + 65536,
                   path_pattern=r"/api/v1/uploads/task-image/?", error_code="task_image_too_large")
app.add_middleware(AttemptBodyLimitMiddleware, max_bytes=20 * 1024 * 1024 + 65536,
                   path_pattern=r"/api/v1/admin/olympiads/\d+/participant-pdf/?",
                   error_code="participant_pdf_too_large", methods=("PUT",))
app.add_middleware(RequestIdMiddleware)
app.add_middleware(GlobalRateLimitMiddleware)
app.add_middleware(AuditMiddleware)
app.add_middleware(ServerTimeMiddleware)
app.include_router(v1_router)
if settings.OTEL_ENABLED:
    FastAPIInstrumentor.instrument_app(app)

if settings.PROMETHEUS_ENABLED:
    from app.core.maintenance_monitor import read_maintenance_state
    prometheus_app = make_asgi_app()

    async def metrics_app(scope, receive, send):
        await read_maintenance_state()
        await prometheus_app(scope, receive, send)

    app.mount("/metrics", metrics_app)


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, dict) and "code" in detail:
        payload = detail
    else:
        code = str(detail)
        if exc.status_code == 404 and code == "Not Found":
            code = "not_found"
        if exc.status_code == 405 and code == "Method Not Allowed":
            code = "method_not_allowed"
        payload = api_error(code)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": payload, "request_id": get_request_id()},
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError):
    operation = {
        "/api/v1/auth/verify/confirm": "verify_email",
        "/api/v1/auth/password/reset/confirm": "reset_password",
    }.get(_request.url.path)
    if operation:
        logging.getLogger(__name__).info("auth_link_rejected operation=%s reason=validation_error", operation)
    payload = api_error("validation_error", details=jsonable_encoder(exc.errors()))
    return JSONResponse(
        status_code=422,
        content={"error": payload, "request_id": get_request_id()},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, _exc: Exception):
    payload = api_error("internal_error")
    return JSONResponse(
        status_code=500,
        content={"error": payload, "request_id": get_request_id()},
    )
