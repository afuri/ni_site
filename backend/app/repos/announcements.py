from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.announcement import (
    AnnouncementAssignment,
    AnnouncementCampaign,
    AnnouncementCampaignFallback,
    AnnouncementGroupMessage,
)
from app.models.user import User, UserRole
from app.schemas.announcements import UserAnnouncementRead


@dataclass(slots=True)
class AnnouncementImportStats:
    total_rows: int = 0
    valid_rows: int = 0
    inserted_rows: int = 0
    skipped_duplicate_rows: int = 0
    skipped_invalid_format: int = 0
    skipped_unknown_user: int = 0
    skipped_not_student: int = 0
    skipped_group_out_of_range: int = 0


class AnnouncementsRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _is_time_active(now: datetime):
        return and_(
            or_(AnnouncementCampaign.starts_at.is_(None), AnnouncementCampaign.starts_at <= now),
            or_(AnnouncementCampaign.ends_at.is_(None), AnnouncementCampaign.ends_at > now),
        )

    @staticmethod
    def _is_group_time_active(now: datetime):
        return and_(
            or_(AnnouncementGroupMessage.starts_at.is_(None), AnnouncementGroupMessage.starts_at <= now),
            or_(AnnouncementGroupMessage.ends_at.is_(None), AnnouncementGroupMessage.ends_at > now),
        )

    async def list_campaigns(self) -> list[AnnouncementCampaign]:
        result = await self.db.execute(select(AnnouncementCampaign).order_by(AnnouncementCampaign.id.desc()))
        return list(result.scalars().all())

    async def get_campaign(self, campaign_id: int) -> AnnouncementCampaign | None:
        result = await self.db.execute(select(AnnouncementCampaign).where(AnnouncementCampaign.id == campaign_id))
        return result.scalar_one_or_none()

    async def get_campaign_by_code(self, code: str) -> AnnouncementCampaign | None:
        result = await self.db.execute(select(AnnouncementCampaign).where(AnnouncementCampaign.code == code))
        return result.scalar_one_or_none()

    async def create_campaign(self, payload: dict) -> AnnouncementCampaign:
        campaign = AnnouncementCampaign(**payload)
        self.db.add(campaign)
        await self.db.commit()
        await self.db.refresh(campaign)
        return campaign

    async def update_campaign(self, campaign: AnnouncementCampaign, patch: dict) -> AnnouncementCampaign:
        for key, value in patch.items():
            setattr(campaign, key, value)
        campaign.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(campaign)
        return campaign

    async def list_group_messages(
        self,
        campaign_id: int,
        subject: str | None = None,
    ) -> list[AnnouncementGroupMessage]:
        stmt = select(AnnouncementGroupMessage).where(AnnouncementGroupMessage.campaign_id == campaign_id)
        if subject:
            stmt = stmt.where(AnnouncementGroupMessage.subject == subject)
        stmt = stmt.order_by(AnnouncementGroupMessage.subject.asc(), AnnouncementGroupMessage.group_number.asc())
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def upsert_group_message(self, campaign_id: int, payload: dict) -> AnnouncementGroupMessage:
        stmt = select(AnnouncementGroupMessage).where(
            AnnouncementGroupMessage.campaign_id == campaign_id,
            AnnouncementGroupMessage.subject == payload["subject"],
            AnnouncementGroupMessage.group_number == payload["group_number"],
        )
        result = await self.db.execute(stmt)
        row = result.scalar_one_or_none()
        if row is None:
            row = AnnouncementGroupMessage(campaign_id=campaign_id, **payload)
            self.db.add(row)
        else:
            for key, value in payload.items():
                setattr(row, key, value)
            row.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def get_fallback(self, campaign_id: int) -> AnnouncementCampaignFallback | None:
        result = await self.db.execute(
            select(AnnouncementCampaignFallback).where(AnnouncementCampaignFallback.campaign_id == campaign_id)
        )
        return result.scalar_one_or_none()

    async def upsert_fallback(self, campaign_id: int, payload: dict) -> AnnouncementCampaignFallback:
        row = await self.get_fallback(campaign_id)
        if row is None:
            row = AnnouncementCampaignFallback(campaign_id=campaign_id, **payload)
            self.db.add(row)
        else:
            row.enabled = payload["enabled"]
            row.title = payload["title"]
            row.text = payload["text"]
            row.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def replace_assignments(
        self,
        campaign_id: int,
        subject: str,
        rows: list[tuple[int, int]],
        source_file: str,
    ) -> AnnouncementImportStats:
        stats = AnnouncementImportStats(total_rows=len(rows))
        if not rows:
            await self.db.execute(
                delete(AnnouncementAssignment).where(
                    AnnouncementAssignment.campaign_id == campaign_id,
                    AnnouncementAssignment.subject == subject,
                )
            )
            await self.db.commit()
            return stats

        last_by_user: dict[int, int] = {}
        for user_id, group_number in rows:
            if group_number < 1 or group_number > 21:
                stats.skipped_group_out_of_range += 1
                continue
            if user_id in last_by_user:
                stats.skipped_duplicate_rows += 1
            last_by_user[user_id] = group_number
        if not last_by_user:
            await self.db.execute(
                delete(AnnouncementAssignment).where(
                    AnnouncementAssignment.campaign_id == campaign_id,
                    AnnouncementAssignment.subject == subject,
                )
            )
            await self.db.commit()
            return stats

        user_ids = list(last_by_user.keys())
        existing_result = await self.db.execute(select(User.id, User.role).where(User.id.in_(user_ids)))
        role_by_user_id = {int(row[0]): row[1] for row in existing_result.all()}

        valid_rows: list[tuple[int, int]] = []
        for user_id, group_number in last_by_user.items():
            role = role_by_user_id.get(user_id)
            if role is None:
                stats.skipped_unknown_user += 1
                continue
            if role != UserRole.student:
                stats.skipped_not_student += 1
                continue
            valid_rows.append((user_id, group_number))

        stats.valid_rows = len(valid_rows)

        await self.db.execute(
            delete(AnnouncementAssignment).where(
                AnnouncementAssignment.campaign_id == campaign_id,
                AnnouncementAssignment.subject == subject,
            )
        )

        for user_id, group_number in valid_rows:
            self.db.add(
                AnnouncementAssignment(
                    campaign_id=campaign_id,
                    user_id=user_id,
                    subject=subject,
                    group_number=group_number,
                    source_file=source_file,
                )
            )
            stats.inserted_rows += 1

        await self.db.commit()
        return stats

    async def get_user_announcements(self, user_id: int) -> list[UserAnnouncementRead]:
        now = datetime.now(timezone.utc)
        campaigns_result = await self.db.execute(
            select(AnnouncementCampaign)
            .where(AnnouncementCampaign.is_active.is_(True), self._is_time_active(now))
            .order_by(func.coalesce(AnnouncementCampaign.starts_at, AnnouncementCampaign.created_at).desc())
        )
        campaigns = list(campaigns_result.scalars().all())
        if not campaigns:
            return []

        announcements_by_subject: dict[str, UserAnnouncementRead] = {}
        fallback_item: UserAnnouncementRead | None = None

        for campaign in campaigns:
            assignments_result = await self.db.execute(
                select(AnnouncementAssignment).where(
                    AnnouncementAssignment.campaign_id == campaign.id,
                    AnnouncementAssignment.user_id == user_id,
                    AnnouncementAssignment.subject.in_(("math", "cs")),
                )
            )
            assignments = list(assignments_result.scalars().all())
            for assignment in assignments:
                if assignment.subject in announcements_by_subject:
                    continue
                group_result = await self.db.execute(
                    select(AnnouncementGroupMessage).where(
                        AnnouncementGroupMessage.campaign_id == campaign.id,
                        AnnouncementGroupMessage.subject == assignment.subject,
                        AnnouncementGroupMessage.group_number == assignment.group_number,
                        AnnouncementGroupMessage.is_active.is_(True),
                        self._is_group_time_active(now),
                    )
                )
                group = group_result.scalar_one_or_none()
                if group is None:
                    continue
                text = campaign.common_text.strip()
                if group.group_text.strip():
                    text = f"{text}\n\n{group.group_text.strip()}" if text else group.group_text.strip()
                announcements_by_subject[assignment.subject] = UserAnnouncementRead(
                    campaign_code=campaign.code,
                    subject=assignment.subject,  # type: ignore[arg-type]
                    group_number=assignment.group_number,
                    title=group.group_title.strip(),
                    text=text,
                    starts_at=group.starts_at or campaign.starts_at,
                    ends_at=group.ends_at or campaign.ends_at,
                )

            if announcements_by_subject:
                continue

            if fallback_item is None:
                fallback_result = await self.db.execute(
                    select(AnnouncementCampaignFallback).where(
                        AnnouncementCampaignFallback.campaign_id == campaign.id,
                        AnnouncementCampaignFallback.enabled.is_(True),
                    )
                )
                fallback = fallback_result.scalar_one_or_none()
                if fallback:
                    fallback_item = UserAnnouncementRead(
                        campaign_code=campaign.code,
                        subject=None,
                        group_number=None,
                        title=fallback.title.strip(),
                        text=fallback.text.strip(),
                        starts_at=campaign.starts_at,
                        ends_at=campaign.ends_at,
                    )

        if announcements_by_subject:
            ordered: list[UserAnnouncementRead] = []
            for subject in ("math", "cs"):
                item = announcements_by_subject.get(subject)
                if item:
                    ordered.append(item)
            return ordered[:2]

        return [fallback_item] if fallback_item else []
