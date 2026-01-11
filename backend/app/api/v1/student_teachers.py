from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.core.deps_auth import require_role
from app.core.errors import http_error
from app.models.user import User, UserRole
from app.models.teacher_student import TeacherStudentStatus
from app.repos.teacher_students import TeacherStudentsRepo
from app.repos.users import UsersRepo
from app.schemas.teacher_students import StudentTeacherRequest, TeacherStudentRead
from app.services.teacher_students import TeacherStudentsService
from app.api.v1.openapi_errors import response_example, response_examples
from app.api.v1.openapi_examples import EXAMPLE_LISTS, EXAMPLE_TEACHER_STUDENT_READ, response_model_example, response_model_list_example
from app.core import error_codes as codes

router = APIRouter(prefix="/student/teachers")


@router.post(
    "",
    response_model=TeacherStudentRead,
    status_code=201,
    tags=["student"],
    description="Запросить связь ученик-учитель",
    responses={
        201: response_model_example(TeacherStudentRead, EXAMPLE_TEACHER_STUDENT_READ),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_examples(codes.USER_NOT_FOUND, codes.USER_NOT_TEACHER),
        409: response_example(codes.CANNOT_ATTACH_SELF),
        422: response_example(codes.VALIDATION_ERROR),
    },
)
async def request_teacher_link(
    payload: StudentTeacherRequest,
    db: AsyncSession = Depends(get_db),
    student: User = Depends(require_role(UserRole.student)),
):
    service = TeacherStudentsService(UsersRepo(db), TeacherStudentsRepo(db))
    teacher_login = payload.attach.teacher_login.strip()
    teacher_email = teacher_login if "@" in teacher_login else None
    teacher_login_value = None if teacher_email else teacher_login
    try:
        link = await service.request_teacher(
            student=student,
            teacher_login=teacher_login_value,
            teacher_email=teacher_email,
        )
        return link
    except ValueError as e:
        code = str(e)
        if code == codes.USER_NOT_FOUND:
            raise http_error(404, codes.USER_NOT_FOUND)
        if code == codes.USER_NOT_TEACHER:
            raise http_error(404, codes.USER_NOT_TEACHER)
        if code == codes.CANNOT_ATTACH_SELF:
            raise http_error(409, codes.CANNOT_ATTACH_SELF)
        raise


@router.get(
    "",
    response_model=list[TeacherStudentRead],
    tags=["student"],
    description="Список учителей ученика",
    responses={
        200: response_model_list_example(EXAMPLE_LISTS["teacher_students"]),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        422: response_example(codes.VALIDATION_ERROR),
    },
)
async def list_teachers(
    status: str | None = Query(default=None, description="pending|confirmed"),
    db: AsyncSession = Depends(get_db),
    student: User = Depends(require_role(UserRole.student)),
):
    service = TeacherStudentsService(UsersRepo(db), TeacherStudentsRepo(db))

    status_enum = None
    if status is not None:
        if status not in ("pending", "confirmed"):
            raise http_error(422, codes.INVALID_STATUS)
        status_enum = TeacherStudentStatus(status)

    return await service.list_for_student(student=student, status=status_enum)


@router.post(
    "/{teacher_id}/confirm",
    response_model=TeacherStudentRead,
    tags=["student"],
    description="Подтвердить связь учитель-ученик",
    responses={
        200: response_model_example(TeacherStudentRead, EXAMPLE_TEACHER_STUDENT_READ),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.LINK_NOT_FOUND),
    },
)
async def confirm_teacher_link(
    teacher_id: int,
    db: AsyncSession = Depends(get_db),
    student: User = Depends(require_role(UserRole.student)),
):
    service = TeacherStudentsService(UsersRepo(db), TeacherStudentsRepo(db))
    try:
        return await service.confirm_by_student(student=student, teacher_id=teacher_id)
    except ValueError as e:
        code = str(e)
        if code == codes.LINK_NOT_FOUND:
            raise http_error(404, codes.LINK_NOT_FOUND)
        if code == codes.FORBIDDEN:
            raise http_error(403, codes.FORBIDDEN)
        raise


@router.delete(
    "/{teacher_id}",
    status_code=204,
    tags=["student"],
    description="Отклонить связь учитель-ученик",
    responses={
        204: {"description": "Deleted"},
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.LINK_NOT_FOUND),
    },
)
async def delete_teacher_link(
    teacher_id: int,
    db: AsyncSession = Depends(get_db),
    student: User = Depends(require_role(UserRole.student)),
):
    service = TeacherStudentsService(UsersRepo(db), TeacherStudentsRepo(db))
    try:
        await service.remove_by_student(student=student, teacher_id=teacher_id)
    except ValueError as e:
        code = str(e)
        if code == codes.LINK_NOT_FOUND:
            raise http_error(404, codes.LINK_NOT_FOUND)
        if code == codes.FORBIDDEN:
            raise http_error(403, codes.FORBIDDEN)
        raise
