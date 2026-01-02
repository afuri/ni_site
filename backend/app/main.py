from fastapi import FastAPI
from app.core.config import settings
from app.core.logging import setup_logging
from app.middleware.audit import AuditMiddleware
from app.api.v1.router import router as v1_router

setup_logging()

app = FastAPI(title=settings.APP_NAME)
app.add_middleware(AuditMiddleware)
app.include_router(v1_router)
