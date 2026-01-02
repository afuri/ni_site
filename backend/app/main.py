from fastapi import FastAPI
from prometheus_client import make_asgi_app
import sentry_sdk
from app.core.config import settings
from app.core.logging import setup_logging
from app.middleware.audit import AuditMiddleware
from app.api.v1.router import router as v1_router

setup_logging()

if settings.SENTRY_DSN:
    sentry_sdk.init(dsn=settings.SENTRY_DSN, environment=settings.ENV)

app = FastAPI(title=settings.APP_NAME)
app.add_middleware(AuditMiddleware)
app.include_router(v1_router)

if settings.PROMETHEUS_ENABLED:
    app.mount("/metrics", make_asgi_app())
