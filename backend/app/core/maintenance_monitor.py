"""Read worker receipts from Redis so every API replica reports fresh metrics."""
import json
import time

from app.core.redis import safe_redis
from app.core.metrics import MAINTENANCE_LAST_SUCCESS_TIMESTAMP, MAINTENANCE_PENDING_BOUNDED, MAINTENANCE_OLDEST_PENDING_AGE

TASK_NAMES = ("expire_attempts", "cleanup_expired_auth", "cleanup_audit_logs", "warmup_olympiad_cache")


async def read_maintenance_state():
    states = dict.fromkeys(TASK_NAMES)
    redis = await safe_redis()
    if redis is None:
        return states
    try:
        values = await redis.mget([f"maintenance:last:{name}" for name in TASK_NAMES])
    except Exception:
        return states
    for name, raw in zip(TASK_NAMES, values):
        try:
            state = json.loads(raw) if raw else None
            timestamp = float(state["completed_at"]) if state else 0
        except (ValueError, TypeError, KeyError):
            continue
        states[name] = state
        MAINTENANCE_LAST_SUCCESS_TIMESTAMP.labels(task=name).set(timestamp)
        for entity, pending in (state.get("backlog", {}) if state else {}).items():
            MAINTENANCE_PENDING_BOUNDED.labels(entity=entity).set(pending["count_capped"])
            due_at = pending.get("oldest_due_at")
            MAINTENANCE_OLDEST_PENDING_AGE.labels(entity=entity).set(max(0, time.time() - due_at) if due_at is not None else 0)
    return states
