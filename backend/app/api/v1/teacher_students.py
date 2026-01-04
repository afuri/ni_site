from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.core.deps_auth import require_role
from app.core.errors import http_error
from app.models.user import UserRole, User
from app.models.teacher_student import TeacherStudentStatus
from app.repos.users import UsersRepo
from app.repos.teacher_students import TeacherStudentsRepo
from app.services.teacher_students import TeacherStudentsService
from app.schemas.teacher_students import TeacherStudentCreateRequest, TeacherStudentRead

router = APIRouter(prefix="/teacher/students")

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
                "student_not_found": {"value": {"error": {"code": "student_not_found", "message": "student_not_found"}}},
                "link_not_found": {"value": {"error": {"code": "link_not_found", "message": "link_not_found"}}},
            }
        }
    },
}

ERROR_RESPONSE_409 = {
    "model": dict,
    "content": {
        "application/json": {
            "examples": {
                "cannot_attach_self": {"value": {"error": {"code": "cannot_attach_self", "message": "cannot_attach_self"}}},
                "not_a_student": {"value": {"error": {"code": "not_a_student", "message": "not_a_student"}}},
            }
        }
    },
}

ERROR_RESPONSE_422 = {
    "model": dict,
    "content": {"application/json": {"example": {"error": {"code": "validation_error", "message": "validation_error"}}}},
}


@router.post(
    "",
    response_model=TeacherStudentRead,
    status_code=201,
    tags=["teacher"],
    description="Создать или прикрепить ученика к учителю",
    responses={
        401: ERROR_RESPONSE_401,
        403: ERROR_RESPONSE_403,
        404: ERROR_RESPONSE_404,
        409: ERROR_RESPONSE_409,
        422: ERROR_RESPONSE_422,
    },
)
async def create_or_attach_student(
    payload: TeacherStudentCreateRequest,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    service = TeacherStudentsService(UsersRepo(db), TeacherStudentsRepo(db))

    # validate mode
    if (payload.create is None and payload.attach is None) or (payload.create is not None and payload.attach is not None):
        raise http_error(422, "provide_create_or_attach")

    try:
        if payload.attach is not None:
            link = await service.attach_existing(teacher=teacher, student_login=payload.attach.student_login)
            return link

        # create mode
        link, _student = await service.create_and_attach(teacher=teacher, payload=payload.create.model_dump())
        return link

    except ValueError as e:
        code = str(e)
        if code == "student_not_found":
            raise http_error(404, "student_not_found")
        if code == "cannot_attach_self":
            raise http_error(409, "cannot_attach_self")
        if code == "not_a_student":
            raise http_error(409, "not_a_student")
        if code == "login_taken":
            raise http_error(409, "login_taken")
        if code == "email_taken":
            raise http_error(409, "email_taken")
        if code in (
            "class_grade_required",
            "subject_required",
            "subject_not_allowed_for_student",
            "class_grade_not_allowed_for_teacher",
        ):
            raise http_error(422, code)
        raise


@router.post(
    "/{student_id}/confirm",
    response_model=TeacherStudentRead,
    tags=["teacher"],
    description="Подтвердить связь учитель-ученик",
    responses={
        401: ERROR_RESPONSE_401,
        403: ERROR_RESPONSE_403,
        404: ERROR_RESPONSE_404,
    },
)
async def confirm_student(
    student_id: int,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    service = TeacherStudentsService(UsersRepo(db), TeacherStudentsRepo(db))
    try:
        return await service.confirm(teacher=teacher, student_id=student_id)
    except ValueError as e:
        code = str(e)
        if code == "link_not_found":
            raise http_error(404, "link_not_found")
        raise


@router.get(
    "",
    response_model=list[TeacherStudentRead],
    tags=["teacher"],
    description="Список учеников учителя",
    responses={
        401: ERROR_RESPONSE_401,
        403: ERROR_RESPONSE_403,
        422: ERROR_RESPONSE_422,
    },
)
async def list_students(
    status: str | None = Query(default=None, description="pending|confirmed"),
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    service = TeacherStudentsService(UsersRepo(db), TeacherStudentsRepo(db))

    status_enum = None
    if status is not None:
        if status not in ("pending", "confirmed"):
            raise http_error(422, "invalid_status")
        status_enum = TeacherStudentStatus(status)

    return await service.list(teacher=teacher, status=status_enum)
