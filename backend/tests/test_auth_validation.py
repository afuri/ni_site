from pathlib import Path
import sys

import pytest
from pydantic import ValidationError


sys.path.append(str(Path(__file__).resolve().parents[2] / "backend"))

from app.schemas.auth import RegisterRequest


def _base_payload(role: str) -> dict:
    return {
        "login": "Test1",
        "password": "password123",
        "role": role,
        "email": "test@example.com",
        "surname": "Иванов",
        "name": "Иван",
        "father_name": "Иванович",
        "country": "Россия",
        "city": "Москва",
        "school": "Школа",
        "class_grade": 5,
        "subject": "Математика",
    }


def test_student_requires_class_grade():
    payload = _base_payload("student")
    payload["class_grade"] = None
    payload["subject"] = None
    with pytest.raises(ValidationError):
        RegisterRequest(**payload)


def test_student_forbids_subject():
    payload = _base_payload("student")
    obj = RegisterRequest(**payload)
    assert obj.subject is None


def test_teacher_requires_subject():
    payload = _base_payload("teacher")
    payload["class_grade"] = None
    payload["subject"] = None
    RegisterRequest(**payload)


def test_teacher_payload_ok():
    payload = _base_payload("teacher")
    payload["class_grade"] = None
    RegisterRequest(**payload)


def test_cyrillic_validation():
    payload = _base_payload("teacher")
    payload["class_grade"] = None
    payload["surname"] = "Ivanov"
    with pytest.raises(ValidationError):
        RegisterRequest(**payload)
