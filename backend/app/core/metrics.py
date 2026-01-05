from prometheus_client import Counter, Gauge, Histogram

RATE_LIMIT_BLOCKS = Counter(
    "rate_limit_blocks_total",
    "Rate limit blocked requests",
    ["scope"],
)

ATTEMPTS_STARTED_TOTAL = Counter(
    "attempts_started_total",
    "Attempts started",
)

ATTEMPTS_SUBMITTED_TOTAL = Counter(
    "attempts_submitted_total",
    "Attempts submitted",
    ["status"],
)

CELERY_QUEUE_LENGTH = Gauge(
    "celery_queue_length",
    "Redis-backed Celery queue length",
    ["queue"],
)

DB_HEALTH_LATENCY_SECONDS = Gauge(
    "db_health_latency_seconds",
    "Latency for database health check",
)

REDIS_HEALTH_LATENCY_SECONDS = Gauge(
    "redis_health_latency_seconds",
    "Latency for Redis health check",
)

REQUEST_LATENCY_SECONDS = Histogram(
    "request_latency_seconds",
    "HTTP request latency",
    ["path", "method"],
)
