from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_db
from app.core.deps_auth import require_role
from app.core.errors import http_error
from app.models.user import User, UserRole
from app.models.attempt import Attempt
from app.models.teacher_student import TeacherStudent
from app.models.account_deletion import AccountDeletionRequest, AccountDeletionCleanup
from app.repos.users import UsersRepo
from app.schemas.account_deletion import (DeletionConfirmation, AdminDeletionConfirmation, DeletionRequestRead,
    AdminDeletionRequestRead, DeletionPreview, DeletionResult)
from app.services.account_deletion import cleanup_files, erase_database_user

router = APIRouter(tags=["account-deletion"])
member = require_role(UserRole.student, UserRole.teacher)
administrator = require_role(UserRole.admin)


@router.get("/users/me/deletion-request", response_model=DeletionRequestRead | None)
async def get_request(user: User = Depends(member), db: AsyncSession = Depends(get_db)):
    return await db.scalar(select(AccountDeletionRequest).where(AccountDeletionRequest.user_id == user.id))


@router.post("/users/me/deletion-request", response_model=DeletionRequestRead)
async def request_deletion(payload: DeletionConfirmation, user: User = Depends(member), db: AsyncSession = Depends(get_db)):
    if await UsersRepo(db).get_by_id(user.id, for_update=True) is None:
        raise http_error(404, "user_not_found")
    row = await db.scalar(select(AccountDeletionRequest).where(AccountDeletionRequest.user_id == user.id))
    if row is None:
        row = AccountDeletionRequest(user_id=user.id)
        db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/users/me/deletion-request", status_code=204)
async def cancel_request(user: User = Depends(member), db: AsyncSession = Depends(get_db)):
    if await UsersRepo(db).get_by_id(user.id, for_update=True) is None:
        raise http_error(404, "user_not_found")
    await db.execute(delete(AccountDeletionRequest).where(AccountDeletionRequest.user_id == user.id))
    await db.commit()
    return Response(status_code=204)


@router.get("/admin/account-deletions/requests", response_model=list[AdminDeletionRequestRead])
async def list_requests(offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100),
                        admin: User = Depends(administrator), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(AccountDeletionRequest, User.login).join(User, User.id == AccountDeletionRequest.user_id)
        .order_by(AccountDeletionRequest.id).offset(offset).limit(limit))).all()
    return [{"id": row.id, "user_id": row.user_id, "created_at": row.created_at, "login": login} for row, login in rows]


@router.get("/admin/account-deletions/cleanup", response_model=list[int])
async def list_cleanup(admin: User = Depends(administrator), db: AsyncSession = Depends(get_db)):
    return list((await db.scalars(select(AccountDeletionCleanup.user_id).order_by(AccountDeletionCleanup.created_at).limit(100))).all())


@router.post("/admin/account-deletions/{user_id}/cleanup", response_model=DeletionResult)
async def retry_cleanup(user_id: int, admin: User = Depends(administrator), db: AsyncSession = Depends(get_db)):
    return {"user_id": user_id, "files_pending": not await cleanup_files(db, user_id)}


@router.get("/admin/account-deletions/{user_id}", response_model=DeletionPreview)
async def preview(user_id: int, admin: User = Depends(administrator), db: AsyncSession = Depends(get_db)):
    user = await UsersRepo(db).get_by_id(user_id)
    if user is None:
        raise http_error(404, "user_not_found")
    if user.role == UserRole.admin or user.id == admin.id:
        raise http_error(403, "admin_deletion_forbidden")
    return {"user_id": user.id, "login": user.login, "email": user.email,
        "full_name": " ".join(filter(None, [user.surname, user.name, user.father_name])), "role": user.role.value,
        "attempts": await db.scalar(select(func.count()).select_from(Attempt).where(Attempt.user_id == user.id)),
        "links": await db.scalar(select(func.count()).select_from(TeacherStudent).where(or_(TeacherStudent.teacher_id == user.id, TeacherStudent.student_id == user.id)))}


@router.delete("/admin/account-deletions/{user_id}", response_model=DeletionResult,
    description="Безвозвратно удалить аккаунт и связанные данные. При files_pending=true файлы остаются в очереди очистки. request_id обязателен при обработке заявки из списка, чтобы отменённая заявка не была исполнена.")
async def delete_account(user_id: int, payload: AdminDeletionConfirmation, admin: User = Depends(administrator), db: AsyncSession = Depends(get_db)):
    user = await UsersRepo(db).get_by_id(user_id, for_update=True)
    if user is None:
        raise http_error(404, "user_not_found")
    if user.role == UserRole.admin or user.id == admin.id:
        raise http_error(403, "admin_deletion_forbidden")
    if user.login != payload.expected_login:
        raise http_error(409, "deletion_target_changed")
    if payload.request_id is not None:
        request = await db.scalar(select(AccountDeletionRequest).where(AccountDeletionRequest.user_id == user_id, AccountDeletionRequest.id == payload.request_id))
        if request is None:
            raise http_error(409, "deletion_request_cancelled")
    attempt_ids = list((await db.scalars(select(Attempt.id).where(Attempt.user_id == user_id))).all())
    await erase_database_user(db, user, admin.id, attempt_ids)
    return {"user_id": user_id, "files_pending": not await cleanup_files(db, user_id)}
