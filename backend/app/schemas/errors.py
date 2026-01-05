from typing import Any
from pydantic import BaseModel


class ErrorPayload(BaseModel):
    code: str
    message: str
    details: Any | None = None


class ErrorResponse(BaseModel):
    error: ErrorPayload
    request_id: str | None = None
