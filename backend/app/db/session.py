"""Database session management."""
import time
from sqlalchemy import event
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.config import settings
from app.core.metrics import DB_QUERY_LATENCY_SECONDS, DB_QUERY_TOTAL


def _setup_engine_metrics(engine, role: str) -> None:
    @event.listens_for(engine.sync_engine, "before_cursor_execute")
    def _before_cursor_execute(conn, _cursor, _statement, _parameters, _context, _executemany):
        conn.info.setdefault("query_start_time", []).append(time.perf_counter())

    @event.listens_for(engine.sync_engine, "after_cursor_execute")
    def _after_cursor_execute(conn, _cursor, _statement, _parameters, _context, _executemany):
        start = (conn.info.get("query_start_time") or [time.perf_counter()]).pop()
        DB_QUERY_LATENCY_SECONDS.labels(role=role).observe(time.perf_counter() - start)
        DB_QUERY_TOTAL.labels(role=role, outcome="success").inc()

    @event.listens_for(engine.sync_engine, "handle_error")
    def _handle_error(exception_context):
        conn = exception_context.connection
        if conn is not None:
            try:
                start = (conn.info.get("query_start_time") or [time.perf_counter()]).pop()
                DB_QUERY_LATENCY_SECONDS.labels(role=role).observe(time.perf_counter() - start)
            except Exception:
                pass
        DB_QUERY_TOTAL.labels(role=role, outcome="error").inc()

connect_args = {"timeout": settings.DB_CONNECT_TIMEOUT_SEC}
if settings.DB_STATEMENT_TIMEOUT_MS > 0:
    connect_args["server_settings"] = {"statement_timeout": str(settings.DB_STATEMENT_TIMEOUT_MS)}

engine = create_async_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_TIMEOUT_SEC,
    pool_recycle=settings.DB_POOL_RECYCLE_SEC,
    connect_args=connect_args,
)
_setup_engine_metrics(engine, "write")
SessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)

read_database_url = settings.READ_DATABASE_URL or settings.DATABASE_URL
read_engine = create_async_engine(
    read_database_url,
    pool_pre_ping=True,
    pool_size=settings.READ_DB_POOL_SIZE,
    max_overflow=settings.READ_DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_TIMEOUT_SEC,
    pool_recycle=settings.DB_POOL_RECYCLE_SEC,
    connect_args=connect_args,
)
_setup_engine_metrics(read_engine, "read")
ReadSessionLocal = async_sessionmaker(bind=read_engine, expire_on_commit=False, class_=AsyncSession)
