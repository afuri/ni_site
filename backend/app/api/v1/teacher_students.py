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
from app.api.v1.openapi_errors import response_example, response_examples
from app.core import error_codes as codes

router = APIRouter(prefix="/teacher/students")


@router.post(
    "",
    response_model=TeacherStudentRead,
    status_code=201,
    tags=["teacher"],
    description="Создать или прикрепить ученика к учителю",
    responses={
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.STUDENT_NOT_FOUND),
        409: response_examples(codes.CANNOT_ATTACH_SELF, codes.NOT_A_STUDENT),
        422: response_example(codes.VALIDATION_ERROR),
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
        raise http_error(422, codes.PROVIDE_CREATE_OR_ATTACH)

    try:
        if payload.attach is not None:
            link = await service.attach_existing(teacher=teacher, student_login=payload.attach.student_login)
            return link

        # create mode
        link, _student = await service.create_and_attach(teacher=teacher, payload=payload.create.model_dump())
        return link

    except ValueError as e:
        code = str(e)
        if code == codes.STUDENT_NOT_FOUND:
            raise http_error(404, codes.STUDENT_NOT_FOUND)
        if code == codes.CANNOT_ATTACH_SELF:
            raise http_error(409, codes.CANNOT_ATTACH_SELF)
        if code == codes.NOT_A_STUDENT:
            raise http_error(409, codes.NOT_A_STUDENT)
        if code == codes.LOGIN_TAKEN:
            raise http_error(409, codes.LOGIN_TAKEN)
        if code == codes.EMAIL_TAKEN:
            raise http_error(409, codes.EMAIL_TAKEN)
        if code in (
            codes.CLASS_GRADE_REQUIRED,
            codes.SUBJECT_REQUIRED,
            codes.SUBJECT_NOT_ALLOWED_FOR_STUDENT,
            codes.CLASS_GRADE_NOT_ALLOWED_FOR_TEACHER,
        ):
            raise http_error(422, code)
        raise


@router.post(
    "/{student_id}/confirm",
    response_model=TeacherStudentRead,
    tags=["teacher"],
    description="Подтвердить связь учитель-ученик",
    responses={
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        404: response_example(codes.LINK_NOT_FOUND),
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
        if code == codes.LINK_NOT_FOUND:
            raise http_error(404, codes.LINK_NOT_FOUND)
        raise


@router.get(
    "",
    response_model=list[TeacherStudentRead],
    tags=["teacher"],
    description="Список учеников учителя",
    responses={
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
        422: response_example(codes.VALIDATION_ERROR),
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
            raise http_error(422, codes.INVALID_STATUS)
        status_enum = TeacherStudentStatus(status)

    return await service.list(teacher=teacher, status=status_enum)
