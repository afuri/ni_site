from __future__ import annotations

from typing import Any
from fastapi import HTTPException


def api_error(code: str, message: str | None = None, details: Any = None) -> dict:
    payload = {"code": code, "message": message or code}
    if details is not None:
        payload["details"] = details
    return payload


def http_error(status_code: int, code: str, message: str | None = None, details: Any = None) -> HTTPException:
    return HTTPException(status_code=status_code, detail=api_error(code, message, details))
