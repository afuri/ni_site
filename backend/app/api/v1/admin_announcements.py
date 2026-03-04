import csv
from io import StringIO

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import error_codes as codes
from app.core.deps import get_db, get_read_db
from app.core.deps_auth import require_role
from app.core.errors import http_error
from app.models.user import UserRole
from app.repos.announcements import AnnouncementsRepo
from app.schemas.announcements import (
    AnnouncementCampaignCreate,
    AnnouncementCampaignRead,
    AnnouncementCampaignUpdate,
    AnnouncementFallbackRead,
    AnnouncementFallbackUpsert,
    AnnouncementGroupMessageRead,
    AnnouncementGroupMessageUpsert,
    AnnouncementImportResult,
)


router = APIRouter(
    prefix="/admin/announcements",
    dependencies=[Depends(require_role(UserRole.admin))],
)


def _validate_window(starts_at, ends_at) -> None:
    if starts_at and ends_at and starts_at >= ends_at:
        raise http_error(422, codes.VALIDATION_ERROR, "starts_at must be earlier than ends_at")


def _parse_csv_rows(csv_text: str) -> tuple[list[tuple[int, int]], int]:
    rows: list[tuple[int, int]] = []
    invalid = 0
    if not csv_text.strip():
        return rows, invalid

    sample = csv_text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;")
        delimiter = dialect.delimiter
    except Exception:
        delimiter = ","

    reader = csv.reader(StringIO(csv_text), delimiter=delimiter)
    first = True
    for raw in reader:
        if not raw:
            continue
        cols = [c.strip() for c in raw]
        if len(cols) < 2:
            invalid += 1
            continue
        if first:
            first = False
            header0 = cols[0].lower()
            header1 = cols[1].lower()
            if header0 in {"user_id", "userid", "id"} and header1 in {"group", "group_number", "group_id"}:
                continue
        try:
            user_id = int(cols[0])
            group_number = int(cols[1])
        except Exception:
            invalid += 1
            continue
        rows.append((user_id, group_number))
    return rows, invalid


def _ensure_subject(subject: str) -> str:
    normalized = subject.strip().lower()
    if normalized not in {"math", "cs"}:
        raise HTTPException(
            status_code=422,
            detail={"code": codes.ANNOUNCEMENT_INVALID_SUBJECT, "message": "Invalid subject"},
        )
    return normalized


@router.get("/campaigns", response_model=list[AnnouncementCampaignRead], tags=["admin"])
async def list_campaigns(db: AsyncSession = Depends(get_read_db)):
    return await AnnouncementsRepo(db).list_campaigns()


@router.post("/campaigns", response_model=AnnouncementCampaignRead, tags=["admin"])
async def create_campaign(payload: AnnouncementCampaignCreate, db: AsyncSession = Depends(get_db)):
    _validate_window(payload.starts_at, payload.ends_at)
    repo = AnnouncementsRepo(db)
    existing = await repo.get_campaign_by_code(payload.code)
    if existing is not None:
        raise http_error(409, codes.VALIDATION_ERROR, "Campaign code already exists")
    try:
        return await repo.create_campaign(payload.model_dump())
    except IntegrityError:
        raise http_error(409, codes.VALIDATION_ERROR, "Campaign code already exists")


@router.patch("/campaigns/{campaign_id}", response_model=AnnouncementCampaignRead, tags=["admin"])
async def update_campaign(campaign_id: int, payload: AnnouncementCampaignUpdate, db: AsyncSession = Depends(get_db)):
    repo = AnnouncementsRepo(db)
    campaign = await repo.get_campaign(campaign_id)
    if campaign is None:
        raise http_error(404, codes.ANNOUNCEMENT_CAMPAIGN_NOT_FOUND, "Campaign not found")
    patch = payload.model_dump(exclude_unset=True)
    starts = patch.get("starts_at", campaign.starts_at)
    ends = patch.get("ends_at", campaign.ends_at)
    _validate_window(starts, ends)
    return await repo.update_campaign(campaign, patch)


@router.get("/campaigns/{campaign_id}/groups", response_model=list[AnnouncementGroupMessageRead], tags=["admin"])
async def list_group_messages(
    campaign_id: int,
    subject: str | None = Query(default=None),
    db: AsyncSession = Depends(get_read_db),
):
    repo = AnnouncementsRepo(db)
    campaign = await repo.get_campaign(campaign_id)
    if campaign is None:
        raise http_error(404, codes.ANNOUNCEMENT_CAMPAIGN_NOT_FOUND, "Campaign not found")
    norm_subject = _ensure_subject(subject) if subject else None
    return await repo.list_group_messages(campaign_id, norm_subject)


@router.put("/campaigns/{campaign_id}/groups", response_model=AnnouncementGroupMessageRead, tags=["admin"])
async def upsert_group_message(
    campaign_id: int,
    payload: AnnouncementGroupMessageUpsert,
    db: AsyncSession = Depends(get_db),
):
    _validate_window(payload.starts_at, payload.ends_at)
    repo = AnnouncementsRepo(db)
    campaign = await repo.get_campaign(campaign_id)
    if campaign is None:
        raise http_error(404, codes.ANNOUNCEMENT_CAMPAIGN_NOT_FOUND, "Campaign not found")
    return await repo.upsert_group_message(campaign_id, payload.model_dump())


@router.get("/campaigns/{campaign_id}/fallback", response_model=AnnouncementFallbackRead | None, tags=["admin"])
async def get_fallback(campaign_id: int, db: AsyncSession = Depends(get_read_db)):
    repo = AnnouncementsRepo(db)
    campaign = await repo.get_campaign(campaign_id)
    if campaign is None:
        raise http_error(404, codes.ANNOUNCEMENT_CAMPAIGN_NOT_FOUND, "Campaign not found")
    return await repo.get_fallback(campaign_id)


@router.put("/campaigns/{campaign_id}/fallback", response_model=AnnouncementFallbackRead, tags=["admin"])
async def upsert_fallback(
    campaign_id: int,
    payload: AnnouncementFallbackUpsert,
    db: AsyncSession = Depends(get_db),
):
    repo = AnnouncementsRepo(db)
    campaign = await repo.get_campaign(campaign_id)
    if campaign is None:
        raise http_error(404, codes.ANNOUNCEMENT_CAMPAIGN_NOT_FOUND, "Campaign not found")
    return await repo.upsert_fallback(campaign_id, payload.model_dump())


@router.post(
    "/campaigns/{campaign_id}/import/{subject}",
    response_model=AnnouncementImportResult,
    tags=["admin"],
)
async def import_assignments(
    campaign_id: int,
    subject: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    norm_subject = _ensure_subject(subject)
    repo = AnnouncementsRepo(db)
    campaign = await repo.get_campaign(campaign_id)
    if campaign is None:
        raise http_error(404, codes.ANNOUNCEMENT_CAMPAIGN_NOT_FOUND, "Campaign not found")

    content = await file.read()
    try:
        csv_text = content.decode("utf-8-sig")
    except Exception:
        raise http_error(422, codes.VALIDATION_ERROR, "CSV must be UTF-8 encoded")

    rows, invalid_rows = _parse_csv_rows(csv_text)
    stats = await repo.replace_assignments(
        campaign_id=campaign_id,
        subject=norm_subject,
        rows=rows,
        source_file=file.filename or "uploaded.csv",
    )
    stats.total_rows += invalid_rows
    stats.skipped_invalid_format += invalid_rows

    return AnnouncementImportResult(
        campaign_id=campaign_id,
        subject=norm_subject,  # type: ignore[arg-type]
        source_file=file.filename or "uploaded.csv",
        total_rows=stats.total_rows,
        valid_rows=stats.valid_rows,
        inserted_rows=stats.inserted_rows,
        skipped_duplicate_rows=stats.skipped_duplicate_rows,
        skipped_invalid_format=stats.skipped_invalid_format,
        skipped_unknown_user=stats.skipped_unknown_user,
        skipped_not_student=stats.skipped_not_student,
        skipped_group_out_of_range=stats.skipped_group_out_of_range,
    )
