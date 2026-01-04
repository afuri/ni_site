from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.core.deps_auth import require_admin_or_moderator
from app.core.errors import http_error
from app.models.content import ContentStatus, ContentType
from app.models.user import User, UserRole
from app.repos.content import ContentRepo
from app.schemas.content import ContentCreate, ContentRead, ContentUpdate
from app.services.content import ContentService
from app.api.v1.openapi_errors import response_example, response_examples


router = APIRouter(prefix="/content")
admin_router = APIRouter(prefix="/admin/content")


@router.get(
    "",
    response_model=list[ContentRead],
    tags=["content"],
    description="Список опубликованных материалов",
)
async def list_published_content(
    content_type: ContentType | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    repo = ContentRepo(db)
    return await repo.list_published(content_type=content_type, limit=limit, offset=offset)


@router.get(
    "/{content_id}",
    response_model=ContentRead,
    tags=["content"],
    description="Получить опубликованный материал",
    responses={
        404: response_example("content_not_found"),
    },
)
async def get_published_content(
    content_id: int,
    db: AsyncSession = Depends(get_db),
):
    repo = ContentRepo(db)
    item = await repo.get(content_id)
    if not item or item.status != ContentStatus.published:
        raise http_error(404, "content_not_found")
    return item


@admin_router.get(
    "",
    response_model=list[ContentRead],
    tags=["content"],
    description="Список материалов для управления",
    responses={
        401: response_example("missing_token"),
        403: response_example("forbidden"),
    },
)
async def list_content_admin(
    content_type: ContentType | None = Query(default=None),
    status: ContentStatus | None = Query(default=None),
    author_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin_or_moderator()),
):
    repo = ContentRepo(db)
    if user.role != UserRole.admin:
        author_id = user.id
    return await repo.list_admin(
        content_type=content_type,
        status=status,
        author_id=author_id,
        limit=limit,
        offset=offset,
    )


@admin_router.get(
    "/{content_id}",
    response_model=ContentRead,
    tags=["content"],
    description="Получить материал для управления",
    responses={
        401: response_example("missing_token"),
        403: response_example("forbidden"),
        404: response_example("content_not_found"),
    },
)
async def get_content_admin(
    content_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin_or_moderator()),
):
    repo = ContentRepo(db)
    item = await repo.get(content_id)
    if not item:
        raise http_error(404, "content_not_found")
    if user.role != UserRole.admin and item.author_id != user.id:
        raise http_error(403, "forbidden")
    return item


@admin_router.post(
    "",
    response_model=ContentRead,
    status_code=201,
    tags=["content"],
    description="Создать материал",
    responses={
        401: response_example("missing_token"),
        403: response_example("forbidden"),
        422: response_examples(
            "validation_error",
            "news_images_forbidden",
            "news_body_too_long",
            "article_body_too_short",
        ),
    },
)
async def create_content(
    payload: ContentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin_or_moderator()),
):
    service = ContentService(ContentRepo(db))
    return await service.create(payload=payload, user=user)


@admin_router.put(
    "/{content_id}",
    response_model=ContentRead,
    tags=["content"],
    description="Обновить материал",
    responses={
        401: response_example("missing_token"),
        403: response_example("forbidden"),
        404: response_example("content_not_found"),
        422: response_examples(
            "validation_error",
            "news_images_forbidden",
            "news_body_too_long",
            "article_body_too_short",
        ),
    },
)
async def update_content(
    content_id: int,
    payload: ContentUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin_or_moderator()),
):
    repo = ContentRepo(db)
    item = await repo.get(content_id)
    if not item:
        raise http_error(404, "content_not_found")
    patch = payload.model_dump(exclude_unset=True)
    service = ContentService(repo)
    return await service.update(item=item, patch=patch, user=user)


@admin_router.post(
    "/{content_id}/publish",
    response_model=ContentRead,
    tags=["content"],
    description="Опубликовать материал",
    responses={
        401: response_example("missing_token"),
        403: response_example("forbidden"),
        404: response_example("content_not_found"),
        422: response_examples(
            "validation_error",
            "news_images_forbidden",
            "news_body_too_long",
            "article_body_too_short",
        ),
    },
)
async def publish_content(
    content_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin_or_moderator()),
):
    repo = ContentRepo(db)
    item = await repo.get(content_id)
    if not item:
        raise http_error(404, "content_not_found")
    service = ContentService(repo)
    return await service.publish(item=item, user=user)


@admin_router.post(
    "/{content_id}/unpublish",
    response_model=ContentRead,
    tags=["content"],
    description="Снять материал с публикации",
    responses={
        401: response_example("missing_token"),
        403: response_example("forbidden"),
        404: response_example("content_not_found"),
    },
)
async def unpublish_content(
    content_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin_or_moderator()),
):
    repo = ContentRepo(db)
    item = await repo.get(content_id)
    if not item:
        raise http_error(404, "content_not_found")
    service = ContentService(repo)
    return await service.unpublish(item=item, user=user)
