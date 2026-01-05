from prometheus_client import Counter, Gauge, Histogram

RATE_LIMIT_BLOCKS = Counter(
    "rate_limit_blocks_total",
    "Rate limit blocked requests",
    ["scope"],
)

REDIS_CACHE_HITS_TOTAL = Counter(
    "redis_cache_hits_total",
    "Redis cache hits",
    ["cache"],
)

REDIS_CACHE_MISSES_TOTAL = Counter(
    "redis_cache_misses_total",
    "Redis cache misses",
    ["cache"],
)

REDIS_OP_LATENCY_SECONDS = Histogram(
    "redis_op_latency_seconds",
    "Redis operation latency",
    ["op", "cache"],
)

DB_QUERY_LATENCY_SECONDS = Histogram(
    "db_query_latency_seconds",
    "Database query latency",
    ["role"],
)

DB_QUERY_TOTAL = Counter(
    "db_query_total",
    "Database queries",
    ["role", "outcome"],
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
