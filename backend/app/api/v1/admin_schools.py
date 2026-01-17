from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_read_db
from app.core.deps_auth import require_role
from app.core.errors import http_error
from app.core import error_codes as codes
from app.models.school import School
from app.models.user import User
from app.models.user import UserRole
from app.schemas.school import SchoolCreate, SchoolRead, SchoolAdminRead, SchoolSummary


router = APIRouter(
    prefix="/admin/schools",
    dependencies=[Depends(require_role(UserRole.admin))],
)


@router.get("/summary", response_model=SchoolSummary)
async def schools_summary(
    db: AsyncSession = Depends(get_read_db),
) -> SchoolSummary:
    total = await db.scalar(select(func.count(School.id)))
    return SchoolSummary(total_count=total or 0)


@router.get("", response_model=list[SchoolAdminRead])
async def list_schools(
    city: str | None = Query(default=None, max_length=120),
    name: str | None = Query(default=None, max_length=255),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_read_db),
) -> list[SchoolAdminRead]:
    counts_subq = (
        select(
            User.city.label("city"),
            User.school.label("school"),
            func.count(User.id).label("user_count"),
        )
        .where(User.city.is_not(None), User.school.is_not(None))
        .group_by(User.city, User.school)
        .subquery()
    )
    stmt = (
        select(
            School,
            func.coalesce(counts_subq.c.user_count, 0).label("user_count"),
        )
        .outerjoin(
            counts_subq,
            and_(School.city == counts_subq.c.city, School.name == counts_subq.c.school),
        )
    )
    if city:
        stmt = stmt.where(School.city.ilike(f"%{city}%"))
    if name:
        stmt = stmt.where(School.name.ilike(f"%{name}%"))
    stmt = stmt.order_by(School.city, School.name).offset(offset).limit(limit)
    result = await db.execute(stmt)
    items = []
    for school, user_count in result.all():
        items.append(
            SchoolAdminRead(
                id=school.id,
                city=school.city,
                name=school.name,
                full_school_name=school.full_school_name,
                email=school.email,
                consorcium=school.consorcium,
                peterson=school.peterson,
                sirius=school.sirius,
                user_count=user_count,
            )
        )
    return items


@router.post("", response_model=SchoolRead)
async def create_school(
    payload: SchoolCreate,
    db: AsyncSession = Depends(get_db),
) -> SchoolRead:
    school = School(**payload.model_dump())
    db.add(school)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise http_error(400, codes.VALIDATION_ERROR, "Школа с таким городом и названием уже существует.")
    await db.refresh(school)
    return school
