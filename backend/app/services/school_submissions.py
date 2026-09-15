from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core import error_codes as codes
from app.core.text_normalization import normalize_directory_name
from app.models.city import City
from app.models.region import Region
from app.models.school_submission import SchoolSubmissionStatus
from app.models.user import SchoolStatus, User
from app.models.user_change import UserChange
from app.repos.regions import RegionsRepo
from app.repos.school_submissions import SchoolSubmissionsRepo
from app.repos.schools import SchoolsRepo
from app.repos.users import UsersRepo
from app.services.audit_events import add_audit_event


class SchoolSubmissionsService:
    def __init__(self, db):
        self.db = db
        self.submissions = SchoolSubmissionsRepo(db)
        self.regions = RegionsRepo(db)
        self.schools = SchoolsRepo(db)
        self.users = UsersRepo(db)

    async def create(self, *, user: User, data: dict):
        locked_user = await self.users.get_by_id(user.id, for_update=True)
        if locked_user is None:
            raise ValueError(codes.USER_NOT_FOUND)
        if locked_user.school_status not in {SchoolStatus.missing, SchoolStatus.submission_rejected}:
            if locked_user.school_status == SchoolStatus.submission_pending:
                raise ValueError(codes.SCHOOL_SUBMISSION_EXISTS)
            raise ValueError(codes.SCHOOL_PROFILE_REQUIRED)
        if locked_user.region_id is None:
            raise ValueError(codes.REGION_NOT_FOUND)
        if await self.submissions.pending_for_user(locked_user.id):
            raise ValueError(codes.SCHOOL_SUBMISSION_EXISTS)
        region = await self.regions.get(locked_user.region_id)
        if region is None:
            raise ValueError(codes.REGION_NOT_FOUND)
        if not region.is_active:
            raise ValueError(codes.REGION_INACTIVE)
        payload = {key: (value.strip() if isinstance(value, str) else value) for key, value in data.items()}
        if region.is_other and (not payload.get("country_name") or not payload.get("region_name")):
            raise ValueError(codes.SCHOOL_PROFILE_REQUIRED)
        try:
            submission = await self.submissions.create(user_id=locked_user.id, region_id=region.id, data=payload)
            locked_user.school_status = SchoolStatus.submission_pending
            self.db.add(
                UserChange(
                    actor_user_id=locked_user.id,
                    target_user_id=locked_user.id,
                    action="school_submission_created",
                    details={"submission_id": submission.id, "region_id": region.id},
                )
            )
            add_audit_event(
                self.db,
                actor_user_id=locked_user.id,
                action="school_submission_created",
                method="POST",
                path="/api/v1/users/me/school-submissions",
                details={"submission_id": submission.id, "region_id": region.id},
            )
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise ValueError(codes.SCHOOL_SUBMISSION_EXISTS) from exc
        await self.db.refresh(submission)
        return submission

    async def duplicate_candidates(self, *, data: dict) -> list[int]:
        city = await self._resolve_city(data, create=False)
        if city is None:
            return []
        rows = await self.schools.duplicate_candidates(
            city_id=city.id,
            short_name=data["short_name"],
            full_name=data["full_name"],
            address=data["address"],
        )
        return [school.id for school in rows]

    async def approve(self, *, submission_id: int, admin: User, existing_school_id: int | None, new_school: dict | None):
        submission = await self.submissions.get(submission_id, for_update=True)
        if submission is None:
            raise ValueError(codes.SCHOOL_SUBMISSION_NOT_FOUND)
        if submission.status != SchoolSubmissionStatus.pending:
            raise ValueError(codes.SCHOOL_SUBMISSION_NOT_PENDING)
        target_user = await self.users.get_by_id(submission.user_id, for_update=True)
        if target_user is None:
            raise ValueError(codes.USER_NOT_FOUND)

        duplicate_ids: list[int] = []
        if existing_school_id is not None:
            school = await self.schools.get(existing_school_id)
            if school is None:
                raise ValueError(codes.SCHOOL_NOT_FOUND)
            if not school.is_active or not school.city.is_active or not school.city.region.is_active:
                raise ValueError(codes.SCHOOL_INACTIVE)
        else:
            assert new_school is not None
            city = await self._resolve_city(new_school, create=True)
            duplicate_ids = await self.duplicate_candidates(data={**new_school, "city_id": city.id})
            school_data = {
                key: value
                for key, value in new_school.items()
                if key not in {"region_id", "country_code", "country_name", "region_name", "city_name"}
            }
            school_data["city_id"] = city.id
            school_data["is_active"] = True
            school = await self.schools.create(school_data, actor_user_id=admin.id)
            school.city = city

            submission.country_name = (
                new_school.get("country_name")
                or ("Россия" if city.region.country_code == "RU" else submission.country_name)
            )
            submission.city_name = city.name

        now = datetime.now(timezone.utc)
        submission.status = SchoolSubmissionStatus.approved
        submission.resolved_school_id = school.id
        submission.reviewed_by_user_id = admin.id
        submission.reviewed_at = now
        target_user.region_id = school.city.region_id
        target_user.school_id = school.id
        target_user.school_status = SchoolStatus.selected
        target_user.country = "Россия" if school.city.region.country_code == "RU" else school.city.region.name
        target_user.city = school.city.name
        target_user.school = school.short_name
        self.db.add(
            UserChange(
                actor_user_id=admin.id,
                target_user_id=target_user.id,
                action="school_submission_approved",
                details={"submission_id": submission.id, "school_id": school.id},
            )
        )
        add_audit_event(
            self.db,
            actor_user_id=admin.id,
            action="school_submission_approved",
            method="POST",
            path=f"/api/v1/admin/school-submissions/{submission.id}/approve",
            details={"submission_id": submission.id, "school_id": school.id},
        )
        await self.db.commit()
        await self.db.refresh(submission)
        return submission, duplicate_ids

    async def reject(self, *, submission_id: int, admin: User, admin_comment: str):
        submission = await self.submissions.get(submission_id, for_update=True)
        if submission is None:
            raise ValueError(codes.SCHOOL_SUBMISSION_NOT_FOUND)
        if submission.status != SchoolSubmissionStatus.pending:
            raise ValueError(codes.SCHOOL_SUBMISSION_NOT_PENDING)
        target_user = await self.users.get_by_id(submission.user_id, for_update=True)
        if target_user is None:
            raise ValueError(codes.USER_NOT_FOUND)
        now = datetime.now(timezone.utc)
        submission.status = SchoolSubmissionStatus.rejected
        submission.admin_comment = admin_comment.strip()
        submission.reviewed_by_user_id = admin.id
        submission.reviewed_at = now
        target_user.school_id = None
        target_user.school_status = SchoolStatus.submission_rejected
        self.db.add(
            UserChange(
                actor_user_id=admin.id,
                target_user_id=target_user.id,
                action="school_submission_rejected",
                details={"submission_id": submission.id},
            )
        )
        add_audit_event(
            self.db,
            actor_user_id=admin.id,
            action="school_submission_rejected",
            method="POST",
            path=f"/api/v1/admin/school-submissions/{submission.id}/reject",
            details={"submission_id": submission.id},
        )
        await self.db.commit()
        await self.db.refresh(submission)
        return submission

    async def _resolve_city(self, data: dict, *, create: bool) -> City | None:
        city_id = data.get("city_id")
        if city_id is not None:
            city = await self.schools.get_city(city_id)
            if city is None:
                raise ValueError(codes.REGION_NOT_FOUND)
            if not city.is_active or not city.region.is_active:
                raise ValueError(codes.REGION_INACTIVE)
            return city

        region_id = data.get("region_id")
        region: Region | None
        if region_id is not None:
            region = await self.regions.get(region_id)
            if region is None:
                raise ValueError(codes.REGION_NOT_FOUND)
        else:
            region_name = data.get("region_name")
            country_code = data.get("country_code")
            normalized_region = normalize_directory_name(region_name)
            stmt = select(Region).where(Region.normalized_name == normalized_region)
            if country_code:
                stmt = stmt.where(Region.country_code == country_code.upper())
            region = (await self.db.execute(stmt)).scalar_one_or_none()
            if region is None and create:
                region = Region(
                    country_code=country_code.upper() if country_code else None,
                    name=region_name.strip(),
                    normalized_name=normalized_region,
                    is_other=False,
                    is_active=True,
                )
                self.db.add(region)
                await self.db.flush()
        if region is None:
            return None
        if not region.is_active:
            raise ValueError(codes.REGION_INACTIVE)
        city_name = data.get("city_name")
        normalized_city = normalize_directory_name(city_name)
        stmt = select(City).where(City.region_id == region.id, City.normalized_name == normalized_city)
        city = (await self.db.execute(stmt)).scalar_one_or_none()
        if city is None and create:
            city = City(region_id=region.id, name=city_name.strip(), normalized_name=normalized_city, is_active=True)
            city.region = region
            self.db.add(city)
            await self.db.flush()
        return city
