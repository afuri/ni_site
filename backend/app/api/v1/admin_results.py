from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.teacher_student import TeacherStudent
from app.models.attempt import Attempt

from app.core.deps import get_db, get_read_db
from app.core.deps_auth import require_role
from app.core.errors import http_error
from app.core import error_codes as codes
from app.models.user import User, UserRole
from app.repos.olympiads import OlympiadsRepo
from app.repos.teacher import TeacherRepo
from app.repos.teacher_students import TeacherStudentsRepo
from app.models.teacher_student import TeacherStudentStatus
from app.schemas.admin_results import AdminAttemptView, AdminAttemptsPage
from app.services.teacher import TeacherService


router = APIRouter(prefix="/admin/results")


@router.get(
    "/olympiads/{olympiad_id}/attempts",
    response_model=AdminAttemptsPage,
    tags=["admin"],
    description="Список попыток по олимпиаде для администратора",
    responses={
        401: {"description": "Missing token"},
        403: {"description": "Forbidden"},
        404: {"description": "Olympiad not found"},
    },
)
async def list_olympiad_attempts(
    olympiad_id: int,
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    include_total: bool = Query(False),
    db: AsyncSession = Depends(get_read_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    links_repo = TeacherStudentsRepo(db)
    service = TeacherService(TeacherRepo(db), OlympiadsRepo(db), links_repo)
    try:
        _olymp, rows = await service.list_olympiad_attempts(teacher=admin, olympiad_id=olympiad_id, limit=limit, offset=offset)
    except ValueError as e:
        code = str(e)
        if code == codes.OLYMPIAD_NOT_FOUND:
            raise http_error(404, codes.OLYMPIAD_NOT_FOUND)
        if code == codes.FORBIDDEN:
            raise http_error(403, codes.FORBIDDEN)
        raise

    linked = {}
    teacher_rows = (await db.execute(select(TeacherStudent.student_id, User.surname, User.name, User.father_name)
        .join(User, User.id == TeacherStudent.teacher_id).where(TeacherStudent.student_id.in_([u.id for _,u in rows]),
            TeacherStudent.status == TeacherStudentStatus.confirmed))).all()
    for student_id, surname, name, father_name in teacher_rows:
        full_name = " ".join(filter(None, [surname,name,father_name]))
        if full_name:
            linked.setdefault(student_id, []).append(full_name)
    result = []
    for attempt, user in rows:
        full_name = " ".join(filter(None, [user.surname, user.name, user.father_name])) or None
        gender = user.gender.value if user.gender else None

        teachers = list(linked.get(user.id, []))

        for teacher in user.manual_teachers or []:
            if isinstance(teacher, dict):
                manual_name = str(teacher.get("full_name") or "").strip()
                if manual_name:
                    teachers.append(manual_name)

        deduped_teachers: list[str] = []
        for teacher_name in teachers:
            if teacher_name not in deduped_teachers:
                deduped_teachers.append(teacher_name)
        teachers_value = "; ".join(deduped_teachers) if deduped_teachers else None

        score_max = attempt.score_max or 0
        percent = int(round(attempt.score_total / score_max * 100)) if score_max > 0 else 0
        result.append(
            {
                "id": attempt.id,
                "user_id": attempt.user_id,
                "user_login": user.login,
                "user_full_name": full_name,
                "gender": gender,
                "class_grade": user.class_grade,
                "city": user.city_name,
                "school": user.school_short_name,
                "region_id": user.region_id,
                "region_name": user.region_name,
                "school_id": user.school_id,
                "school_status": user.school_status,
                "teachers": teachers_value,
                "started_at": attempt.started_at,
                "completed_at": attempt.graded_at,
                "duration_sec": attempt.duration_sec,
                "score_total": attempt.score_total,
                "score_max": attempt.score_max,
                "percent": percent,
            }
        )
    total = await db.scalar(select(func.count()).select_from(Attempt).where(Attempt.olympiad_id == olympiad_id)) if include_total else None
    return {"items": result, "total": total}


@router.get(
    "/attempts/{attempt_id}",
    response_model=AdminAttemptView,
    tags=["admin"],
    description="Просмотр попытки для администратора",
    responses={
        401: {"description": "Missing token"},
        403: {"description": "Forbidden"},
        404: {"description": "Attempt not found"},
    },
)
async def get_attempt_view(
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    service = TeacherService(TeacherRepo(db), OlympiadsRepo(db), TeacherStudentsRepo(db))
    try:
        attempt, user, olympiad, tasks, answers_by_task = await service.get_attempt_view(
            teacher=admin,
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

    grades = await TeacherRepo(db).list_grades(attempt_id)
    grades_by_task = {grade.task_id: grade for grade in grades}
    tasks_view = []
    for olymp_task, task in tasks:
        answer = answers_by_task.get(task.id)
        grade = grades_by_task.get(task.id)
        tasks_view.append(
            {
                "task_id": task.id,
                "title": task.title,
                "content": task.content,
                "task_type": task.task_type,
                "image_key": task.image_key,
                "payload": task.payload,
                "sort_order": olymp_task.sort_order,
                "max_score": olymp_task.max_score,
                "answer_payload": None if answer is None else answer.answer_payload,
                "updated_at": None if answer is None else answer.updated_at,
                "is_correct": None if grade is None else grade.is_correct,
            }
        )

    user_full_name = " ".join(filter(None, [user.surname, user.name, user.father_name])) or None
    return {
        "attempt": attempt,
        "user": {"id": user.id, "login": user.login, "full_name": user_full_name},
        "olympiad_title": olympiad.title,
        "tasks": tasks_view,
    }
