def response_model_example(model, example: dict) -> dict:
    return {
        "model": model,
        "content": {"application/json": {"example": example}},
    }


def response_model_list_example(example: list) -> dict:
    return {"content": {"application/json": {"example": example}}}


def response_payload_example(example: dict) -> dict:
    return {"content": {"application/json": {"example": example}}}


EXAMPLE_USER_READ: dict = {
    "id": 1,
    "login": "student01",
    "email": "student01@example.com",
    "role": "student",
    "is_active": True,
    "is_email_verified": True,
    "must_change_password": False,
    "is_moderator": False,
    "moderator_requested": False,
    "surname": "Ivanov",
    "name": "Ivan",
    "father_name": None,
    "country": "Russia",
    "city": "Moscow",
    "school": "School 1",
    "class_grade": 7,
    "gender": "male",
    "subscription": 0,
    "manual_teachers": [{"id": 1, "full_name": "Иванов Иван Иванович", "subject": "Math"}],
    "subject": None,
}

EXAMPLE_TOKEN_PAIR: dict = {
    "access_token": "access.jwt.token",
    "refresh_token": "refresh.jwt.token",
    "token_type": "bearer",
    "must_change_password": False,
}

EXAMPLE_TASK_READ: dict = {
    "id": 10,
    "subject": "math",
    "title": "2+2",
    "content": "2+2?",
    "task_type": "single_choice",
    "image_key": None,
    "payload": {"options": [{"id": "a", "text": "4"}, {"id": "b", "text": "5"}], "correct_option_id": "a"},
    "created_by_user_id": 1,
}

EXAMPLE_OLYMPIAD_READ: dict = {
    "id": 5,
    "title": "Olympiad 7-8",
    "description": "Math practice",
    "scope": "global",
    "age_group": "7-8",
    "attempts_limit": 1,
    "duration_sec": 600,
    "available_from": "2026-01-05T09:00:00Z",
    "available_to": "2026-01-05T18:00:00Z",
    "pass_percent": 60,
    "is_published": True,
    "created_by_user_id": 1,
}

EXAMPLE_OLYMPIAD_TASK_READ: dict = {
    "id": 12,
    "olympiad_id": 5,
    "task_id": 10,
    "sort_order": 1,
    "max_score": 1,
}

EXAMPLE_OLYMPIAD_TASK_FULL_READ_LIST: list = [
    {
        "task_id": 10,
        "sort_order": 1,
        "max_score": 1,
        "task": EXAMPLE_TASK_READ,
    }
]

EXAMPLE_CONTENT_READ: dict = {
    "id": 3,
    "content_type": "article",
    "status": "published",
    "title": "How to prepare",
    "body": "Long article body...",
    "image_keys": ["content/1.jpg"],
    "author_id": 1,
    "published_by_id": 1,
    "published_at": "2026-01-05T10:00:00Z",
    "created_at": "2026-01-05T09:00:00Z",
    "updated_at": "2026-01-05T10:00:00Z",
}

EXAMPLE_ATTEMPT_READ: dict = {
    "id": 7,
    "olympiad_id": 5,
    "user_id": 1,
    "started_at": "2026-01-05T10:00:00Z",
    "deadline_at": "2026-01-05T10:10:00Z",
    "duration_sec": 600,
    "status": "active",
    "score_total": 0,
    "score_max": 1,
    "passed": None,
    "graded_at": None,
}

EXAMPLE_ATTEMPT_VIEW: dict = {
    "attempt": EXAMPLE_ATTEMPT_READ,
    "olympiad_title": "Olympiad 7-8",
    "tasks": [
        {
            "task_id": 10,
            "title": "2+2",
            "content": "2+2?",
            "task_type": "single_choice",
            "image_key": None,
            "payload": {"options": [{"id": "a", "text": "4"}, {"id": "b", "text": "5"}]},
            "sort_order": 1,
            "max_score": 1,
            "current_answer": None,
            "is_correct": True,
        }
    ],
}

EXAMPLE_ATTEMPT_RESULT: dict = {
    "attempt_id": 7,
    "olympiad_id": 5,
    "olympiad_title": "Олимпиада по математике",
    "status": "submitted",
    "score_total": 1,
    "score_max": 1,
    "percent": 100,
    "passed": True,
    "graded_at": "2026-01-05T10:12:00Z",
    "results_released": True,
}

EXAMPLE_TEACHER_ATTEMPT_VIEW: dict = {
    "attempt": {
        "id": 7,
        "olympiad_id": 5,
        "user_id": 1,
        "started_at": "2026-01-05T10:00:00Z",
        "deadline_at": "2026-01-05T10:10:00Z",
        "duration_sec": 600,
        "status": "submitted",
        "score_total": 1,
        "score_max": 1,
        "passed": True,
        "graded_at": "2026-01-05T10:12:00Z",
    },
    "user": {
        "id": 1,
        "email": "student01@example.com",
        "role": "student",
        "is_active": True,
    },
    "olympiad_title": "Olympiad 7-8",
    "tasks": [
        {
            "task_id": 10,
            "title": "2+2",
            "content": "2+2?",
            "task_type": "single_choice",
            "sort_order": 1,
            "max_score": 1,
            "answer_payload": {"choice_id": "a"},
            "updated_at": "2026-01-05T10:05:00Z",
        }
    ],
}

EXAMPLE_TEACHER_STUDENT_READ: dict = {
    "id": 1,
    "teacher_id": 2,
    "student_id": 1,
    "status": "confirmed",
    "created_at": "2026-01-05T09:00:00Z",
    "confirmed_at": "2026-01-05T09:10:00Z",
}

EXAMPLE_ADMIN_OTP_RESPONSE: dict = {"sent": True, "otp": "123456"}
EXAMPLE_ADMIN_TEMP_PASSWORD: dict = {"temp_password": "TempPass123"}

EXAMPLE_AUDIT_LOG_READ: dict = {
    "id": 1,
    "user_id": 1,
    "action": "request",
    "method": "POST",
    "path": "/api/v1/admin/tasks",
    "status_code": 201,
    "ip": "127.0.0.1",
    "user_agent": "Mozilla/5.0",
    "request_id": "req-123e4567-e89b-12d3-a456-426614174000",
    "details": {"task_id": 10},
    "created_at": "2026-01-05T10:00:00Z",
}

EXAMPLE_UPLOAD_PRESIGN: dict = {
    "key": "content/2026/01/05/cover.jpg",
    "upload_url": "https://storage.example.com/bucket",
    "headers": {"Content-Type": "image/jpeg"},
    "public_url": "https://cdn.example.com/content/2026/01/05/cover.jpg",
    "expires_in": 3600,
}

EXAMPLE_UPLOAD_PRESIGN_POST: dict = {
    "key": "tasks/2026/01/05/task.png",
    "upload_url": "https://storage.example.com/bucket",
    "fields": {"key": "tasks/2026/01/05/task.png", "policy": "base64-policy", "signature": "signature"},
    "public_url": None,
    "expires_in": 3600,
    "max_size_bytes": 10485760,
}

EXAMPLE_UPLOAD_GET: dict = {
    "url": "https://storage.example.com/bucket/content/2026/01/05/cover.jpg",
    "expires_in": 3600,
}

EXAMPLE_HEALTH_OK: dict = {"status": "ok"}
EXAMPLE_HEALTH_READY_OK: dict = {"status": "ok", "db": True, "read_db": True, "redis": True}
EXAMPLE_HEALTH_READY_FAIL: dict = {"status": "degraded", "db": True, "read_db": False, "redis": False}
EXAMPLE_HEALTH_QUEUES_OK: dict = {"queue": "celery", "length": 0}
EXAMPLE_HEALTH_DEPS_OK: dict = {
    "status": "ok",
    "storage": True,
    "email": True,
    "storage_required": True,
    "email_required": False,
}

EXAMPLE_LISTS: dict = {
    "tasks": [EXAMPLE_TASK_READ],
    "olympiads": [EXAMPLE_OLYMPIAD_READ],
    "olympiad_tasks": [EXAMPLE_OLYMPIAD_TASK_READ],
    "content": [EXAMPLE_CONTENT_READ],
    "attempt_results": [EXAMPLE_ATTEMPT_RESULT],
    "audit_logs": [EXAMPLE_AUDIT_LOG_READ],
    "teacher_students": [EXAMPLE_TEACHER_STUDENT_READ],
    "users": [EXAMPLE_USER_READ],
}
