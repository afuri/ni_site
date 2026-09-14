from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import error_codes as codes
from app.core.deps import get_db, get_read_db
from app.core.deps_auth import require_role
from app.core.errors import http_error
from app.models.school_submission import SchoolSubmissionStatus
from app.models.user import User, UserRole
from app.repos.school_submissions import SchoolSubmissionsRepo
from app.schemas.school_submission import (
    SchoolSubmissionApprovalRead,
    SchoolSubmissionApprove,
    SchoolSubmissionRead,
    SchoolSubmissionReject,
)
from app.services.school_submissions import SchoolSubmissionsService


router = APIRouter(
    prefix="/admin/school-submissions",
    dependencies=[Depends(require_role(UserRole.admin))],
)


def _raise_submission_error(exc: ValueError):
    code = str(exc)
    if code in {codes.SCHOOL_SUBMISSION_NOT_FOUND, codes.SCHOOL_NOT_FOUND, codes.REGION_NOT_FOUND, codes.USER_NOT_FOUND}:
        raise http_error(404, code)
    if code in {codes.SCHOOL_SUBMISSION_NOT_PENDING, codes.SCHOOL_INACTIVE, codes.REGION_INACTIVE}:
        raise http_error(409, code)
    raise exc


@router.get("", response_model=list[SchoolSubmissionRead])
async def list_school_submissions(
    status: SchoolSubmissionStatus | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_read_db),
):
    return await SchoolSubmissionsRepo(db).list(status=status, limit=limit, offset=offset)


@router.post("/{submission_id}/duplicate-candidates", response_model=list[int])
async def preview_duplicate_candidates(
    submission_id: int,
    payload: SchoolSubmissionApprove,
    db: AsyncSession = Depends(get_read_db),
):
    submission = await SchoolSubmissionsRepo(db).get(submission_id)
    if submission is None:
        raise http_error(404, codes.SCHOOL_SUBMISSION_NOT_FOUND)
    if payload.new_school is None:
        return []
    try:
        return await SchoolSubmissionsService(db).duplicate_candidates(data=payload.new_school.model_dump(mode="json"))
    except ValueError as exc:
        _raise_submission_error(exc)


@router.post("/{submission_id}/approve", response_model=SchoolSubmissionApprovalRead)
async def approve_school_submission(
    submission_id: int,
    payload: SchoolSubmissionApprove,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    try:
        submission, duplicate_ids = await SchoolSubmissionsService(db).approve(
            submission_id=submission_id,
            admin=admin,
            existing_school_id=payload.existing_school_id,
            new_school=payload.new_school.model_dump(mode="json") if payload.new_school else None,
        )
        return {"submission": submission, "duplicate_candidate_ids": duplicate_ids}
    except ValueError as exc:
        _raise_submission_error(exc)


@router.post("/{submission_id}/reject", response_model=SchoolSubmissionRead)
async def reject_school_submission(
    submission_id: int,
    payload: SchoolSubmissionReject,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    try:
        return await SchoolSubmissionsService(db).reject(
            submission_id=submission_id,
            admin=admin,
            admin_comment=payload.admin_comment,
        )
    except ValueError as exc:
        _raise_submission_error(exc)
