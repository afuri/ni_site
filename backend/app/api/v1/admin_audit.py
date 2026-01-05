import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.core.deps_auth import require_role
from app.models.user import UserRole, User
from app.repos.audit_logs import AuditLogsRepo
from app.schemas.audit import AuditLogRead
from app.api.v1.openapi_errors import response_example
from app.api.v1.openapi_examples import EXAMPLE_LISTS, response_model_list_example
from app.core import error_codes as codes

router = APIRouter(prefix="/admin/audit-logs")


@router.get(
    "",
    response_model=list[AuditLogRead],
    tags=["admin"],
    description="Список записей аудита",
    responses={
        200: response_model_list_example(EXAMPLE_LISTS["audit_logs"]),
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
    },
)
async def list_audit_logs(
    user_id: int | None = Query(default=None),
    action: str | None = Query(default=None),
    status_code: int | None = Query(default=None),
    from_dt: datetime | None = Query(default=None),
    to_dt: datetime | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    repo = AuditLogsRepo(db)
    return await repo.list(
        user_id=user_id,
        action=action,
        status_code=status_code,
        from_dt=from_dt,
        to_dt=to_dt,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/export",
    tags=["admin"],
    description="Выгрузка аудита в CSV",
    responses={
        401: response_example(codes.MISSING_TOKEN),
        403: response_example(codes.FORBIDDEN),
    },
)
async def export_audit_logs(
    user_id: int | None = Query(default=None),
    action: str | None = Query(default=None),
    status_code: int | None = Query(default=None),
    from_dt: datetime | None = Query(default=None),
    to_dt: datetime | None = Query(default=None),
    limit: int = Query(default=1000, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    repo = AuditLogsRepo(db)
    rows = await repo.list(
        user_id=user_id,
        action=action,
        status_code=status_code,
        from_dt=from_dt,
        to_dt=to_dt,
        limit=limit,
        offset=offset,
    )

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "id",
            "user_id",
            "action",
            "method",
            "path",
            "status_code",
            "ip",
            "user_agent",
            "request_id",
            "created_at",
        ]
    )
    for row in rows:
        writer.writerow(
            [
                row.id,
                row.user_id or "",
                row.action,
                row.method,
                row.path,
                row.status_code,
                row.ip or "",
                row.user_agent or "",
                row.request_id or "",
                row.created_at.isoformat(),
            ]
        )

    content = buf.getvalue()
    headers = {"Content-Disposition": "attachment; filename=audit_logs.csv"}
    return Response(content=content, media_type="text/csv", headers=headers)
