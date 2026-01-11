from __future__ import annotations

from collections.abc import Iterable

ALLOWED_CLASS_GRADES = set(range(1, 9))


def parse_class_grades(value) -> list[int]:
    if value is None:
        return []
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        if "," in text:
            parts: Iterable[str | int] = [chunk.strip() for chunk in text.split(",") if chunk.strip()]
        elif "-" in text:
            start_raw, end_raw = [chunk.strip() for chunk in text.split("-", 1)]
            start = int(start_raw)
            end = int(end_raw)
            if end < start:
                raise ValueError("invalid_range")
            parts = list(range(start, end + 1))
        else:
            parts = [text]
    elif isinstance(value, Iterable) and not isinstance(value, (bytes, bytearray)):
        parts = list(value)
    else:
        parts = [value]

    grades: list[int] = []
    for item in parts:
        if isinstance(item, str):
            item = item.strip()
        if item == "":
            continue
        try:
            grade = int(item)
        except (TypeError, ValueError) as exc:
            raise ValueError("invalid_grade") from exc
        if grade not in ALLOWED_CLASS_GRADES:
            raise ValueError("invalid_grade")
        grades.append(grade)
    unique = sorted(set(grades))
    if not unique:
        raise ValueError("empty_grades")
    return unique


def serialize_class_grades(grades: Iterable[int]) -> str:
    unique = sorted(set(grades))
    if unique == [1]:
        return "1"
    if unique == [2]:
        return "2"
    if unique == [3, 4]:
        return "3-4"
    if unique == [5, 6]:
        return "5-6"
    if unique == [7, 8]:
        return "7-8"
    return ",".join(str(value) for value in unique)


def normalize_age_group(value) -> str:
    grades = parse_class_grades(value)
    return serialize_class_grades(grades)


def class_grades_allow(value, class_grade: int | None) -> bool:
    if class_grade is None:
        return False
    grades = parse_class_grades(value)
    return class_grade in grades
