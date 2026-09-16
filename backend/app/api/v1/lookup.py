from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import error_codes as codes
from app.core.deps import get_read_db
from app.core.errors import http_error
from app.core.text_normalization import normalize_directory_name
from app.models.city import City
from app.repos.regions import RegionsRepo
from app.repos.schools import SchoolsRepo
from app.schemas.region import RegionLookupRead
from app.schemas.school import SchoolLookupRead


router = APIRouter(prefix="/lookup", tags=["lookup"])


@router.get("/regions", response_model=list[RegionLookupRead])
async def lookup_regions(
    query: str = Query(default="", max_length=120),
    limit: int = Query(default=100, ge=1, le=100),
    db: AsyncSession = Depends(get_read_db),
):
    return await RegionsRepo(db).list_active(query=query, limit=limit)


@router.get("/schools", response_model=list[SchoolLookupRead])
async def lookup_schools(
    region_id: int = Query(..., gt=0),
    query: str = Query(..., max_length=255),
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_read_db),
) -> list[SchoolLookupRead]:
    query_value = query.strip()
    if len(query_value) < 2:
        raise http_error(422, codes.VALIDATION_ERROR, "Введите не менее двух символов.")
    region = await RegionsRepo(db).get(region_id)
    if region is None:
        raise http_error(404, codes.REGION_NOT_FOUND)
    if not region.is_active:
        raise http_error(409, codes.REGION_INACTIVE)
    if region.is_other:
        return []
    schools = await SchoolsRepo(db).search_public(
        region_id=region_id,
        query=query_value,
        limit=limit,
        offset=offset,
    )
    return [
        SchoolLookupRead(id=school.id, short_name=school.short_name, full_name=school.full_name, city=school.city.name)
        for school in schools
    ]


@router.get("/cities", response_model=list[str], deprecated=True)
async def lookup_cities(
    query: str = Query(default="", max_length=120),
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_read_db),
) -> list[str]:
    normalized = normalize_directory_name(query)
    if not normalized:
        return []
    escaped = normalized.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    stmt = (
        select(City.name)
        .where(City.is_active.is_(True), City.normalized_name.ilike(f"{escaped}%", escape="\\"))
        .distinct()
        .order_by(func.lower(City.name))
        .limit(limit)
    )
    return [row[0] for row in (await db.execute(stmt)).all()]
