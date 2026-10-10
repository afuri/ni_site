from datetime import datetime, timezone

from fastapi import APIRouter, Response

from app.schemas.server_time import ServerTimeRead

router = APIRouter(tags=["time"])


@router.get("/time", response_model=ServerTimeRead,
    description="Серверное время UTC для восстановления локального отсчёта после сна. Не обращается к БД или Redis.",
    responses={200: {"headers": {"X-Server-Time": {
        "description": "UTC Unix timestamp в миллисекундах на момент отправки ответа.",
        "schema": {"type": "integer"},
    }}}})
async def server_time(response: Response) -> ServerTimeRead:
    response.headers["Cache-Control"] = "no-store"
    return ServerTimeRead(server_now=datetime.now(timezone.utc))
