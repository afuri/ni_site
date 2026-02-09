"""Attempts endpoints."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Response
from app.core.errors import http_error
from app.core.rate_limit import token_bucket_rate_limit
from app.core.metrics import RATE_LIMIT_BLOCKS
from app.core.redis import get_redis
from app.core.config import settings
from app.core import error_codes as codes


from app.core.deps import get_db, get_read_db
from app.core.deps_auth import require_role, get_current_user
from app.models.user import UserRole, User
from app.repos.attempts import AttemptsRepo
from app.services.attempts import AttemptsService
from app.api.v1.openapi_errors import response_example, response_examples
from app.api.v1.openapi_examples import (
    EXAMPLE_ATTEMPT_READ,
    EXAMPLE_ATTEMPT_RESULT,
    EXAMPLE_ATTEMPT_VIEW,
    EXAMPLE_LISTS,
    response_model_example,
    response_model_list_example,
)
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
        201: response_model_example(AttemptRead, EXAMPLE_ATTEMPT_READ),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.EMAIL_NOT_VERIFIED),
        409: response_examples(
            codes.OLYMPIAD_NOT_AVAILABLE,
            codes.OLYMPIAD_AGE_GROUP_MISMATCH,
            codes.OLYMPIAD_NOT_PUBLISHED,
            codes.OLYMPIAD_HAS_NO_TASKS,
        ),
        404: response_example(codes.OLYMPIAD_NOT_FOUND),
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
        if code == codes.OLYMPIAD_NOT_FOUND:
            raise http_error(404, codes.OLYMPIAD_NOT_FOUND)
        if code == codes.EMAIL_NOT_VERIFIED:
            raise http_error(403, codes.EMAIL_NOT_VERIFIED)
        if code == codes.OLYMPIAD_NOT_PUBLISHED:
            raise http_error(409, codes.OLYMPIAD_NOT_PUBLISHED)
        if code == codes.OLYMPIAD_NOT_AVAILABLE:
            raise http_error(409, codes.OLYMPIAD_NOT_AVAILABLE)
        if code == codes.OLYMPIAD_AGE_GROUP_MISMATCH:
            raise http_error(409, codes.OLYMPIAD_AGE_GROUP_MISMATCH)
        if code == codes.OLYMPIAD_HAS_NO_TASKS:
            raise http_error(409, codes.OLYMPIAD_HAS_NO_TASKS)
        raise




@router.get(
    "/{attempt_id}",
    response_model=AttemptView,
    tags=["attempts"],
    description="Просмотр попытки и ответов",
    responses={
        200: response_model_example(AttemptView, EXAMPLE_ATTEMPT_VIEW),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_examples(codes.ATTEMPT_NOT_FOUND, codes.OLYMPIAD_NOT_FOUND),
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
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_examples(codes.ATTEMPT_NOT_FOUND, codes.TASK_NOT_FOUND),
        409: response_examples(codes.ATTEMPT_EXPIRED, codes.ATTEMPT_NOT_ACTIVE),
        422: response_example(codes.INVALID_ANSWER_PAYLOAD),
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
        raise http_error(429, codes.RATE_LIMITED)

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
        if code == codes.ATTEMPT_NOT_FOUND:
            raise http_error(404, codes.ATTEMPT_NOT_FOUND)
        if code in (codes.FORBIDDEN,):
            raise http_error(403, codes.FORBIDDEN)
        if code in (codes.ATTEMPT_NOT_ACTIVE,):
            raise http_error(409, codes.ATTEMPT_NOT_ACTIVE)
        if code in (codes.ATTEMPT_EXPIRED,):
            raise http_error(409, codes.ATTEMPT_EXPIRED)
        if code == codes.TASK_NOT_FOUND:
            raise http_error(404, codes.TASK_NOT_FOUND)
        if code == codes.INVALID_ANSWER_PAYLOAD:
            raise http_error(422, codes.INVALID_ANSWER_PAYLOAD)
        raise



@router.post(
    "/{attempt_id}/submit",
    response_model=SubmitResponse,
    tags=["attempts"],
    description="Отправить попытку на проверку",
    responses={
        200: response_model_example(SubmitResponse, {"status": "submitted"}),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.ATTEMPT_NOT_FOUND),
        409: response_example(codes.ATTEMPT_SUBMIT_TOO_EARLY),
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
        if code == codes.ATTEMPT_NOT_FOUND:
            raise http_error(404, codes.ATTEMPT_NOT_FOUND)
        if code == codes.FORBIDDEN:
            raise http_error(403, codes.FORBIDDEN)
        if code == codes.ATTEMPT_SUBMIT_TOO_EARLY:
            raise http_error(409, codes.ATTEMPT_SUBMIT_TOO_EARLY)
        raise


@router.get(
    "/{attempt_id}/result",
    response_model=AttemptResult,
    tags=["attempts"],
    description="Получить результат попытки",
    responses={
        200: response_model_example(AttemptResult, EXAMPLE_ATTEMPT_RESULT),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.ATTEMPT_NOT_FOUND),
    },
)
async def get_attempt_result(
    attempt_id: int,
    db: AsyncSession = Depends(get_read_db),
    student: User = Depends(require_role(UserRole.student)),
):
    service = AttemptsService(AttemptsRepo(db))
    try:
        return await service.get_result(user=student, attempt_id=attempt_id)
    except ValueError as e:
        code = str(e)
        if code == codes.ATTEMPT_NOT_FOUND:
            raise http_error(404, codes.ATTEMPT_NOT_FOUND)
        if code == codes.FORBIDDEN:
            raise http_error(403, codes.FORBIDDEN)
        raise


@router.get(
    "/results/my",
    response_model=list[AttemptResult],
    tags=["attempts"],
    description="Список результатов текущего ученика",
    responses={
        200: response_model_list_example(EXAMPLE_LISTS["attempt_results"]),
    },
)
async def list_my_results(
    db: AsyncSession = Depends(get_read_db),
    student: User = Depends(require_role(UserRole.student)),
):
    service = AttemptsService(AttemptsRepo(db))
    try:
        return await service.list_results(user=student)
    except ValueError as e:
        if str(e) == codes.FORBIDDEN:
            raise http_error(403, codes.FORBIDDEN)
        raise
