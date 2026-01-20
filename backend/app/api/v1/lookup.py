from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_read_db
from app.models.school import School


router = APIRouter(prefix="/lookup", tags=["lookup"])


@router.get("/cities", response_model=list[str])
async def lookup_cities(
    query: str = Query(default="", max_length=120),
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_read_db),
) -> list[str]:
    if not query:
        return []
    stmt = (
        select(School.city)
        .where(School.city.ilike(f"{query}%"))
        .distinct()
        .order_by(School.city)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return [row[0] for row in result.all()]


@router.get("/schools", response_model=list[str])
async def lookup_schools(
    city: str = Query(..., max_length=120),
    query: str = Query(default="", max_length=255),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_read_db),
) -> list[str]:
    city_value = city.strip()
    if not city_value:
        return []
    stmt = select(School.name).where(School.city.ilike(city_value))
    if query:
        stmt = stmt.where(School.name.ilike(f"%{query}%"))
    stmt = stmt.distinct().order_by(School.name).limit(limit)
    result = await db.execute(stmt)
    return [row[0] for row in result.all()]
