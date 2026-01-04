"""Attempts endpoints."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Response
from app.core.errors import http_error
from app.core.rate_limit import token_bucket_rate_limit
from app.core.metrics import RATE_LIMIT_BLOCKS
from app.core.redis import get_redis
from app.core.config import settings


from app.core.deps import get_db
from app.core.deps_auth import require_role, get_current_user
from app.models.user import UserRole, User
from app.repos.attempts import AttemptsRepo
from app.services.attempts import AttemptsService
from app.api.v1.openapi_errors import response_example, response_examples
from app.schemas.attempt import (
    AttemptStartRequest,
    AttemptRead,
    AttemptView,
    AttemptAnswerUpsertRequest,
    SubmitResponse,
    AttemptResult,
)

router = APIRouter(prefix="/attempts")


@router.post(
    "/start",
    response_model=AttemptRead,
    status_code=201,
    tags=["attempts"],
    description="Старт попытки прохождения олимпиады",
    responses={
        401: response_example("missing_token"),
        409: response_examples(
            "olympiad_not_available",
            "olympiad_not_published",
            "olympiad_has_no_tasks",
        ),
        404: response_example("olympiad_not_found"),
    },
)
async def start_attempt(
    payload: AttemptStartRequest,
    db: AsyncSession = Depends(get_db),
    student: User = Depends(require_role(UserRole.student)),
):
    service = AttemptsService(AttemptsRepo(db))
    try:
        attempt, _olympiad = await service.start_attempt(user=student, olympiad_id=payload.olympiad_id)
        return attempt
    except ValueError as e:
        code = str(e)
        if code == "olympiad_not_found":
            raise http_error(404, "olympiad_not_found")
        if code == "olympiad_not_published":
            raise http_error(409, "olympiad_not_published")
        if code == "olympiad_not_available":
            raise http_error(409, "olympiad_not_available")
        if code == "olympiad_has_no_tasks":
            raise http_error(409, "olympiad_has_no_tasks")
        raise




@router.get(
    "/{attempt_id}",
    response_model=AttemptView,
    tags=["attempts"],
    description="Просмотр попытки и ответов",
    responses={
        401: response_example("missing_token"),
        403: response_example("forbidden"),
        404: response_examples("attempt_not_found", "olympiad_not_found"),
    },
)
async def get_attempt_view(
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service = AttemptsService(AttemptsRepo(db))
    try:
        attempt, olympiad, tasks, answers_by_task = await service.get_attempt_view(user=user, attempt_id=attempt_id)
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
                "image_key": task.image_key,
                "payload": service._sanitize_task_payload(task.task_type, task.payload),
                "sort_order": olymp_task.sort_order,
                "max_score": olymp_task.max_score,
                "current_answer": None
                if a is None
                else {"task_id": a.task_id, "answer_payload": a.answer_payload, "updated_at": a.updated_at},
            }
        )

    return {
        "attempt": attempt,
        "olympiad_title": olympiad.title,
        "tasks": tasks_view,
    }


@router.post(
    "/{attempt_id}/answers",
    status_code=200,
    tags=["attempts"],
    description="Сохранить ответ на задание",
    responses={
        401: response_example("missing_token"),
        403: response_example("forbidden"),
        404: response_examples("attempt_not_found", "task_not_found"),
        409: response_examples("attempt_expired", "attempt_not_active"),
        422: response_example("invalid_answer_payload"),
    },
)
async def upsert_answer(
    attempt_id: int,
    payload: AttemptAnswerUpsertRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    student: User = Depends(require_role(UserRole.student)),
):
    # Rate limit: per (user_id, attempt_id)
    redis = await get_redis()
    rl_key = f"rl:answers:u{student.id}:a{attempt_id}"

    rl = await token_bucket_rate_limit(
        redis,
        key=rl_key,
        capacity=settings.ANSWERS_RL_LIMIT,
        window_sec=settings.ANSWERS_RL_WINDOW_SEC,
        cost=1,
    )

    response.headers["X-RateLimit-Limit"] = str(settings.ANSWERS_RL_LIMIT)
    response.headers["X-RateLimit-Remaining"] = str(rl.remaining)

    if not rl.allowed:
        response.headers["Retry-After"] = str(rl.retry_after_sec)
        RATE_LIMIT_BLOCKS.labels(scope="attempts:answers").inc()
        raise http_error(429, "rate_limited")

    service = AttemptsService(AttemptsRepo(db))
    try:
        return await service.upsert_answer(
            user=student,
            attempt_id=attempt_id,
            task_id=payload.task_id,
            answer_payload=payload.answer_payload,
        )
    except ValueError as e:
        code = str(e)
        if code == "attempt_not_found":
            raise http_error(404, "attempt_not_found")
        if code in ("forbidden",):
            raise http_error(403, "forbidden")
        if code in ("attempt_not_active",):
            raise http_error(409, "attempt_not_active")
        if code in ("attempt_expired",):
            raise http_error(409, "attempt_expired")
        if code == "task_not_found":
            raise http_error(404, "task_not_found")
        if code == "invalid_answer_payload":
            raise http_error(422, "invalid_answer_payload")
        raise



@router.post(
    "/{attempt_id}/submit",
    response_model=SubmitResponse,
    tags=["attempts"],
    description="Отправить попытку на проверку",
    responses={
        401: response_example("missing_token"),
        403: response_example("forbidden"),
        404: response_example("attempt_not_found"),
    },
)
async def submit_attempt(
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    student: User = Depends(require_role(UserRole.student)),
):
    service = AttemptsService(AttemptsRepo(db))
    try:
        status_value = await service.submit(user=student, attempt_id=attempt_id)
        return {"status": status_value}
    except ValueError as e:
        code = str(e)
        if code == "attempt_not_found":
            raise http_error(404, "attempt_not_found")
        if code == "forbidden":
            raise http_error(403, "forbidden")
        raise


@router.get(
    "/{attempt_id}/result",
    response_model=AttemptResult,
    tags=["attempts"],
    description="Получить результат попытки",
    responses={
        401: response_example("missing_token"),
        403: response_example("forbidden"),
        404: response_example("attempt_not_found"),
    },
)
async def get_attempt_result(
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    student: User = Depends(require_role(UserRole.student)),
):
    service = AttemptsService(AttemptsRepo(db))
    try:
        return await service.get_result(user=student, attempt_id=attempt_id)
    except ValueError as e:
        code = str(e)
        if code == "attempt_not_found":
            raise http_error(404, "attempt_not_found")
        if code == "forbidden":
            raise http_error(403, "forbidden")
        raise


@router.get(
    "/results/my",
    response_model=list[AttemptResult],
    tags=["attempts"],
    description="Список результатов текущего ученика",
)
async def list_my_results(
    db: AsyncSession = Depends(get_db),
    student: User = Depends(require_role(UserRole.student)),
):
    service = AttemptsService(AttemptsRepo(db))
    try:
        return await service.list_results(user=student)
    except ValueError as e:
        if str(e) == "forbidden":
            raise http_error(403, "forbidden")
        raise
