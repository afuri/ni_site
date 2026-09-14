from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
from types import SimpleNamespace

import pytest

sys.path.append(str(Path(__file__).resolve().parents[2] / "backend"))

from app.models.attempt import AttemptStatus
from app.models.user import UserRole
from app.services.attempts import AttemptsService


class FakeRepo:
    def __init__(self, attempt):
        self.attempt = attempt
        self.expired_called = False

    async def get_attempt(self, attempt_id: int):
        return self.attempt if attempt_id == self.attempt.id else None

    async def mark_expired(self, attempt_id: int) -> None:
        self.expired_called = True
        self.attempt.status = AttemptStatus.expired

    async def get_olympiad(self, olympiad_id: int):
        now = datetime.now(timezone.utc)
        return SimpleNamespace(
            id=olympiad_id,
            title="Deadline test",
            is_published=True,
            age_group="3-4",
            available_from=now - timedelta(days=1),
            available_to=now + timedelta(days=1),
            duration_sec=60,
            pass_percent=60,
            attempts_limit=1,
            results_released=False,
        )

    async def list_tasks_full(self, olympiad_id: int):
        return []

    async def list_answers(self, attempt_id: int):
        return []

    async def delete_grades(self, attempt_id: int):
        return None

    async def mark_expired_with_grade(self, *, attempt_id: int, **_kwargs) -> None:
        self.expired_called = True
        self.attempt.status = AttemptStatus.expired


@pytest.mark.asyncio
async def test_submit_expired_attempt_marks_expired():
    past = datetime.now(timezone.utc) - timedelta(minutes=5)
    attempt = SimpleNamespace(
        id=1,
        olympiad_id=1,
        user_id=7,
        started_at=past,
        deadline_at=past,
        duration_sec=60,
        status=AttemptStatus.active,
    )
    user = SimpleNamespace(id=7, role=UserRole.student)

    repo = FakeRepo(attempt)
    service = AttemptsService(repo)

    status = await service.submit(user=user, attempt_id=1)
    assert status == AttemptStatus.expired
    assert repo.expired_called is True
