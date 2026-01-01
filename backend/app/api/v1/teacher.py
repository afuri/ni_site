from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.core.deps_auth import require_role
from app.models.user import UserRole, User

from app.repos.olympiads import OlympiadsRepo
from app.repos.teacher import TeacherRepo
from app.services.teacher import TeacherService
from app.schemas.teacher import TeacherAttemptView, TeacherOlympiadAttemptRow

router = APIRouter(prefix="/teacher")


@router.get("/olympiads/{olympiad_id}/attempts", response_model=list[TeacherOlympiadAttemptRow])
async def list_attempts_for_olympiad(
    olympiad_id: int,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    service = TeacherService(TeacherRepo(db), OlympiadsRepo(db))
    try:
        _olymp, rows = await service.list_olympiad_attempts(teacher=teacher, olympiad_id=olympiad_id)
    except ValueError as e:
        code = str(e)
        if code == "olympiad_not_found":
            raise HTTPException(status_code=404, detail="olympiad_not_found")
        if code == "forbidden":
            raise HTTPException(status_code=403, detail="forbidden")
        raise

    result = []
    for attempt, user in rows:
        result.append(
            {
                "id": attempt.id,
                "user_id": attempt.user_id,
                "user_email": user.email,
                "user_role": user.role,
                "status": attempt.status,
                "started_at": attempt.started_at,
                "deadline_at": attempt.deadline_at,
                "duration_sec": attempt.duration_sec,
            }
        )
    return result


@router.get("/attempts/{attempt_id}", response_model=TeacherAttemptView)
async def get_attempt_for_review(
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    service = TeacherService(TeacherRepo(db), OlympiadsRepo(db))
    try:
        attempt, user, olympiad, tasks, answers_by_task = await service.get_attempt_view(teacher=teacher, attempt_id=attempt_id)
    except ValueError as e:
        code = str(e)
        if code == "attempt_not_found":
            raise HTTPException(status_code=404, detail="attempt_not_found")
        if code == "olympiad_not_found":
            raise HTTPException(status_code=404, detail="olympiad_not_found")
        if code == "forbidden":
            raise HTTPException(status_code=403, detail="forbidden")
        raise

    tasks_view = []
    for t in tasks:
        a = answers_by_task.get(t.id)
        tasks_view.append(
            {
                "task_id": t.id,
                "prompt": t.prompt,
                "answer_max_len": t.answer_max_len,
                "sort_order": t.sort_order,
                "answer_text": None if a is None else a.answer_text,
                "updated_at": None if a is None else a.updated_at,
            }
        )

    return {
        "attempt": attempt,
        "user": user,
        "olympiad_title": olympiad.title,
        "tasks": tasks_view,
    }
