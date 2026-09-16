from sqlalchemy import case, func, or_, select, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.core.text_normalization import normalize_directory_name
from app.models.city import City
from app.models.school import School
from app.models.user import User


def _escaped_contains(value: str) -> str:
    return "%" + value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


class SchoolsRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, school_id: int, *, for_update: bool = False) -> School | None:
        stmt = select(School).where(School.id == school_id).options(selectinload(School.city).selectinload(City.region))
        if for_update:
            stmt = stmt.with_for_update(of=School)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def get_city(self, city_id: int) -> City | None:
        stmt = select(City).where(City.id == city_id).options(selectinload(City.region))
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def list_cities(self, *, region_id: int, query: str | None, limit: int) -> list[City]:
        stmt = select(City).where(City.region_id == region_id)
        if query:
            normalized = normalize_directory_name(query)
            escaped = normalized.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            stmt = stmt.where(City.normalized_name.ilike(f"%{escaped}%", escape="\\"))
        stmt = stmt.order_by(City.is_active.desc(), func.lower(City.name), City.id).limit(limit)
        return list((await self.db.execute(stmt)).scalars().all())

    async def search_public(self, *, region_id: int, query: str, limit: int, offset: int = 0) -> list[School]:
        normalized = normalize_directory_name(query)
        pattern = _escaped_contains(normalized)
        prefix = normalized.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        # Keep the city lookup as a lateral boundary so PostgreSQL first narrows
        # the catalogue to the selected region. Without it, very common terms
        # (for example "школа") can make the planner scan every school before
        # applying the region filter.
        schools_in_city = select(School).where(School.city_id == City.id).offset(0).lateral("schools_in_city")
        school = aliased(School, schools_in_city)
        stmt = (
            select(school)
            .select_from(City)
            .join(school, true())
            .where(
                City.region_id == region_id,
                City.is_active.is_(True),
                school.is_active.is_(True),
                or_(
                    school.normalized_short_name.ilike(pattern, escape="\\"),
                    school.normalized_full_name.ilike(pattern, escape="\\"),
                ),
            )
            .order_by(
                case((school.normalized_short_name == normalized, 0), else_=1),
                case((school.normalized_short_name.ilike(prefix, escape="\\"), 0), else_=1),
                func.lower(school.short_name),
                func.lower(City.name),
                school.id,
            )
            .options(selectinload(school.city))
            .offset(offset)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().unique().all())

    async def list_admin(
        self,
        *,
        region_id: int | None,
        city_id: int | None,
        query: str | None,
        flags: dict[str, bool | None],
        is_active: bool | None,
        limit: int,
        offset: int,
    ) -> list[tuple[School, int]]:
        counts = select(User.school_id, func.count(User.id).label("user_count")).where(User.school_id.is_not(None)).group_by(User.school_id).subquery()
        stmt = select(School, func.coalesce(counts.c.user_count, 0)).join(School.city).outerjoin(counts, counts.c.school_id == School.id)
        if region_id is not None:
            stmt = stmt.where(City.region_id == region_id)
        if city_id is not None:
            stmt = stmt.where(School.city_id == city_id)
        if query:
            pattern = _escaped_contains(normalize_directory_name(query))
            stmt = stmt.where(or_(School.normalized_short_name.ilike(pattern, escape="\\"), School.normalized_full_name.ilike(pattern, escape="\\")))
        if is_active is not None:
            stmt = stmt.where(School.is_active == is_active)
        for field, value in flags.items():
            if value is not None:
                stmt = stmt.where(getattr(School, field) == value)
        stmt = stmt.order_by(City.region_id, func.lower(City.name), func.lower(School.short_name), School.id).offset(offset).limit(limit)
        return list((await self.db.execute(stmt)).all())

    async def count_admin(
        self,
        *,
        region_id: int | None,
        city_id: int | None,
        query: str | None,
        flags: dict[str, bool | None],
        is_active: bool | None,
    ) -> int:
        stmt = select(func.count(School.id)).join(School.city)
        if region_id is not None:
            stmt = stmt.where(City.region_id == region_id)
        if city_id is not None:
            stmt = stmt.where(School.city_id == city_id)
        if query:
            pattern = _escaped_contains(normalize_directory_name(query))
            stmt = stmt.where(
                or_(
                    School.normalized_short_name.ilike(pattern, escape="\\"),
                    School.normalized_full_name.ilike(pattern, escape="\\"),
                )
            )
        if is_active is not None:
            stmt = stmt.where(School.is_active == is_active)
        for field, value in flags.items():
            if value is not None:
                stmt = stmt.where(getattr(School, field) == value)
        return int((await self.db.scalar(stmt)) or 0)

    async def create(self, data: dict, *, actor_user_id: int | None) -> School:
        payload = dict(data)
        payload["full_name"] = payload["full_name"].strip()
        payload["short_name"] = payload["short_name"].strip()
        payload["address"] = payload["address"].strip()
        payload["normalized_full_name"] = normalize_directory_name(payload["full_name"])
        payload["normalized_short_name"] = normalize_directory_name(payload["short_name"])
        payload["updated_by_user_id"] = actor_user_id
        school = School(**payload)
        self.db.add(school)
        await self.db.flush()
        return school

    async def update(self, school: School, data: dict, *, actor_user_id: int | None) -> School:
        for field, value in data.items():
            if isinstance(value, str):
                value = value.strip()
            setattr(school, field, value)
        if "full_name" in data:
            school.normalized_full_name = normalize_directory_name(school.full_name)
        if "short_name" in data:
            school.normalized_short_name = normalize_directory_name(school.short_name)
        school.updated_by_user_id = actor_user_id
        await self.db.flush()
        return school

    async def duplicate_candidates(self, *, city_id: int, short_name: str, full_name: str, address: str, limit: int = 20) -> list[School]:
        names = {normalize_directory_name(short_name), normalize_directory_name(full_name)}
        stmt = select(School).where(
            School.city_id == city_id,
            or_(School.normalized_short_name.in_(names), School.normalized_full_name.in_(names), func.lower(School.address) == address.strip().lower()),
        ).order_by(School.id).limit(limit)
        return list((await self.db.execute(stmt)).scalars().all())
