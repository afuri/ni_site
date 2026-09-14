from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import error_codes as codes
from app.core.deps import get_db, get_read_db
from app.core.deps_auth import get_current_user
from app.core.errors import http_error
from app.models.user import User
from app.repos.school_submissions import SchoolSubmissionsRepo
from app.schemas.school_submission import SchoolSubmissionCreate, SchoolSubmissionRead
from app.services.school_submissions import SchoolSubmissionsService


router = APIRouter(prefix="/users/me", tags=["users"])


@router.get("/school-submission", response_model=SchoolSubmissionRead | None)
async def get_my_school_submission(
    db: AsyncSession = Depends(get_read_db),
    user: User = Depends(get_current_user),
):
    return await SchoolSubmissionsRepo(db).latest_for_user(user.id)


@router.post("/school-submissions", response_model=SchoolSubmissionRead, status_code=201)
async def create_my_school_submission(
    payload: SchoolSubmissionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return await SchoolSubmissionsService(db).create(user=user, data=payload.model_dump(mode="json"))
    except ValueError as exc:
        code = str(exc)
        if code in {codes.REGION_NOT_FOUND, codes.USER_NOT_FOUND}:
            raise http_error(404, code)
        if code in {codes.SCHOOL_SUBMISSION_EXISTS, codes.SCHOOL_PROFILE_REQUIRED, codes.REGION_INACTIVE}:
            raise http_error(409, code)
        raise
