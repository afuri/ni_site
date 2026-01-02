from pathlib import Path
import sys


sys.path.append(str(Path(__file__).resolve().parents[2] / "backend"))

from app.models.task import TaskType
from app.services.attempts import AttemptsService


def test_single_choice_grading():
    service = AttemptsService(None)
    payload = {"options": [{"id": "A"}, {"id": "B"}], "correct_option_id": "B"}
    assert service._grade_task(TaskType.single_choice, payload, {"choice_id": "B"}) is True
    assert service._grade_task(TaskType.single_choice, payload, {"choice_id": "A"}) is False


def test_multi_choice_grading():
    service = AttemptsService(None)
    payload = {"options": [{"id": "A"}, {"id": "B"}, {"id": "C"}], "correct_option_ids": ["A", "C"]}
    assert service._grade_task(TaskType.multi_choice, payload, {"choice_ids": ["C", "A"]}) is True
    assert service._grade_task(TaskType.multi_choice, payload, {"choice_ids": ["A"]}) is False


def test_short_text_int_float_text():
    service = AttemptsService(None)

    int_payload = {"subtype": "int", "expected": "10"}
    assert service._grade_task(TaskType.short_text, int_payload, {"text": "10"}) is True
    assert service._grade_task(TaskType.short_text, int_payload, {"text": "11"}) is False

    float_payload = {"subtype": "float", "expected": "1.5", "epsilon": 0.1}
    assert service._grade_task(TaskType.short_text, float_payload, {"text": "1,55"}) is True
    assert service._grade_task(TaskType.short_text, float_payload, {"text": "1.8"}) is False

    text_payload = {"subtype": "text", "expected": "Ответ", "case_insensitive": True, "collapse_spaces": True}
    assert service._grade_task(TaskType.short_text, text_payload, {"text": "оТвет"}) is True
    assert service._grade_task(TaskType.short_text, text_payload, {"text": "не ответ"}) is False
