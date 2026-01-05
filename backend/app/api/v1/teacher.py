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
from app.api.v1.openapi_errors import response_example, response_examples
from app.api.v1.openapi_examples import EXAMPLE_TEACHER_ATTEMPT_VIEW, response_model_example
from app.core import error_codes as codes

router = APIRouter(prefix="/teacher")


@router.get(
    "/olympiads/{olympiad_id}/attempts",
    response_model=list[TeacherOlympiadAttemptRow],
    tags=["teacher"],
    description="Список попыток по олимпиаде для учителя",
    responses={
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.OLYMPIAD_NOT_FOUND),
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
        if code == codes.OLYMPIAD_NOT_FOUND:
            raise http_error(404, codes.OLYMPIAD_NOT_FOUND)
        if code == codes.FORBIDDEN:
            raise http_error(403, codes.FORBIDDEN)
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
        200: response_model_example(TeacherAttemptView, EXAMPLE_TEACHER_ATTEMPT_VIEW),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_examples(codes.ATTEMPT_NOT_FOUND, codes.OLYMPIAD_NOT_FOUND),
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
        if code == codes.ATTEMPT_NOT_FOUND:
            raise http_error(404, codes.ATTEMPT_NOT_FOUND)
        if code == codes.OLYMPIAD_NOT_FOUND:
            raise http_error(404, codes.OLYMPIAD_NOT_FOUND)
        if code == codes.FORBIDDEN:
            raise http_error(403, codes.FORBIDDEN)
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
        401: response_example(codes.MISSING_TOKEN),
        409: response_example(codes.ALREADY_MODERATOR),
    },
)
async def request_moderator_status(
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_role(UserRole.teacher)),
):
    if teacher.is_moderator:
        raise http_error(409, codes.ALREADY_MODERATOR)

    repo = UsersRepo(db)
    user = await repo.get_by_id(teacher.id)
    if not user:
        raise http_error(404, codes.USER_NOT_FOUND)

    if not user.moderator_requested:
        await repo.set_moderator_request(user, True)

    return {"status": "requested"}
