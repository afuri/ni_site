ERROR_EXAMPLES = {
    "missing_token": {"error": {"code": "missing_token", "message": "missing_token"}},
    "invalid_token": {"error": {"code": "invalid_token", "message": "invalid_token", "details": {}}},
    "invalid_credentials": {"error": {"code": "invalid_credentials", "message": "invalid_credentials"}},
    "email_not_verified": {"error": {"code": "email_not_verified", "message": "email_not_verified"}},
    "weak_password": {"error": {"code": "weak_password", "message": "weak_password", "details": {}}},
    "validation_error": {"error": {"code": "validation_error", "message": "validation_error", "details": []}},
    "forbidden": {"error": {"code": "forbidden", "message": "forbidden"}},
    "login_taken": {"error": {"code": "login_taken", "message": "login_taken"}},
    "email_taken": {"error": {"code": "email_taken", "message": "email_taken"}},
    "user_not_found": {"error": {"code": "user_not_found", "message": "user_not_found"}},
    "user_not_teacher": {"error": {"code": "user_not_teacher", "message": "user_not_teacher"}},
    "already_moderator": {"error": {"code": "already_moderator", "message": "already_moderator"}},
    "task_not_found": {"error": {"code": "task_not_found", "message": "task_not_found"}},
    "olympiad_not_found": {"error": {"code": "olympiad_not_found", "message": "olympiad_not_found"}},
    "attempt_not_found": {"error": {"code": "attempt_not_found", "message": "attempt_not_found"}},
    "attempt_expired": {"error": {"code": "attempt_expired", "message": "attempt_expired"}},
    "attempt_not_active": {"error": {"code": "attempt_not_active", "message": "attempt_not_active"}},
    "olympiad_not_available": {"error": {"code": "olympiad_not_available", "message": "olympiad_not_available"}},
    "olympiad_not_published": {"error": {"code": "olympiad_not_published", "message": "olympiad_not_published"}},
    "olympiad_has_no_tasks": {"error": {"code": "olympiad_has_no_tasks", "message": "olympiad_has_no_tasks"}},
    "invalid_answer_payload": {"error": {"code": "invalid_answer_payload", "message": "invalid_answer_payload"}},
    "invalid_availability": {"error": {"code": "invalid_availability", "message": "invalid_availability"}},
    "cannot_change_published_rules": {
        "error": {"code": "cannot_change_published_rules", "message": "cannot_change_published_rules"}
    },
    "cannot_modify_published": {"error": {"code": "cannot_modify_published", "message": "cannot_modify_published"}},
    "cannot_publish_empty": {"error": {"code": "cannot_publish_empty", "message": "cannot_publish_empty"}},
    "content_not_found": {"error": {"code": "content_not_found", "message": "content_not_found"}},
    "news_images_forbidden": {"error": {"code": "news_images_forbidden", "message": "news_images_forbidden"}},
    "news_body_too_long": {"error": {"code": "news_body_too_long", "message": "news_body_too_long"}},
    "article_body_too_short": {"error": {"code": "article_body_too_short", "message": "article_body_too_short"}},
    "invalid_prefix": {"error": {"code": "invalid_prefix", "message": "invalid_prefix"}},
    "content_type_not_allowed": {"error": {"code": "content_type_not_allowed", "message": "content_type_not_allowed"}},
    "storage_unavailable": {"error": {"code": "storage_unavailable", "message": "storage_unavailable"}},
    "student_not_found": {"error": {"code": "student_not_found", "message": "student_not_found"}},
    "link_not_found": {"error": {"code": "link_not_found", "message": "link_not_found"}},
    "cannot_attach_self": {"error": {"code": "cannot_attach_self", "message": "cannot_attach_self"}},
    "not_a_student": {"error": {"code": "not_a_student", "message": "not_a_student"}},
}


def response_example(code: str) -> dict:
    return {
        "model": dict,
        "content": {"application/json": {"example": ERROR_EXAMPLES[code]}},
    }


def response_examples(*codes: str) -> dict:
    return {
        "model": dict,
        "content": {
            "application/json": {
                "examples": {code: {"value": ERROR_EXAMPLES[code]} for code in codes}
            }
        },
    }
