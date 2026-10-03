from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_db
from app.core.deps_auth import require_role
from app.core.errors import http_error
from app.models.user import User, UserRole
from app.schemas.task_uploads import TaskUploadRead
from app.services import task_uploads as service

router = APIRouter(prefix="/admin/task-uploads", tags=["admin"], responses={
    401: {"description": "Необходима авторизация"},
    403: {"description": "Доступ только администратору"},
    404: {"description": "Сессия или задание не найдены"},
    409: {"description": "Очередь изменилась или токен уже используется"},
    410: {"description": "Сессия истекла"},
    413: {"description": "Архив превышает допустимый размер"},
    422: {"description": "Ошибка структуры архива или задания"},
    503: {"description": "Хранилище недоступно"},
})
admin_guard = require_role(UserRole.admin)


@router.post("", response_model=TaskUploadRead, status_code=201, description="Подготовить ZIP для последовательного сохранения заданий")
async def upload_archive(token: UUID = Form(...), archive: UploadFile = File(...),
                         db: AsyncSession = Depends(get_db), admin: User = Depends(admin_guard)):
    author_id = admin.id
    limit = settings.TASK_UPLOAD_MAX_MB * 1024 * 1024
    raw = await archive.read(limit + 1)
    await archive.close()
    if len(raw) > limit:
        raise http_error(413, "task_archive_too_large", "Архив превышает допустимый размер.")
    session = await service.create_upload(db, str(token), author_id, raw)
    return await service.snapshot(session)


@router.get("/{token}", response_model=TaskUploadRead, description="Восстановить текущий просмотр без повторной передачи ZIP")
async def read_upload(token: UUID, db: AsyncSession = Depends(get_db), admin: User = Depends(admin_guard)):
    session = await service.get_session(db, str(token), admin.id)
    await db.commit()
    return await service.snapshot(session)


@router.post("/{token}/tasks/{index}/save", response_model=TaskUploadRead, description="Сохранить текущее задание и перейти далее; повтор не создаёт дубль")
async def save_task(token: UUID, index: str, db: AsyncSession = Depends(get_db), admin: User = Depends(admin_guard)):
    return await service.snapshot(await service.decide(db, str(token), admin.id, index, "save"))


@router.post("/{token}/tasks/{index}/skip", response_model=TaskUploadRead, description="Окончательно пропустить текущее задание")
async def skip_task(token: UUID, index: str, db: AsyncSession = Depends(get_db), admin: User = Depends(admin_guard)):
    return await service.snapshot(await service.decide(db, str(token), admin.id, index, "skip"))


@router.post("/{token}/cancel", response_model=TaskUploadRead, description="Прекратить просмотр, сохранив уже созданные задания")
async def cancel_upload(token: UUID, db: AsyncSession = Depends(get_db), admin: User = Depends(admin_guard)):
    return await service.snapshot(await service.cancel(db, str(token), admin.id))
