"""Olympiads endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.core.deps_auth import require_role, get_current_user
from app.models.user import UserRole, User
from app.repos.olympiads import OlympiadsRepo
from app.services.olympiads import OlympiadsService
from app.schemas.olympiad import OlympiadCreate, OlympiadRead, TaskCreate, TaskRead, OlympiadWithTasks

router = APIRouter(prefix="/olympiads")


@router.post("", response_model=OlympiadRead, status_code=201)
async def create_olympiad(
    payload: OlympiadCreate,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    service = OlympiadsService(OlympiadsRepo(db))
    return await service.create(
        user=teacher,
        title=payload.title,
        description=payload.description,
        duration_sec=payload.duration_sec,
    )


@router.post("/{olympiad_id}/tasks", response_model=TaskRead, status_code=201)
async def add_task(
    olympiad_id: int,
    payload: TaskCreate,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    service = OlympiadsService(OlympiadsRepo(db))
    try:
        task = await service.add_task(
            user=teacher,
            olympiad_id=olympiad_id,
            prompt=payload.prompt,
            answer_max_len=payload.answer_max_len,
            sort_order=payload.sort_order,
        )
        return task
    except ValueError as e:
        code = str(e)
        if code == "not_found":
            raise HTTPException(status_code=404, detail="olympiad_not_found")
        if code == "forbidden_owner":
            raise HTTPException(status_code=403, detail="forbidden")
        if code == "already_published":
            raise HTTPException(status_code=409, detail="already_published")
        raise


@router.post("/{olympiad_id}/publish", response_model=OlympiadRead)
async def publish(
    olympiad_id: int,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    service = OlympiadsService(OlympiadsRepo(db))
    try:
        olympiad = await service.publish(user=teacher, olympiad_id=olympiad_id)
        return olympiad
    except ValueError as e:
        code = str(e)
        if code == "not_found":
            raise HTTPException(status_code=404, detail="olympiad_not_found")
        if code == "forbidden_owner":
            raise HTTPException(status_code=403, detail="forbidden")
        if code == "no_tasks":
            raise HTTPException(status_code=409, detail="no_tasks")
        raise


@router.get("/published", response_model=list[OlympiadRead])
async def list_published(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),  # любой авторизованный
):
    repo = OlympiadsRepo(db)
    return await repo.list_published()


@router.get("/{olympiad_id}", response_model=OlympiadWithTasks)
async def get_olympiad_with_tasks(
    olympiad_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service = OlympiadsService(OlympiadsRepo(db))
    try:
        olympiad, tasks = await service.get_with_tasks(olympiad_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="olympiad_not_found")

    # Доступ: если опубликована — всем авторизованным; если нет — только владелец (учитель/админ)
    if not olympiad.is_published:
        if user.role not in (UserRole.teacher, UserRole.admin) or olympiad.created_by_user_id != user.id:
            raise HTTPException(status_code=403, detail="forbidden")

    return {"olympiad": olympiad, "tasks": tasks}
