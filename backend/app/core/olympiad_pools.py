from app.core.age_groups import normalize_age_group

SUBJECT_MATH = "math"
SUBJECT_CS = "cs"
SUBJECT_TRIAL = "trial"

ALLOWED_SUBJECTS = {SUBJECT_MATH, SUBJECT_CS, SUBJECT_TRIAL}


def normalize_subject(value: str) -> str:
    if value is None:
        raise ValueError("invalid_subject")
    text = str(value).strip().lower()
    if text not in ALLOWED_SUBJECTS:
        raise ValueError("invalid_subject")
    return text


def normalize_grade_group(value: str) -> str:
    normalized = normalize_age_group(value)
    if normalized == "1,2,3,4,5,6,7,8":
        return "1-8"
    return normalized
