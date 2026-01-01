from fastapi import APIRouter
from .health import router as health_router
from .auth import router as auth_router
from .olympiads import router as olympiads_router
from .attempts import router as attempts_router
from .teacher import router as teacher_router
from app.api.v1.users import router as users_router
from app.api.v1.teacher_students import router as teacher_students_router




router = APIRouter(prefix="/api/v1")
router.include_router(health_router)
router.include_router(auth_router)
router.include_router(olympiads_router, tags=["olympiads"])
router.include_router(attempts_router)
router.include_router(teacher_router, tags=["teacher"])
router.include_router(users_router, tags=["users"])
router.include_router(teacher_students_router, tags=["teacher_students"])