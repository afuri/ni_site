from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[2] / "backend"))

from app.services.attempts import AttemptsService


def test_result_percent_rounding():
    service = AttemptsService(None)
    assert service._result_percent(0, 0) == 0
    assert service._result_percent(5, 10) == 50
    assert service._result_percent(1, 3) == 33
