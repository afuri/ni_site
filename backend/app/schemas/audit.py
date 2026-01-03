from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AuditLogRead(BaseModel):
    id: int
    user_id: Optional[int] = None
    action: str
    method: str
    path: str
    status_code: int
    ip: Optional[str] = None
    user_agent: Optional[str] = None
    details: Optional[dict] = None
    created_at: datetime

    class Config:
        from_attributes = True
