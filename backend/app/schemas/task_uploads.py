from typing import Any, Literal
from pydantic import BaseModel


class TaskUploadItemRead(BaseModel):
    index: str
    title: str
    content: str
    task_type: str
    payload: dict[str, Any]
    errors: list[str]
    image_url: str | None = None


class TaskUploadSkippedRead(BaseModel):
    index: str
    reason: str
    errors: list[str]


class TaskUploadRead(BaseModel):
    token: str
    status: Literal["preparing", "reviewing", "completed", "cancelled", "failed"]
    pool_title: str
    subject: str
    grade: int
    total: int
    saved: int
    skipped: int
    current_number: int | None
    current: TaskUploadItemRead | None
    skipped_items: list[TaskUploadSkippedRead]
    saved_task_ids: list[int]
    error: str | None = None
