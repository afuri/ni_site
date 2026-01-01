"""Teacher endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.core.deps_auth import require_role
from app.models.user import UserRole, User
from app.repos.attempts import AttemptsRepo
from app.repos.olympiads import OlympiadsRepo

router = APIRouter(prefix="/teacher")


@router.get("/olympiads/{olympiad_id}/attempts")
async def list_attempts_for_olympiad(
    olympiad_id: int,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_role(UserRole.teacher, UserRole.admin)),
):
    olymp_repo = OlympiadsRepo(db)
    olympiad = await olymp_repo.get_by_id(olympiad_id)
    if not olympiad:
        raise HTTPException(status_code=404, detail="olympiad_not_found")

    # доступ только владельцу (или админ)
    if teacher.role != UserRole.admin and olympiad.created_by_user_id != teacher.id:
        raise HTTPException(status_code=403, detail="forbidden")

    attempts_repo = AttemptsRepo(db)
    attempts = await attempts_repo.list_attempts_for_olympiad(olympiad_id)

    # MVP: без join к users (можно добавить позже)
    return [
        {
            "id": a.id,
            "user_id": a.user_id,
            "status": a.status,
            "started_at": a.started_at,
            "deadline_at": a.deadline_at,
            "duration_sec": a.duration_sec,
        }
        for a in attempts
    ]
