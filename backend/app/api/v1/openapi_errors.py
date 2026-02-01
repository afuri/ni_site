from app.core import error_codes as codes
from app.schemas.errors import ErrorResponse

REQUEST_ID_EXAMPLE = "req-123e4567-e89b-12d3-a456-426614174000"

ERROR_EXAMPLES = {
    codes.MISSING_TOKEN: {"error": {"code": codes.MISSING_TOKEN, "message": codes.MISSING_TOKEN}},
    codes.INVALID_TOKEN: {"error": {"code": codes.INVALID_TOKEN, "message": codes.INVALID_TOKEN, "details": {}}},
    codes.INVALID_CREDENTIALS: {"error": {"code": codes.INVALID_CREDENTIALS, "message": codes.INVALID_CREDENTIALS}},
    codes.INVALID_CURRENT_PASSWORD: {"error": {"code": codes.INVALID_CURRENT_PASSWORD, "message": codes.INVALID_CURRENT_PASSWORD}},
    codes.EMAIL_NOT_VERIFIED: {"error": {"code": codes.EMAIL_NOT_VERIFIED, "message": codes.EMAIL_NOT_VERIFIED}},
    codes.TEMP_PASSWORD_EXPIRED: {"error": {"code": codes.TEMP_PASSWORD_EXPIRED, "message": codes.TEMP_PASSWORD_EXPIRED}},
    codes.WEAK_PASSWORD: {"error": {"code": codes.WEAK_PASSWORD, "message": codes.WEAK_PASSWORD, "details": {}}},
    codes.VALIDATION_ERROR: {"error": {"code": codes.VALIDATION_ERROR, "message": codes.VALIDATION_ERROR, "details": []}},
    codes.RATE_LIMITED: {"error": {"code": codes.RATE_LIMITED, "message": codes.RATE_LIMITED}},
    codes.FORBIDDEN: {"error": {"code": codes.FORBIDDEN, "message": codes.FORBIDDEN}},
    codes.ADMIN_OTP_REQUIRED: {"error": {"code": codes.ADMIN_OTP_REQUIRED, "message": codes.ADMIN_OTP_REQUIRED}},
    codes.ADMIN_OTP_INVALID: {"error": {"code": codes.ADMIN_OTP_INVALID, "message": codes.ADMIN_OTP_INVALID}},
    codes.OTP_UNAVAILABLE: {"error": {"code": codes.OTP_UNAVAILABLE, "message": codes.OTP_UNAVAILABLE}},
    codes.LOGIN_TAKEN: {"error": {"code": codes.LOGIN_TAKEN, "message": codes.LOGIN_TAKEN}},
    codes.EMAIL_TAKEN: {"error": {"code": codes.EMAIL_TAKEN, "message": codes.EMAIL_TAKEN}},
    codes.USER_NOT_FOUND: {"error": {"code": codes.USER_NOT_FOUND, "message": codes.USER_NOT_FOUND}},
    codes.USER_NOT_TEACHER: {"error": {"code": codes.USER_NOT_TEACHER, "message": codes.USER_NOT_TEACHER}},
    codes.PASSWORD_CHANGE_REQUIRED: {"error": {"code": codes.PASSWORD_CHANGE_REQUIRED, "message": codes.PASSWORD_CHANGE_REQUIRED}},
    codes.ALREADY_MODERATOR: {"error": {"code": codes.ALREADY_MODERATOR, "message": codes.ALREADY_MODERATOR}},
    codes.TASK_NOT_FOUND: {"error": {"code": codes.TASK_NOT_FOUND, "message": codes.TASK_NOT_FOUND}},
    codes.TASK_IN_OLYMPIAD: {"error": {"code": codes.TASK_IN_OLYMPIAD, "message": codes.TASK_IN_OLYMPIAD}},
    codes.OLYMPIAD_NOT_FOUND: {"error": {"code": codes.OLYMPIAD_NOT_FOUND, "message": codes.OLYMPIAD_NOT_FOUND}},
    codes.ATTEMPT_NOT_FOUND: {"error": {"code": codes.ATTEMPT_NOT_FOUND, "message": codes.ATTEMPT_NOT_FOUND}},
    codes.ATTEMPT_EXPIRED: {"error": {"code": codes.ATTEMPT_EXPIRED, "message": codes.ATTEMPT_EXPIRED}},
    codes.ATTEMPT_NOT_ACTIVE: {"error": {"code": codes.ATTEMPT_NOT_ACTIVE, "message": codes.ATTEMPT_NOT_ACTIVE}},
    codes.OLYMPIAD_NOT_AVAILABLE: {"error": {"code": codes.OLYMPIAD_NOT_AVAILABLE, "message": codes.OLYMPIAD_NOT_AVAILABLE}},
    codes.OLYMPIAD_AGE_GROUP_MISMATCH: {
        "error": {"code": codes.OLYMPIAD_AGE_GROUP_MISMATCH, "message": codes.OLYMPIAD_AGE_GROUP_MISMATCH}
    },
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
    codes.OLYMPIAD_POOL_NOT_FOUND: {"error": {"code": codes.OLYMPIAD_POOL_NOT_FOUND, "message": codes.OLYMPIAD_POOL_NOT_FOUND}},
    codes.OLYMPIAD_POOL_NOT_ACTIVE: {"error": {"code": codes.OLYMPIAD_POOL_NOT_ACTIVE, "message": codes.OLYMPIAD_POOL_NOT_ACTIVE}},
    codes.OLYMPIAD_POOL_EMPTY: {"error": {"code": codes.OLYMPIAD_POOL_EMPTY, "message": codes.OLYMPIAD_POOL_EMPTY}},
    codes.CLASS_GRADE_REQUIRED: {"error": {"code": codes.CLASS_GRADE_REQUIRED, "message": codes.CLASS_GRADE_REQUIRED}},
    codes.SUBJECT_REQUIRED: {"error": {"code": codes.SUBJECT_REQUIRED, "message": codes.SUBJECT_REQUIRED}},
    codes.SUBJECT_NOT_ALLOWED_FOR_STUDENT: {
        "error": {"code": codes.SUBJECT_NOT_ALLOWED_FOR_STUDENT, "message": codes.SUBJECT_NOT_ALLOWED_FOR_STUDENT}
    },
    codes.CLASS_GRADE_NOT_ALLOWED_FOR_TEACHER: {
        "error": {"code": codes.CLASS_GRADE_NOT_ALLOWED_FOR_TEACHER, "message": codes.CLASS_GRADE_NOT_ALLOWED_FOR_TEACHER}
    },
    codes.INVALID_PREFIX: {"error": {"code": codes.INVALID_PREFIX, "message": codes.INVALID_PREFIX}},
    codes.CONTENT_TYPE_NOT_ALLOWED: {"error": {"code": codes.CONTENT_TYPE_NOT_ALLOWED, "message": codes.CONTENT_TYPE_NOT_ALLOWED}},
    codes.STORAGE_UNAVAILABLE: {"error": {"code": codes.STORAGE_UNAVAILABLE, "message": codes.STORAGE_UNAVAILABLE}},
    codes.STUDENT_NOT_FOUND: {"error": {"code": codes.STUDENT_NOT_FOUND, "message": codes.STUDENT_NOT_FOUND}},
    codes.LINK_NOT_FOUND: {"error": {"code": codes.LINK_NOT_FOUND, "message": codes.LINK_NOT_FOUND}},
    codes.CANNOT_ATTACH_SELF: {"error": {"code": codes.CANNOT_ATTACH_SELF, "message": codes.CANNOT_ATTACH_SELF}},
    codes.NOT_A_STUDENT: {"error": {"code": codes.NOT_A_STUDENT, "message": codes.NOT_A_STUDENT}},
}


def _with_request_id(payload: dict) -> dict:
    return {**payload, "request_id": REQUEST_ID_EXAMPLE}


def response_example(code: str) -> dict:
    return {
        "model": ErrorResponse,
        "content": {"application/json": {"example": _with_request_id(ERROR_EXAMPLES[code])}},
    }


def response_examples(*codes: str) -> dict:
    return {
        "model": ErrorResponse,
        "content": {
            "application/json": {
                "examples": {code: {"value": _with_request_id(ERROR_EXAMPLES[code])} for code in codes}
            }
        },
    }
