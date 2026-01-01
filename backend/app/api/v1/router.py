from fastapi import APIRouter
from .health import router as health_router
from .auth import router as auth_router
from .olympiads import router as olympiads_router
from .attempts import router as attempts_router
from .teacher import router as teacher_router

router = APIRouter(prefix="/api/v1")
router.include_router(health_router)
router.include_router(auth_router)
router.include_router(olympiads_router)
router.include_router(attempts_router)
router.include_router(teacher_router)
