from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import error_codes as codes
from app.core.deps import get_db, get_read_db
from app.core.deps_auth import require_role
from app.core.errors import http_error
from app.models.school import School
from app.models.user import User, UserRole
from app.repos.regions import RegionsRepo
from app.repos.schools import SchoolsRepo
from app.schemas.school import CityAdminRead, SchoolAdminRead, SchoolCreate, SchoolSummary, SchoolUpdate
from app.services.audit_events import add_audit_event


router = APIRouter(prefix="/admin/schools", dependencies=[Depends(require_role(UserRole.admin))])


def _serialize(school: School, *, user_count: int = 0) -> SchoolAdminRead:
    return SchoolAdminRead(
        id=school.id,
        city_id=school.city_id,
        city_name=school.city.name,
        region_id=school.city.region_id,
        region_name=school.city.region.name,
        user_count=user_count,
        full_name=school.full_name,
        short_name=school.short_name,
        address=school.address,
        url=school.url,
        email=school.email,
        is_sirius=school.is_sirius,
        is_consortium=school.is_consortium,
        is_peterson=school.is_peterson,
        is_partner=school.is_partner,
        is_platform=school.is_platform,
        curator=school.curator,
        info=school.info,
        is_active=school.is_active,
    )


async def _validate_city(repo: SchoolsRepo, city_id: int):
    city = await repo.get_city(city_id)
    if city is None:
        raise http_error(404, codes.REGION_NOT_FOUND, "Город не найден.")
    if not city.is_active or not city.region.is_active:
        raise http_error(409, codes.REGION_INACTIVE)
    return city


@router.get("/summary", response_model=SchoolSummary)
async def schools_summary(
    region_id: int | None = Query(default=None, gt=0),
    city_id: int | None = Query(default=None, gt=0),
    query: str | None = Query(default=None, max_length=255),
    is_active: bool | None = None,
    is_sirius: bool | None = None,
    is_consortium: bool | None = None,
    is_peterson: bool | None = None,
    is_partner: bool | None = None,
    is_platform: bool | None = None,
    db: AsyncSession = Depends(get_read_db),
) -> SchoolSummary:
    total = await SchoolsRepo(db).count_admin(
        region_id=region_id,
        city_id=city_id,
        query=query,
        flags={
            "is_sirius": is_sirius,
            "is_consortium": is_consortium,
            "is_peterson": is_peterson,
            "is_partner": is_partner,
            "is_platform": is_platform,
        },
        is_active=is_active,
    )
    return SchoolSummary(total_count=total)


@router.get("/cities", response_model=list[CityAdminRead])
async def list_cities(
    region_id: int = Query(..., gt=0),
    query: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=500, ge=1, le=5000),
    db: AsyncSession = Depends(get_read_db),
):
    region = await RegionsRepo(db).get(region_id)
    if region is None:
        raise http_error(404, codes.REGION_NOT_FOUND)
    return await SchoolsRepo(db).list_cities(region_id=region_id, query=query, limit=limit)


@router.get("", response_model=list[SchoolAdminRead])
async def list_schools(
    region_id: int | None = Query(default=None, gt=0),
    city_id: int | None = Query(default=None, gt=0),
    query: str | None = Query(default=None, max_length=255),
    is_active: bool | None = None,
    is_sirius: bool | None = None,
    is_consortium: bool | None = None,
    is_peterson: bool | None = None,
    is_partner: bool | None = None,
    is_platform: bool | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_read_db),
) -> list[SchoolAdminRead]:
    rows = await SchoolsRepo(db).list_admin(
        region_id=region_id,
        city_id=city_id,
        query=query,
        flags={
            "is_sirius": is_sirius,
            "is_consortium": is_consortium,
            "is_peterson": is_peterson,
            "is_partner": is_partner,
            "is_platform": is_platform,
        },
        is_active=is_active,
        limit=limit,
        offset=offset,
    )
    return [_serialize(school, user_count=user_count) for school, user_count in rows]


@router.get("/{school_id}", response_model=SchoolAdminRead)
async def get_school(school_id: int, db: AsyncSession = Depends(get_read_db)):
    repo = SchoolsRepo(db)
    school = await repo.get(school_id)
    if school is None:
        raise http_error(404, codes.SCHOOL_NOT_FOUND)
    user_count = await db.scalar(select(func.count(User.id)).where(User.school_id == school_id))
    return _serialize(school, user_count=user_count or 0)


@router.post("", response_model=SchoolAdminRead, status_code=201)
async def create_school(
    payload: SchoolCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    repo = SchoolsRepo(db)
    await _validate_city(repo, payload.city_id)
    school = await repo.create(payload.model_dump(mode="json"), actor_user_id=admin.id)
    add_audit_event(
        db,
        actor_user_id=admin.id,
        action="school_created",
        method="POST",
        path="/api/v1/admin/schools",
        details={"school_id": school.id, "city_id": school.city_id},
    )
    await db.commit()
    school = await repo.get(school.id)
    return _serialize(school)


@router.patch("/{school_id}", response_model=SchoolAdminRead)
async def update_school(
    school_id: int,
    payload: SchoolUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    repo = SchoolsRepo(db)
    school = await repo.get(school_id, for_update=True)
    if school is None:
        raise http_error(404, codes.SCHOOL_NOT_FOUND)
    patch = payload.model_dump(exclude_unset=True, mode="json")
    if "city_id" in patch:
        await _validate_city(repo, patch["city_id"])
    was_active = school.is_active
    await repo.update(school, patch, actor_user_id=admin.id)
    action = "school_deactivated" if was_active and school.is_active is False else "school_updated"
    add_audit_event(
        db,
        actor_user_id=admin.id,
        action=action,
        method="PATCH",
        path=f"/api/v1/admin/schools/{school_id}",
        details={"school_id": school_id, "fields": sorted(patch)},
    )
    await db.commit()
    school = await repo.get(school_id)
    user_count = await db.scalar(select(func.count(User.id)).where(User.school_id == school_id))
    return _serialize(school, user_count=user_count or 0)
