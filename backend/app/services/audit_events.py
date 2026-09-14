from datetime import datetime, timezone

from app.core.request_id import get_request_id
from app.models.audit_log import AuditLog


def add_audit_event(
    db,
    *,
    actor_user_id: int | None,
    action: str,
    method: str,
    path: str,
    details: dict,
) -> None:
    db.add(
        AuditLog(
            user_id=actor_user_id,
            action=action,
            method=method,
            path=path,
            status_code=200,
            ip=None,
            user_agent=None,
            request_id=get_request_id(),
            details=details,
            created_at=datetime.now(timezone.utc),
        )
    )
