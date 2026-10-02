"""Attempt schemas."""
from datetime import datetime
from typing import Any, List, Optional
from pydantic import BaseModel, Field, ConfigDict, model_validator
from app.models.task import TaskType

from app.models.attempt import AttemptStatus


class AttemptStartRequest(BaseModel):
    olympiad_id: int


class AttemptRead(BaseModel):
    id: int
    olympiad_id: int
    user_id: int
    started_at: datetime
    deadline_at: datetime
    duration_sec: int
    status: AttemptStatus
    score_total: int
    score_max: int
    passed: Optional[bool] = None
    graded_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    answers_revision: int | None = None

    model_config = ConfigDict(from_attributes=True)


class AttemptAnswerUpsertRequest(BaseModel):
    task_id: int
    answer_payload: dict[str, Any] | None
    expected_revision: int = Field(ge=0)


class AttemptAnswerChange(BaseModel):
    task_id: int
    # null explicitly clears the answer; absence is a validation error.
    answer_payload: dict[str, Any] | None


class AttemptSubmitRequest(BaseModel):
    expected_revision: int = Field(ge=0)
    answers: list[AttemptAnswerChange] | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def unique_tasks(self):
        if self.answers is not None and len({answer.task_id for answer in self.answers}) != len(self.answers):
            raise ValueError("duplicate_task_answers")
        return self


class AnswerSaveResponse(BaseModel):
    status: AttemptStatus
    answers_revision: int


class AttemptAnswerRead(BaseModel):
    task_id: int
    answer_payload: dict[str, Any]
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AttemptTaskView(BaseModel):
    task_id: int
    title: str
    content: str
    task_type: TaskType
    image_key: Optional[str] = None
    payload: dict[str, Any]
    sort_order: int
    max_score: int
    current_answer: Optional[AttemptAnswerRead] = None
    is_correct: Optional[bool] = None


class AttemptView(BaseModel):
    attempt: AttemptRead
    server_now: datetime
    olympiad_title: str
    tasks: List[AttemptTaskView]


class SubmitResponse(BaseModel):
    status: AttemptStatus


class AttemptResult(BaseModel):
    attempt_id: int
    olympiad_id: int
    olympiad_title: str | None = None
    olympiad_available_from: datetime | None = Field(
        default=None, description="Дата начала олимпиады для группировки по учебным сезонам"
    )
    status: AttemptStatus
    score_total: int
    score_max: int
    percent: int
    passed: Optional[bool] = None
    graded_at: Optional[datetime] = None
    started_at: datetime | None = None
    deadline_at: datetime | None = None
    finished_at: datetime | None = None
    results_released: bool = False
