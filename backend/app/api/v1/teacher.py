from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.core.deps_auth import require_role
from app.core.errors import http_error
from app.models.user import UserRole, User

from app.repos.olympiads import OlympiadsRepo
from app.repos.teacher import TeacherRepo
from app.repos.teacher_students import TeacherStudentsRepo
from app.repos.users import UsersRepo
from app.services.teacher import TeacherService
from app.schemas.teacher import TeacherAttemptView, TeacherOlympiadAttemptRow
from app.schemas.user import ModeratorRequestResponse

router = APIRouter(prefix="/teacher")

ERROR_RESPONSE_401 = {
    "model": dict,
    "content": {"application/json": {"example": {"error": {"code": "missing_token", "message": "missing_token"}}}},
}

ERROR_RESPONSE_403 = {
    "model": dict,
    "content": {"application/json": {"example": {"error": {"code": "forbidden", "message": "forbidden"}}}},
}

ERROR_RESPONSE_404 = {
    "model": dict,
    "content": {
        "application/json": {
            "examples": {
                "olympiad_not_found": {
                    "value": {"error": {"code": "olympiad_not_found", "message": "olympiad_not_found"}}
                },
                "attempt_not_found": {"value": {"error": {"code": "attempt_not_found", "message": "attempt_not_found"}}},
            }
        }
    },
}

ERROR_RESPONSE_409 = {
    "model": dict,
    "content": {"application/json": {"example": {"error": {"code": "already_moderator", "message": "already_moderator"}}}},
}


@router.get(
    "/olympiads/{olympiad_id}/attempts",
    response_model=list[TeacherOlympiadAttemptRow],
    tags=["teacher"],
    description="Список попыток по олимпиаде для учителя",
    responses={
        401: ERROR_RESPONSE_401,
        403: ERROR_RESPONSE_403,
        404: ERROR_RESPONSE_404,
    },
)
async def list_attempts_for_olympiad(
    olympiad_id: int,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    service = TeacherService(TeacherRepo(db), OlympiadsRepo(db), TeacherStudentsRepo(db))
    try:
        _olymp, rows = await service.list_olympiad_attempts(teacher=teacher, olympiad_id=olympiad_id)
    except ValueError as e:
        code = str(e)
        if code == "olympiad_not_found":
            raise http_error(404, "olympiad_not_found")
        if code == "forbidden":
            raise http_error(403, "forbidden")
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
                "score_total": attempt.score_total,
                "score_max": attempt.score_max,
                "passed": attempt.passed,
                "graded_at": attempt.graded_at,
            }
        )
    return result


@router.get(
    "/attempts/{attempt_id}",
    response_model=TeacherAttemptView,
    tags=["teacher"],
    description="Просмотр попытки ученика для учителя",
    responses={
        401: ERROR_RESPONSE_401,
        403: ERROR_RESPONSE_403,
        404: ERROR_RESPONSE_404,
    },
)
async def get_attempt_for_review(
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    service = TeacherService(TeacherRepo(db), OlympiadsRepo(db), TeacherStudentsRepo(db))
    try:
        attempt, user, olympiad, tasks, answers_by_task = await service.get_attempt_view(
            teacher=teacher,
            attempt_id=attempt_id,
        )
    except ValueError as e:
        code = str(e)
        if code == "attempt_not_found":
            raise http_error(404, "attempt_not_found")
        if code == "olympiad_not_found":
            raise http_error(404, "olympiad_not_found")
        if code == "forbidden":
            raise http_error(403, "forbidden")
        raise

    tasks_view = []
    for olymp_task, task in tasks:
        a = answers_by_task.get(task.id)
        tasks_view.append(
            {
                "task_id": task.id,
                "title": task.title,
                "content": task.content,
                "task_type": task.task_type,
                "sort_order": olymp_task.sort_order,
                "max_score": olymp_task.max_score,
                "answer_payload": None if a is None else a.answer_payload,
                "updated_at": None if a is None else a.updated_at,
            }
        )

    return {
        "attempt": attempt,
        "user": user,
        "olympiad_title": olympiad.title,
        "tasks": tasks_view,
    }


@router.post(
    "/moderator/request",
    response_model=ModeratorRequestResponse,
    tags=["teacher"],
    description="Запросить статус модератора",
    responses={
        401: ERROR_RESPONSE_401,
        409: ERROR_RESPONSE_409,
    },
)
async def request_moderator_status(
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_role(UserRole.teacher)),
):
    if teacher.is_moderator:
        raise http_error(409, "already_moderator")

    repo = UsersRepo(db)
    user = await repo.get_by_id(teacher.id)
    if not user:
        raise http_error(404, "user_not_found")

    if not user.moderator_requested:
        await repo.set_moderator_request(user, True)

    return {"status": "requested"}
