from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from prometheus_client import make_asgi_app
import sentry_sdk
from app.core.config import settings
from app.core.errors import api_error
from app.core.logging import setup_logging
from app.middleware.audit import AuditMiddleware
from app.middleware.rate_limit import GlobalRateLimitMiddleware
from app.middleware.request_id import RequestIdMiddleware
from app.api.v1.router import router as v1_router

setup_logging()

if settings.SENTRY_DSN:
    sentry_sdk.init(dsn=settings.SENTRY_DSN, environment=settings.ENV, release=settings.APP_VERSION)

APP_DESCRIPTION = """
## Формат ошибок
Все ошибки возвращаются единообразно:

```json
{
  "error": {
    "code": "some_error_code",
    "message": "some_error_code",
    "details": {}
  }
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
app.add_middleware(RequestIdMiddleware)
app.add_middleware(GlobalRateLimitMiddleware)
app.add_middleware(AuditMiddleware)
app.include_router(v1_router)

if settings.PROMETHEUS_ENABLED:
    app.mount("/metrics", make_asgi_app())


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
    return JSONResponse(status_code=exc.status_code, content={"error": payload})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError):
    payload = api_error("validation_error", details=jsonable_encoder(exc.errors()))
    return JSONResponse(status_code=422, content={"error": payload})


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, _exc: Exception):
    payload = api_error("internal_error")
    return JSONResponse(status_code=500, content={"error": payload})
