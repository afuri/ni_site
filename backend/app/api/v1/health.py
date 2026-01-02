"""Health check endpoints."""
from fastapi import APIRouter

router = APIRouter()

@router.get("/health", tags=["health"], description="Проверка доступности сервиса")
async def health():
    return {"status": "ok"}
