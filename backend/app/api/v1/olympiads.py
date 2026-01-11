from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_read_db
from app.repos.olympiads import OlympiadsRepo
from app.schemas.olympiads import OlympiadPublicRead
from app.api.v1.openapi_examples import EXAMPLE_LISTS, response_model_list_example

router = APIRouter(prefix="/olympiads")


@router.get(
    "",
    response_model=list[OlympiadPublicRead],
    tags=["olympiads"],
    description="Список опубликованных олимпиад",
    responses={200: response_model_list_example(EXAMPLE_LISTS["olympiads"])},
)
async def list_published_olympiads(
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_read_db),
):
    repo = OlympiadsRepo(db)
    return await repo.list_published(limit=limit, offset=offset)
