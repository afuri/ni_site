from app.core import error_codes as codes

ERROR_EXAMPLES = {
    codes.MISSING_TOKEN: {"error": {"code": codes.MISSING_TOKEN, "message": codes.MISSING_TOKEN}},
    codes.INVALID_TOKEN: {"error": {"code": codes.INVALID_TOKEN, "message": codes.INVALID_TOKEN, "details": {}}},
    codes.INVALID_CREDENTIALS: {"error": {"code": codes.INVALID_CREDENTIALS, "message": codes.INVALID_CREDENTIALS}},
    codes.EMAIL_NOT_VERIFIED: {"error": {"code": codes.EMAIL_NOT_VERIFIED, "message": codes.EMAIL_NOT_VERIFIED}},
    codes.WEAK_PASSWORD: {"error": {"code": codes.WEAK_PASSWORD, "message": codes.WEAK_PASSWORD, "details": {}}},
    codes.VALIDATION_ERROR: {"error": {"code": codes.VALIDATION_ERROR, "message": codes.VALIDATION_ERROR, "details": []}},
    codes.FORBIDDEN: {"error": {"code": codes.FORBIDDEN, "message": codes.FORBIDDEN}},
    codes.LOGIN_TAKEN: {"error": {"code": codes.LOGIN_TAKEN, "message": codes.LOGIN_TAKEN}},
    codes.EMAIL_TAKEN: {"error": {"code": codes.EMAIL_TAKEN, "message": codes.EMAIL_TAKEN}},
    codes.USER_NOT_FOUND: {"error": {"code": codes.USER_NOT_FOUND, "message": codes.USER_NOT_FOUND}},
    codes.USER_NOT_TEACHER: {"error": {"code": codes.USER_NOT_TEACHER, "message": codes.USER_NOT_TEACHER}},
    codes.ALREADY_MODERATOR: {"error": {"code": codes.ALREADY_MODERATOR, "message": codes.ALREADY_MODERATOR}},
    codes.TASK_NOT_FOUND: {"error": {"code": codes.TASK_NOT_FOUND, "message": codes.TASK_NOT_FOUND}},
    codes.OLYMPIAD_NOT_FOUND: {"error": {"code": codes.OLYMPIAD_NOT_FOUND, "message": codes.OLYMPIAD_NOT_FOUND}},
    codes.ATTEMPT_NOT_FOUND: {"error": {"code": codes.ATTEMPT_NOT_FOUND, "message": codes.ATTEMPT_NOT_FOUND}},
    codes.ATTEMPT_EXPIRED: {"error": {"code": codes.ATTEMPT_EXPIRED, "message": codes.ATTEMPT_EXPIRED}},
    codes.ATTEMPT_NOT_ACTIVE: {"error": {"code": codes.ATTEMPT_NOT_ACTIVE, "message": codes.ATTEMPT_NOT_ACTIVE}},
    codes.OLYMPIAD_NOT_AVAILABLE: {"error": {"code": codes.OLYMPIAD_NOT_AVAILABLE, "message": codes.OLYMPIAD_NOT_AVAILABLE}},
    codes.OLYMPIAD_NOT_PUBLISHED: {"error": {"code": codes.OLYMPIAD_NOT_PUBLISHED, "message": codes.OLYMPIAD_NOT_PUBLISHED}},
    codes.OLYMPIAD_HAS_NO_TASKS: {"error": {"code": codes.OLYMPIAD_HAS_NO_TASKS, "message": codes.OLYMPIAD_HAS_NO_TASKS}},
    codes.INVALID_ANSWER_PAYLOAD: {"error": {"code": codes.INVALID_ANSWER_PAYLOAD, "message": codes.INVALID_ANSWER_PAYLOAD}},
    codes.INVALID_AVAILABILITY: {"error": {"code": codes.INVALID_AVAILABILITY, "message": codes.INVALID_AVAILABILITY}},
    codes.CANNOT_CHANGE_PUBLISHED_RULES: {
        "error": {"code": codes.CANNOT_CHANGE_PUBLISHED_RULES, "message": codes.CANNOT_CHANGE_PUBLISHED_RULES}
    },
    codes.CANNOT_MODIFY_PUBLISHED: {"error": {"code": codes.CANNOT_MODIFY_PUBLISHED, "message": codes.CANNOT_MODIFY_PUBLISHED}},
    codes.CANNOT_PUBLISH_EMPTY: {"error": {"code": codes.CANNOT_PUBLISH_EMPTY, "message": codes.CANNOT_PUBLISH_EMPTY}},
    codes.CONTENT_NOT_FOUND: {"error": {"code": codes.CONTENT_NOT_FOUND, "message": codes.CONTENT_NOT_FOUND}},
    codes.NEWS_IMAGES_FORBIDDEN: {"error": {"code": codes.NEWS_IMAGES_FORBIDDEN, "message": codes.NEWS_IMAGES_FORBIDDEN}},
    codes.NEWS_BODY_TOO_LONG: {"error": {"code": codes.NEWS_BODY_TOO_LONG, "message": codes.NEWS_BODY_TOO_LONG}},
    codes.ARTICLE_BODY_TOO_SHORT: {"error": {"code": codes.ARTICLE_BODY_TOO_SHORT, "message": codes.ARTICLE_BODY_TOO_SHORT}},
    codes.INVALID_PREFIX: {"error": {"code": codes.INVALID_PREFIX, "message": codes.INVALID_PREFIX}},
    codes.CONTENT_TYPE_NOT_ALLOWED: {"error": {"code": codes.CONTENT_TYPE_NOT_ALLOWED, "message": codes.CONTENT_TYPE_NOT_ALLOWED}},
    codes.STORAGE_UNAVAILABLE: {"error": {"code": codes.STORAGE_UNAVAILABLE, "message": codes.STORAGE_UNAVAILABLE}},
    codes.STUDENT_NOT_FOUND: {"error": {"code": codes.STUDENT_NOT_FOUND, "message": codes.STUDENT_NOT_FOUND}},
    codes.LINK_NOT_FOUND: {"error": {"code": codes.LINK_NOT_FOUND, "message": codes.LINK_NOT_FOUND}},
    codes.CANNOT_ATTACH_SELF: {"error": {"code": codes.CANNOT_ATTACH_SELF, "message": codes.CANNOT_ATTACH_SELF}},
    codes.NOT_A_STUDENT: {"error": {"code": codes.NOT_A_STUDENT, "message": codes.NOT_A_STUDENT}},
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
