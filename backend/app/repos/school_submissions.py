from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.school_submission import SchoolSubmission, SchoolSubmissionStatus


class SchoolSubmissionsRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def latest_for_user(self, user_id: int) -> SchoolSubmission | None:
        stmt = select(SchoolSubmission).where(SchoolSubmission.user_id == user_id).order_by(SchoolSubmission.id.desc()).limit(1)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def pending_for_user(self, user_id: int) -> SchoolSubmission | None:
        stmt = select(SchoolSubmission).where(SchoolSubmission.user_id == user_id, SchoolSubmission.status == SchoolSubmissionStatus.pending)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def get(self, submission_id: int, *, for_update: bool = False) -> SchoolSubmission | None:
        stmt = select(SchoolSubmission).where(SchoolSubmission.id == submission_id)
        if for_update:
            stmt = stmt.with_for_update()
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def list(self, *, status: SchoolSubmissionStatus | None, limit: int, offset: int) -> list[SchoolSubmission]:
        stmt = select(SchoolSubmission)
        if status is not None:
            stmt = stmt.where(SchoolSubmission.status == status)
        stmt = stmt.order_by(SchoolSubmission.created_at.desc(), SchoolSubmission.id.desc()).offset(offset).limit(limit)
        return list((await self.db.execute(stmt)).scalars().all())

    async def create(self, *, user_id: int, region_id: int, data: dict) -> SchoolSubmission:
        submission = SchoolSubmission(user_id=user_id, region_id=region_id, status=SchoolSubmissionStatus.pending, **data)
        self.db.add(submission)
        await self.db.flush()
        return submission
