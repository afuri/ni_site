from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.core.deps_auth import require_role
from app.models.user import UserRole, User
from app.models.teacher_student import TeacherStudentStatus
from app.repos.users import UsersRepo
from app.repos.teacher_students import TeacherStudentsRepo
from app.services.teacher_students import TeacherStudentsService
from app.schemas.teacher_students import TeacherStudentCreateRequest, TeacherStudentRead

router = APIRouter(prefix="/teacher/students")


@router.post("", response_model=TeacherStudentRead, status_code=201)
async def create_or_attach_student(
    payload: TeacherStudentCreateRequest,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    service = TeacherStudentsService(UsersRepo(db), TeacherStudentsRepo(db))

    # validate mode
    if (payload.create is None and payload.attach is None) or (payload.create is not None and payload.attach is not None):
        raise HTTPException(status_code=422, detail="provide_create_or_attach")

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
            raise HTTPException(status_code=404, detail="student_not_found")
        if code == "cannot_attach_self":
            raise HTTPException(status_code=409, detail="cannot_attach_self")
        if code == "not_a_student":
            raise HTTPException(status_code=409, detail="not_a_student")
        if code == "already_attached":
            raise HTTPException(status_code=409, detail="already_attached")
        if code == "login_taken":
            raise HTTPException(status_code=409, detail="login_taken")
        if code == "email_taken":
            raise HTTPException(status_code=409, detail="email_taken")
        if code in (
            "class_grade_required",
            "subject_required",
            "subject_not_allowed_for_student",
            "class_grade_not_allowed_for_teacher",
        ):
            raise HTTPException(status_code=422, detail=code)
        raise


@router.post("/{student_id}/confirm", response_model=TeacherStudentRead)
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
            raise HTTPException(status_code=404, detail="link_not_found")
        if code == "already_confirmed":
            raise HTTPException(status_code=409, detail="already_confirmed")
        raise


@router.get("", response_model=list[TeacherStudentRead])
async def list_students(
    status: str | None = Query(default=None, description="pending|confirmed"),
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    service = TeacherStudentsService(UsersRepo(db), TeacherStudentsRepo(db))

    status_enum = None
    if status is not None:
        if status not in ("pending", "confirmed"):
            raise HTTPException(status_code=422, detail="invalid_status")
        status_enum = TeacherStudentStatus(status)

    return await service.list(teacher=teacher, status=status_enum)
