from __future__ import annotations

from typing import Any, Literal, Optional
from pydantic import BaseModel, Field, model_validator

from app.models.task import Subject, TaskType


class Option(BaseModel):
    id: str = Field(min_length=1, max_length=20)
    text: str = Field(min_length=1, max_length=500)


class TaskCreate(BaseModel):
    subject: Subject
    title: str = Field(min_length=1, max_length=255)
    content: str = Field(min_length=1)
    task_type: TaskType
    image_key: Optional[str] = Field(default=None, max_length=2048)
    payload: dict[str, Any]

    @model_validator(mode="after")
    def validate_payload(self):
        t = self.task_type
        p = self.payload or {}

        if t == TaskType.single_choice:
            options = p.get("options")
            correct = p.get("correct_option_id")
            if not isinstance(options, list) or len(options) < 2:
                raise ValueError("payload.options must be a list with at least 2 items")
            ids = [o.get("id") for o in options if isinstance(o, dict)]
            if len(ids) != len(set(ids)):
                raise ValueError("payload.options ids must be unique")
            if correct not in ids:
                raise ValueError("payload.correct_option_id must be one of options ids")

        elif t == TaskType.multi_choice:
            options = p.get("options")
            correct_ids = p.get("correct_option_ids")
            if not isinstance(options, list) or len(options) < 2:
                raise ValueError("payload.options must be a list with at least 2 items")
            ids = [o.get("id") for o in options if isinstance(o, dict)]
            if len(ids) != len(set(ids)):
                raise ValueError("payload.options ids must be unique")
            if not isinstance(correct_ids, list) or len(correct_ids) < 1:
                raise ValueError("payload.correct_option_ids must be a non-empty list")
            if any(cid not in ids for cid in correct_ids):
                raise ValueError("payload.correct_option_ids must be subset of options ids")

        elif t == TaskType.short_text:
            subtype = p.get("subtype")
            expected = p.get("expected")
            if subtype not in ("int", "float", "text"):
                raise ValueError("payload.subtype must be one of int|float|text")
            if expected is None or (isinstance(expected, str) and expected.strip() == ""):
                raise ValueError("payload.expected is required")

            if subtype == "float":
                eps = p.get("epsilon", 0.01)
                if not isinstance(eps, (int, float)) or eps <= 0:
                    raise ValueError("payload.epsilon must be positive number")
            if subtype == "text":
                # defaults are handled in grading; here just validate type if provided
                if "case_insensitive" in p and not isinstance(p["case_insensitive"], bool):
                    raise ValueError("payload.case_insensitive must be boolean")
                if "trim" in p and not isinstance(p["trim"], bool):
                    raise ValueError("payload.trim must be boolean")
        else:
            raise ValueError("unknown task_type")

        return self


class TaskUpdate(BaseModel):
    subject: Optional[Subject] = None
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    content: Optional[str] = Field(default=None, min_length=1)
    image_key: Optional[str] = Field(default=None, max_length=2048)
    payload: Optional[dict[str, Any]] = None


class TaskRead(BaseModel):
    id: int
    subject: Subject
    title: str
    content: str
    task_type: TaskType
    image_key: Optional[str] = None
    payload: dict[str, Any]
    created_by_user_id: int

    class Config:
        from_attributes = True
