from types import SimpleNamespace

import pytest

from app.core import error_codes as codes
from app.models.user import SchoolStatus
from app.services.attempts import AttemptsService


class AttemptGateRepo:
    def __init__(self, existing=None):
        self.existing = existing

    async def get_attempt_by_user_olympiad(self, user_id: int, olympiad_id: int):
        return self.existing


@pytest.mark.asyncio
async def test_missing_school_blocks_only_a_new_attempt(monkeypatch):
    olympiad = SimpleNamespace(id=1, is_published=True)
    user = SimpleNamespace(id=7, is_email_verified=True, school_status=SchoolStatus.missing)

    service = AttemptsService(AttemptGateRepo())

    async def get_olympiad(_olympiad_id):
        return olympiad

    monkeypatch.setattr(service, "_get_olympiad_cached", get_olympiad)
    with pytest.raises(ValueError, match=codes.SCHOOL_PROFILE_REQUIRED):
        await service.start_attempt(user=user, olympiad_id=1)

    existing = SimpleNamespace(id=11, user_id=7, olympiad_id=1)
    resumed = AttemptsService(AttemptGateRepo(existing=existing))
    monkeypatch.setattr(resumed, "_get_olympiad_cached", get_olympiad)
    returned, _ = await resumed.start_attempt(user=user, olympiad_id=1)
    assert returned is existing
