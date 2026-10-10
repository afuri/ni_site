from datetime import datetime

from sqlalchemy import DateTime, Integer, String, event
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Mapper
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    action: Mapped[str] = mapped_column(String(120), index=True)
    method: Mapped[str] = mapped_column(String(16))
    path: Mapped[str] = mapped_column(String(255))
    status_code: Mapped[int] = mapped_column(Integer)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


@event.listens_for(AuditLog, "before_insert")
@event.listens_for(AuditLog, "before_update")
def normalize_audit_strings(_mapper: Mapper[AuditLog], _connection: Connection, record: AuditLog) -> None:
    """Fit external strings into the existing schema without dropping the event."""
    changed: dict[str, dict[str, int | bool]] = {}
    for name in ("action", "method", "path", "ip", "user_agent", "request_id"):
        value = getattr(record, name)
        if value is None:
            continue
        limit = AuditLog.__table__.columns[name].type.length
        cleaned = value.replace("\x00", "")
        stored = cleaned[:limit]
        if stored != value:
            setattr(record, name, stored)
            changed[name] = {"original_length": len(value), "stored_length": len(stored),
                             "truncated": len(cleaned) > limit, "nulls_removed": value.count("\x00")}
    if changed:
        record.details = {**(record.details or {}), "audit_field_normalization": changed}
