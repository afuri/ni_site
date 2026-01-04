from prometheus_client import Counter, Gauge

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
