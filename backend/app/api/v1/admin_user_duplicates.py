"""Administrator-only read API for possible duplicate student accounts."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_read_db
from app.core.deps_auth import require_role
from app.models.user import UserRole
from app.schemas.user_duplicates import DuplicateCandidatesPage
from app.services.user_duplicates import find_duplicate_candidates


router = APIRouter(prefix="/admin/user-duplicates", tags=["admin"])


@router.get("", response_model=DuplicateCandidatesPage)
async def list_duplicate_candidates(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_read_db),
    _admin=Depends(require_role(UserRole.admin)),
):
    """Return candidate groups only; no automatic decisions or deletion."""
    return await find_duplicate_candidates(db, limit=limit, offset=offset)
